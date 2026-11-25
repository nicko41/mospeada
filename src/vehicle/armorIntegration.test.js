import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ArmorController} from './ArmorController.js'
import {ArmorReactiveMotion} from './ArmorReactiveMotion.js'
import {ArmorLandingMotion} from './ArmorLandingMotion.js'
import {ScottArmorBoostMotion} from './ScottArmorBoostMotion.js'
import {ArmorArmMotion} from './ArmorArmMotion.js'
import {advanceArmor,createArmorState} from './armorPhysics.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {updateScottGameplay} from './scottGameplay.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')),flat=(x,z,out)=>{if(out)out.surface='asphalt';return 0}
async function load(p){const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb'].map(load))
async function fixture(){
  const [bike,source]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(source.scene),wrapper=new T.Group(),bones=new Map(),skins=[]
  wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
  const s=createBikeState({x:10,z:20,yaw:.4},rig.metrics,flat);s.speed=24;s.idleBlend=0;s.riderStand=.6;s.airborne=true;s.frontGrounded=s.rearGrounded=false
  const entry={phase:'complete',poseBlend:1,returnFlight:false,actorOffset:new T.Vector3(4,2.4,7),actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}}
  const runtime={state:s,transformEntry:entry,vehicleRig:rig,scottBikeBody:rig.body,paused:false,keys:{}},instance={model,sourceScene:source.scene,sourceClips:source.animations,bones,skins,mixer:new T.AnimationMixer(model),clip:null}
  runtime.scottInstance=instance;const clips=[...source.animations,...parseCycloneScottActions(data)]
  const pose=()=>{rig.update(s,flat,bikeConfig);updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60)}
  pose();return{rig,s,entry,runtime,instance,wrapper,bones,pose,source}
}

