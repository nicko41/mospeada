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

test('arms rise for actual jumps, diving and touchdown, and sway opposite lateral boost without replacing a grounded gait',async()=>{
  const f=await fixture(),arms=new ArmorArmMotion(f.instance),a=createArmorState({x:0,z:0,height:.8,yaw:0,speed:0}),armor={active:true,state:a}
  const hands=()=>['Left','Right'].map(side=>f.bones.get(`mixamorig${side}Hand`).getWorldPosition(new T.Vector3()))
  const base=hands(),hips=f.bones.get('mixamorigSpine2'),meanX=()=>hands().map(p=>hips.worldToLocal(p)).reduce((sum,p)=>sum+p.x,0)/2
  const baselineX=meanX()
  for(const kind of ['jump','dive','impact']){
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