test('vertical strafe has stable straight closed/open legs and relinquishes the complete skeleton to directional strafes',async()=>{
 const f=await fixture(),widths=[]
 for(const roll of [.1,.9]){
  let rolls=0
  const motion=new ArmorLandingMotion(f.instance,()=>{rolls++;return roll}),a=createArmorState({x:0,z:0,height:10,yaw:.4,speed:0}),armor={active:true,state:a,sample:flat}
  a.height=10;a.jump={phase:'powered',elapsed:.4,launched:true}
  const base=[...f.bones.values()].map(b=>({b,q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()}))
  const step=paused=>{motion.restore();motion.apply(armor,1/60,paused);f.wrapper.updateMatrixWorld(true)}
  const feet=()=>['Left','Right'].map(side=>f.bones.get(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3()))
  step();assert.equal(a.jump.stance,roll<.5?'closed':'open');widths.push(feet()[0].distanceTo(feet()[1]))
  for(const leg of motion.jumpLegs.filter(r=>r.bone.name.endsWith('Leg')&&!r.thigh))assert.ok(leg.bone.quaternion.angleTo(leg.rest)<1e-7,'Knees use the original straight chain, not air_squat')
  for(const foot of motion.feet){
    const toeForward=new T.Vector3(0,0,1).applyQuaternion(foot.reference.clone().invert()).applyQuaternion(foot.bone.getWorldQuaternion(new T.Quaternion()))
    assert.ok(toeForward.y<-.9,'Mesh boot tips stay down, independent of the rig ankle-to-toe vector')
  }
  for(const [forward,side] of [[1,0],[-1,0],[0,1],[0,-1]]){
   Object.assign(a,{boosting:true,thrustForward:forward,thrustSide:side})
   for(let i=0;i<45;i++)step()
   assert.equal(rolls,1);assert.equal(motion.diagnostics.pose,'strafe');assert.equal(motion.applied,false)
   base.forEach(r=>assert.ok(r.b.quaternion.angleTo(r.q)<1e-7,'Jump must not change any native strafe bone, including ankles'))
   const paused=base.map(r=>r.b.quaternion.clone());for(let i=0;i<5;i++)step(true)
   base.forEach((r,i)=>assert.ok(r.b.quaternion.angleTo(paused[i])<1e-7))
  }
  a.jump.poseCancelled=true;a.boosting=false;for(let i=0;i<60;i++)step()
  assert.equal(motion.diagnostics.pose,'regular');assert.equal(motion.applied,false)
  base.forEach(r=>assert.ok(r.b.quaternion.angleTo(r.q)<1e-7,'Releasing horizontal boost retains the regular pose until this flight ends'))
  motion.restore();base.forEach(r=>{assert.ok(r.b.quaternion.angleTo(r.q)<1e-7);assert.deepEqual(r.b.position,r.p);assert.deepEqual(r.b.scale,r.s)})
  a.jump={phase:'powered',elapsed:.4,launched:true};step();assert.equal(rolls,2);motion.restore()
 }
 assert.ok(widths[1]>widths[0]+.25,`Open stance must be visibly wider: ${widths}`)
})
test('Armor activation absorbs the presentation offset once and preserves Scott world placement and original skin',async()=>{
  const f=await fixture(),hip=f.bones.get('mixamorigHips').getWorldPosition(new T.Vector3()),head=f.bones.get('mixamorigHead').getWorldPosition(new T.Vector3()),offset=f.entry.actorOffset.clone(),old={x:f.s.x,z:f.s.z,y:f.s.height}
  const geometry=f.instance.skins[0].mesh.geometry,weights=geometry.attributes.skinWeight.array.slice(),controller=new ArmorController(f.runtime,f.rig,flat,()=>true);f.runtime.armorController=controller
  assert.ok(controller.activate());assert.equal(controller.state.mode,'ARMOR_HOVER')
  assert.equal(f.entry.actorOffset.length(),0);assert.equal(f.s.x,old.x+offset.x);assert.equal(f.s.z,old.z+offset.z);assert.equal(f.s.height,old.y+offset.y)
  f.pose();assert.ok(f.bones.get('mixamorigHips').getWorldPosition(new T.Vector3()).distanceTo(hip)<1e-7);assert.ok(f.bones.get('mixamorigHead').getWorldPosition(new T.Vector3()).distanceTo(head)<1e-7)
  assert.equal(controller.activate(),false);controller.update({forward:1,yaw:.4},1/60);assert.ok(controller.state.speed>0)
  controller.deactivate();assert.equal(controller.active,false);assert.equal(f.instance.armorBaseHipPosition,undefined)
  assert.equal(f.instance.skins[0].mesh.geometry,geometry);assert.deepEqual(geometry.attributes.skinWeight.array,weights)
})
test('reactive animation uses actual acceleration/velocity, remains additive and does not move mechanical pieces or bones positions',async()=>{
  const f=await fixture(),reaction=new ArmorReactiveMotion(f.instance,f.wrapper),a=createArmorState({x:0,z:0,height:.8,yaw:0,speed:0})
  const base=[...f.bones.values()].map(b=>({b,q:b.quaternion.clone(),p:b.position.toArray(),s:b.scale.toArray()})),meshMatrices=f.rig.surfaces.map(m=>m.matrixWorld.toArray())
  for(let i=0;i<120;i++){reaction.restore();advanceArmor(a,{side:1,forward:1,boost:true,rise:i<30},1/60,flat);reaction.apply(a,1/60,false)}
  assert.ok(reaction.diagnostics.boost>.6&&reaction.diagnostics.lean>.10);assert.ok(Math.abs(reaction.diagnostics.bank)>.02)
  for(const r of base){assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.scale.toArray(),r.s)}
  f.rig.surfaces.forEach((m,i)=>assert.deepEqual(m.matrixWorld.elements,meshMatrices[i]))
  const paused=[...f.bones.values()].map(b=>b.quaternion.toArray());reaction.restore();reaction.apply(a,1/60,true);[...f.bones.values()].forEach((b,i)=>assert.deepEqual(b.quaternion.toArray(),paused[i]))
  reaction.restore();for(const r of base)assert.deepEqual(r.b.quaternion.toArray(),r.q.toArray())
  const blocked={...a,localForward:0,forwardAcceleration:0,boostBlend:1,localSide:0,sideAcceleration:0,ay:0,vy:0}
  for(let i=0;i<120;i++){reaction.restore();reaction.apply(blocked,1/60,false)}assert.ok(reaction.diagnostics.boost<.001,'No canned boost posture when the controller actually cannot move')
  reaction.restore()
})

test('lateral boost moves BOTH feet opposite the impulse and mildly bends only the leg on the thrust side; reverse leans oppositely',async()=>{
  const f=await fixture(),reaction=new ArmorReactiveMotion(f.instance,f.wrapper),legs=new ScottArmorBoostMotion(f.instance,f.wrapper)
  const sideAxis=new T.Vector3(1,0,0).transformDirection(f.instance.model.matrixWorld)
  const foot=side=>f.bones.get(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3()).sub(f.bones.get('mixamorigHips').getWorldPosition(new T.Vector3()))
  const knee=side=>{const p=['UpLeg','Leg','Foot'].map(n=>f.bones.get(`mixamorig${side}${n}`).getWorldPosition(new T.Vector3()));return Math.PI-p[0].sub(p[1]).angleTo(p[2].sub(p[1]))}
  const base={Left:foot('Left'),Right:foot('Right')},bend={Left:knee('Left'),Right:knee('Right')}
  for(const side of [-1,1]){
    const a=createArmorState({x:0,z:0,height:.8,yaw:0,speed:0})
    for(let i=0;i<180;i++){reaction.restore();advanceArmor(a,{side,boost:true},1/60,flat);reaction.apply(a,1/60,false)}
    for(const leg of ['Left','Right'])assert.ok(foot(leg).sub(base[leg]).dot(sideAxis)*side>.025,'Right thrust -> both legs left, left thrust -> both legs right')
    const inside=side>0?'Right':'Left',outside=side>0?'Left':'Right'
    assert.ok(knee(inside)>bend[inside]+.04&&knee(inside)<bend[inside]+.65);assert.ok(Math.abs(knee(outside)-bend[outside])<.01)
    reaction.restore()
  }
  for(const forward of [-1,1]){
    const a=createArmorState({x:0,z:0,height:.8,yaw:0,speed:0})
    for(let i=0;i<120;i++){legs.restore();reaction.restore();advanceArmor(a,{forward,boost:true},1/60,flat);reaction.apply(a,1/60,false);legs.apply(f.entry,{boostBlend:reaction.diagnostics.boost,reverseBlend:reaction.diagnostics.reverse})}
    assert.ok(reaction.diagnostics.lean*forward>.12)
    legs.restore();reaction.restore()
  }
})

test('forward and reverse boosts each choose a stable current/open stance per impulse, with smooth opening and unchanged leg chains',async()=>{
 for(const forward of [1,-1]){
  const f=await fixture();let rolls=0
  const legs=new ScottArmorBoostMotion(f.instance,f.wrapper,()=>++rolls===1?.8:.2)
  const state={boostBlend:forward>0?1:0,reverseBlend:forward<0?1:0,boosting:true,thrustForward:forward}
  const base=legs.records.map(r=>({r,p:r.bone.position.toArray(),q:r.bone.quaternion.clone(),s:r.bone.scale.toArray()}))
  const step=(s=state,paused=false)=>{legs.restore();legs.apply(f.entry,s,1/60,paused)}
  const feet=()=>['Left','Right'].map(side=>f.bones.get(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3()))
  for(let i=0;i<60;i++)step()
  assert.equal(rolls,1,'Holding thrust never rerolls each frame');assert.equal(legs.variant,'current')
  const closed=feet(),closedWidth=closed[0].distanceTo(closed[1]),closedPose=legs.records.map(r=>r.bone.quaternion.clone())
  step({...state,boosting:false});assert.equal(rolls,1,'The coast tail retains its choice')
  step();assert.equal(rolls,2);assert.equal(legs.variant,'open');assert.ok(legs.opening>0&&legs.opening<.25,'Blend into the new opening')
  const held=legs.opening;for(let i=0;i<10;i++)step(state,true)
  assert.equal(legs.opening,held);assert.equal(rolls,2,'Pause freezes the pose choice and opening')
  for(let i=0;i<90;i++)step()
  const open=feet();assert.ok(open[0].distanceTo(open[1])>closedWidth+.15,'Both forward and reverse variants visibly spread the feet')
  for(const [i,r]of legs.records.entries()){
   if(r.thigh)assert.ok(r.bone.quaternion.angleTo(closedPose[i])>.4)
   else assert.ok(r.bone.quaternion.angleTo(closedPose[i])<1e-6,'Preserve the approved knee/ankle flexion')
  }
  step({disabled:true});assert.equal(legs.applied,false);assert.equal(legs.opening,0,'Jump and landing retain full ownership immediately')
  for(const {r,p,q,s}of base){assert.deepEqual(r.bone.position.toArray(),p);assert.deepEqual(r.bone.scale.toArray(),s);assert.ok(r.bone.quaternion.angleTo(q)<1e-6)}
 }
})

test('Ground weight/landing is a reversible original squat response; idle soles face forward and align to the actual ground normal',async()=>{
  const f=await fixture(),landing=new ArmorLandingMotion(f.instance),a=createArmorState({x:0,z:0,height:.025,yaw:0,speed:0});a.mode='ARMOR_GROUND';a.grounded=true
  const armor={active:true,state:a,sample:(x,z)=>.08*x},base=[...f.bones.values()].map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}))
  for(let i=0;i<120;i++){landing.restore();landing.apply(armor,1/60,false);f.wrapper.updateMatrixWorld(true)}
  assert.ok(landing.weight>.09&&landing.weight<.11)
  for(const foot of landing.feet){
    const expected=f.instance.model.getWorldQuaternion(new T.Quaternion()).multiply(foot.reference).premultiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(-.08,1,0).normalize()))
    assert.ok(foot.bone.getWorldQuaternion(new T.Quaternion()).angleTo(expected)<1e-4)
  }
  const idle=landing.weight;a.settle=1
  for(let i=0;i<15;i++){landing.restore();landing.apply(armor,1/60,false);f.wrapper.updateMatrixWorld(true)}
  assert.ok(landing.weight>idle+.25,'More knee flexion at touchdown than static stance')
  landing.restore();for(const p of base){assert.ok(p.b.position.distanceTo(p.p)<1e-10);assert.ok(p.b.quaternion.toArray().every((n,i)=>Math.abs(n-p.q.toArray()[i])<1e-10))}
})

test('arms react to diving and touchdown, and sway opposite lateral boost without replacing a grounded gait',async()=>{
  const f=await fixture(),arms=new ArmorArmMotion(f.instance),a=createArmorState({x:0,z:0,height:.8,yaw:0,speed:0}),armor={active:true,state:a}
  const hands=()=>['Left','Right'].map(side=>f.bones.get(`mixamorig${side}Hand`).getWorldPosition(new T.Vector3()))
  const base=hands(),hips=f.bones.get('mixamorigSpine2'),meanX=()=>hands().map(p=>hips.worldToLocal(p)).reduce((sum,p)=>sum+p.x,0)/2
  const baselineX=meanX()
  for(const kind of ['dive','impact']){
    a.jump=kind==='jump'?{phase:'powered'}:null;a.vy=kind==='jump'?10:kind==='dive'?-16:0;a.diveBlend=kind==='dive'?1:0;a.mode=kind==='impact'?'ARMOR_GROUND':'ARMOR_HOVER';a.settle=kind==='impact'?1:0
    for(let i=0;i<100;i++){arms.restore();arms.apply(armor,{bank:0},1/60,false);f.wrapper.updateMatrixWorld(true)}
    assert.ok(hands().every((p,i)=>p.y>base[i].y+.08),kind+' must visibly raise both hands')
    arms.restore();arms.lift=0
  }
  a.mode='ARMOR_HOVER';a.settle=a.diveBlend=0;a.boostBlend=1
  for(const bank of [-.3,.3]){
    for(let i=0;i<100;i++){arms.restore();arms.apply(armor,{bank},1/60,false);f.wrapper.updateMatrixWorld(true)}
    assert.ok((meanX()-baselineX)*bank<0,'Arms compensate in the opposite direction to the lateral impulse')
    arms.restore();arms.sway=0
  }
  a.mode='ARMOR_GROUND';a.boostBlend=0;arms.apply(armor,{bank:0},1/60,false);assert.equal(arms.applied,false)
})

test('pure vertical jump leaves leg posing to the jump layer and sweeps both arms backward',async()=>{
  const f=await fixture(),reaction=new ArmorReactiveMotion(f.instance,f.wrapper),arms=new ArmorArmMotion(f.instance)
  const a=createArmorState({x:0,z:0,height:4,yaw:0,speed:0}),armor={active:true,state:a}
  Object.assign(a,{height:4,vy:10,ay:22,localForward:32,boostBlend:1,jump:{phase:'powered'}})
  const axis=new T.Vector3(0,0,1).transformDirection(f.instance.model.matrixWorld)
  const hand=side=>f.bones.get(`mixamorig${side}Hand`).getWorldPosition(new T.Vector3()).sub(f.bones.get(`mixamorig${side}Shoulder`).getWorldPosition(new T.Vector3())).dot(axis)
  const base=['Left','Right'].map(hand)
  for(let i=0;i<60;i++){arms.restore();reaction.restore();reaction.apply(a,1/60,false);arms.apply(armor,reaction.diagnostics,1/60,false);f.wrapper.updateMatrixWorld(true)}
  assert.ok(reaction.diagnostics.boost>.9);assert.equal(reaction.diagnostics.tuck,0)
  assert.ok(arms.diagnostics.jumpBack>.9)
  for(const [i,side]of ['Left','Right'].entries())assert.ok(hand(side)<base[i]-.08,`${side} arm must sweep backward during the jump`)
})

test('returning from Armor releases its raised pelvis and restores the seated Motorcycle base after landing',async()=>{
  const f=await fixture(),controller=new ArmorController(f.runtime,f.rig,flat,()=>true);f.runtime.armorController=controller
  controller.activate()
  for(let i=0;i<120;i++)f.pose()
  controller.deactivate()
  f.entry.phase='idle';f.entry.poseBlend=0;f.entry.returnFlight=false;f.entry.actorOffset.set(0,0,0)
  Object.assign(f.s,{riderStand:0,airborne:false,frontGrounded:true,rearGrounded:true,boostBlend:0,boostKick:0,frontImpact:0,rearImpact:0,speed:20})
  for(let i=0;i<120;i++)f.pose()
  assert.equal(f.instance.clip,'Cyclone_RidingPose')
  const saved=f.instance.mountedMotion.originals.find(r=>r.b.name==='mixamorigHips').p
  const expected=new T.Vector3().fromArray(data.ridingPose.hips.map(Math.fround))
  assert.ok(saved.distanceTo(expected)<1e-7,`Riding base stayed raised by ${saved.distanceTo(expected)} model units`)
})
