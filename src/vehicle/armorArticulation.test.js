import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {armorConfig} from './armorPhysics.js'
import {ArmorLandingMotion} from './ArmorLandingMotion.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {updateScottGameplay} from './scottGameplay.js'
import {ArmorController} from './ArmorController.js'
import {ArmorArticulation,caballerSettings,armorAttachmentTarget} from './ArmorArticulation.js'
import {FrontBattloidTransform} from './FrontBattloidTransform.js'
import {RearBattloidTransform} from './RearBattloidTransform.js'
import {GuardBattloidTransform} from './GuardBattloidTransform.js'
import {kneeSocketPoint,readKneeSocket} from './scottKneeSockets.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const read=p=>JSON.parse(fs.readFileSync(p)),data=read('public/animations/scott-cyclone-actions.json'),flat=()=>0
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb','public/transformations/cyclone-rear-pieces.glb'].map(load))
const maxError=(a,b)=>Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i])))
async function fixture(){
  const [bike,source,parts]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(source.scene),wrapper=new T.Group(),bones=new Map(),skins=[]
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})});wrapper.add(model)
  const s=createBikeState({x:12,z:-20,yaw:.7},rig.metrics,flat),entry={phase:'complete',poseBlend:1,returnFlight:false,actorOffset:new T.Vector3(),actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}}
  const instance={model,sourceScene:source.scene,sourceClips:source.animations,bones,skins,mixer:new T.AnimationMixer(model),clip:null},clips=[...source.animations,...parseCycloneScottActions(data)]
  const runtime={state:s,vehicleRig:rig,scottBikeBody:rig.body,scottInstance:instance,transformEntry:entry,paused:false,keys:{}}
  const front=new FrontBattloidTransform(rig,instance,read('public/transformations/cyclone-front-battloid.json')),rear=new RearBattloidTransform(rig,front,read('public/transformations/cyclone-rear-battloid.json'),parts.scene),guards=new GuardBattloidTransform(rig,instance,read('public/transformations/cyclone-guard-battloid.json'))
  Object.assign(runtime,{frontTransformation:front,rearTransformation:rear,guardTransformation:guards})
  const base=()=>{rig.update(s,flat,bikeConfig);updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60);front.apply(1);rear.apply(1);guards.apply(1)}
  base();const controller=new ArmorController(runtime,rig,flat,()=>true);runtime.armorController=controller;controller.activate();base()
  const articulation=new ArmorArticulation(runtime)
  const tick=()=>{
    articulation.restore();guards.restore();rear.restore();front.restore();base();articulation.prepare(controller)
    instance.armorLocomotion.apply(controller,1/60,false);instance.armorLanding?.apply(controller,1/60,false);wrapper.updateMatrixWorld(true)
    if(instance.armorLanding)controller.guardFloor(instance,wrapper)
    articulation.apply(controller,entry,1/60)
  }
  tick();return{rig,source,wrapper,bones,instance,controller,entry,articulation,guards,rear,tick}
}

test('caballer preserve the upper pivot and meet the real raised knee discs independently; cuffs preserve their authored offsets',async()=>{
  const f=await fixture(),a=f.articulation
  for(const r of a.records.filter(r=>!a.bindings.some(b=>b.mesh===r.mesh)))assert.ok(maxError(r.mesh.matrix,r.canonical)<1e-7,'Chest/back/cuffs keep their reference placement')
  for(const b of a.bindings){
    const r=a.records.find(r=>r.mesh===b.mesh),originalWorld=b.mesh.parent.matrixWorld.clone().multiply(r.canonical)
    assert.ok(b.top.clone().applyMatrix4(originalWorld).distanceTo(b.top.clone().applyMatrix4(b.mesh.matrixWorld))<1e-7,'Keep the existing upper mechanical pivot')
    assert.ok(b.bottom.clone().applyMatrix4(b.mesh.matrixWorld).distanceTo(kneeSocketPoint(b.skin,b.socket))<1e-7)
    const boneHead=b.knee.getWorldPosition(new T.Vector3())
    assert.ok(kneeSocketPoint(b.skin,b.socket).distanceTo(boneHead)>.08,'Socket is the visible cap, not the approximate joint origin')
  }
  assert.deepEqual(new Set(a.bindings.map(b=>b.side)),new Set(['Left','Right']))
  const before=new Map(a.bindings.map(b=>[b.side,b.mesh.matrixWorld.clone()])),geometry=a.records.map(r=>r.mesh.geometry),unrelated=f.rig.surfaces.filter(m=>!a.records.some(r=>r.mesh===m)).map(m=>({m,world:m.matrixWorld.clone()}))
  a.restore()
  f.bones.get('mixamorigLeftUpLeg').quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.45))
  f.bones.get('mixamorigRightForeArm').quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.4));f.wrapper.updateMatrixWorld(true);a.apply(f.controller,f.entry,1/60)
  const left=a.bindings.find(b=>b.side==='Left'),right=a.bindings.find(b=>b.side==='Right')
  assert.ok(maxError(left.mesh.matrixWorld,before.get('Left'))>.05);assert.ok(maxError(right.mesh.matrixWorld,before.get('Right'))<1e-7)
  assert.ok(a.diagnostics.legs.every(l=>l.error<1e-7))
  for(const g of f.guards.groups){const expected=g.bone.matrixWorld.clone().multiply(g.targetInBone).multiply(g.inversePivot);for(const p of g.parts)assert.ok(maxError(p.mesh.matrixWorld,expected)<1e-7)}
  unrelated.forEach(r=>assert.ok(maxError(r.m.matrixWorld,r.world)<1e-7));a.records.forEach((r,i)=>assert.equal(r.mesh.geometry,geometry[i]))
  caballerSettings.Left.length=.04;a.restore();a.apply(f.controller,f.entry,1/60);assert.ok(Math.abs(a.diagnostics.legs.find(l=>l.side==='Left').error-.04)<1e-6);caballerSettings.Left.length=0
})

test('raised knee sockets are calculated from each original rim and the intersected cap surface, then track the actual skinned triangles',async()=>{
  const f=await fixture()
  for(const side of ['Left','Right']){
    const socket=readKneeSocket(f.source.scene,side),skin=f.instance.skins[0].mesh
    assert.ok(socket.radius>.028&&socket.radius<.031);assert.ok(socket.weights.every(w=>w>=0&&w<=1));assert.ok(Math.abs(socket.weights.reduce((a,b)=>a+b)-1)<1e-10)
    const p=kneeSocketPoint(skin,socket),before=p.clone()
    const knee=f.bones.get(socket.bone);knee.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.35));f.wrapper.updateMatrixWorld(true)
    const expected=socket.triangle.reduce((v,id,i)=>v.addScaledVector(skin.localToWorld(skin.getVertexPosition(id,new T.Vector3())),socket.weights[i]),new T.Vector3())
    assert.ok(kneeSocketPoint(skin,socket).distanceTo(expected)<1e-9);assert.ok(expected.distanceTo(before)>.005)
  }
})

test('the whole torso and backpack inherit the final Spine2 matrix, including parent motion, torsion and translation',async()=>{
  const f=await fixture(),layer=f.articulation,geometry=layer.torso.map(mesh=>mesh.geometry),parents=layer.torso.map(mesh=>mesh.parent)
  const original=layer.torso.map(mesh=>mesh.matrixWorld.clone())
  layer.restore()
  f.bones.get('mixamorigSpine').quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.12))
  f.bones.get('mixamorigSpine2').quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(.24,.14,0)))
  f.bones.get('mixamorigHips').position.y+=1.2;f.wrapper.updateMatrixWorld(true)
  layer.apply(f.controller,f.entry,1/60)
  layer.torsoBindings.forEach((b,i)=>{
    const expected=layer.spine.matrixWorld.clone().multiply(b.inBone)
    assert.ok(maxError(b.mesh.matrixWorld,expected)<1e-7,'Use the complete final bone transform')
    assert.ok(maxError(b.mesh.matrixWorld,original[i])>.001,'Torso Armor must no longer remain frozen')
    assert.equal(b.mesh.geometry,geometry[i]);assert.equal(b.mesh.parent,parents[i])
  })
})

test('Ground uses complete native walk/run tracks through the existing mixer, retains coordination, scales playback by actual speed and blends to idle',async()=>{
  const f=await fixture(),a=f.controller.state,original=f.source.animations.map(c=>c.toJSON())
  const unrelated=f.rig.surfaces.filter(m=>!f.articulation.records.some(r=>r.mesh===m)).map(m=>({m,world:m.matrixWorld.clone()}))
  a.mode='ARMOR_GROUND';a.height=.025;a.speed=2.5
  for(let i=0;i<90;i++)f.tick()
  const loco=f.instance.armorLocomotion
  assert.equal(loco.weight,1);assert.equal(loco.source,'walking_2_inplace');assert.equal(f.instance.clip,'Armor_Walk')
  unrelated.forEach(r=>assert.ok(maxError(r.m.matrixWorld,r.world)<1e-7,'Native locomotion must not alter unrelated assemblies'))
  for(const b of f.articulation.torsoBindings)assert.ok(maxError(b.mesh.matrixWorld,f.articulation.spine.matrixWorld.clone().multiply(b.inBone))<1e-7)
  for(const track of f.instance.action.getClip().tracks.filter(t=>t.name.endsWith('.quaternion'))){
    const expected=new T.Quaternion().fromArray(track.createInterpolant().evaluate(f.instance.action.time)),bone=f.bones.get(track.name.replace('.quaternion',''))
    assert.ok(bone.quaternion.toArray().every((v,i)=>Math.abs(v-expected.toArray()[i])<1e-6),`${bone.name} must preserve the native clip, including torso/head/arms: ${bone.quaternion.toArray()} / ${expected.toArray()}`)
  }
  const rate=f.instance.action.getEffectiveTimeScale();a.speed=1.25;f.tick();assert.ok(Math.abs(f.instance.action.getEffectiveTimeScale()-rate/2)<1e-8)
  a.speed=armorConfig.runSpeed;for(let i=0;i<90;i++)f.tick();assert.equal(loco.source,'Running');assert.equal(f.instance.clip,'Armor_Run');assert.ok(f.articulation.diagnostics.legs.every(l=>l.error<1e-6))
  const runRate=f.instance.action.getEffectiveTimeScale(),runInfo=loco.info.get('Armor_Run')
  assert.ok(runRate>1.9&&runRate<2.2,'An agile run uses about twice the native cadence, with matching controller travel')
  assert.ok(Math.abs(a.speed*f.instance.action.getClip().duration/runRate-runInfo.cycleDistance)<1e-6)
  assert.equal(f.instance.action.getEffectiveWeight(),1)
  assert.equal(f.instance.mixer.clipAction(loco.clips.get('Armor_Walk')).getEffectiveWeight(),0,'Walking must fully leave the running pose')
  for(const track of f.instance.action.getClip().tracks.filter(t=>t.name.endsWith('.quaternion'))){
    const expected=new T.Quaternion().fromArray(track.createInterpolant().evaluate(f.instance.action.time)),bone=f.bones.get(track.name.replace('.quaternion',''))
    assert.ok(bone.quaternion.toArray().every((v,i)=>Math.abs(v-expected.toArray()[i])<1e-6),`${bone.name}: Running retains the complete native body motion`)
  }
  assert.equal(loco.groundGait(3.4),'Armor_Run');assert.equal(loco.groundGait(2.9),'Armor_Walk')
  assert.deepEqual(f.source.animations.map(c=>c.toJSON()),original,'All 16 source clips remain unedited')
  a.speed=0;f.tick();assert.ok(loco.weight<1&&loco.weight>.5);for(let i=0;i<90;i++)f.tick();assert.ok(loco.weight<1e-5)
})

test('releasing the four attachments preserves the visible pose then hands back the unchanged canonical mechanical matrices during boost',async()=>{
  const f=await fixture(),a=f.controller.state;a.mode='ARMOR_GROUND';a.height=.025;a.speed=5.5
  for(let i=0;i<60;i++)f.tick()
  const layer=f.articulation,last=layer.records.map(r=>r.mesh.matrixWorld.clone())
  layer.restore();f.controller.deactivate();f.entry.returnFlight=true
  layer.apply(f.controller,f.entry,0)
  layer.records.forEach((r,i)=>assert.ok(maxError(r.mesh.matrixWorld,last[i])<1e-7,'No release-frame jump'))
  for(let i=0;i<15;i++){layer.restore();layer.apply(f.controller,f.entry,1/60)}
  layer.restore();assert.equal(layer.active,false)
  for(const r of layer.records)assert.ok(maxError(r.mesh.matrix,r.canonical)<1e-7)
})

test('G and Ctrl land through preparation, descent, impact and recovery with real sole contact and all Armor attachments following',async()=>{
  const f=await fixture(),c=f.controller,a=c.state,original=f.source.animations.map(clip=>clip.toJSON())
  f.instance.armorLanding=new ArmorLandingMotion(f.instance)
  for(const reason of ['toggle','dive']){
    Object.assign(a,{mode:'ARMOR_HOVER',y:-a.soleOffset+(reason==='dive'?5:.8),height:reason==='dive'?5:.8,vx:0,vz:0,vy:reason==='dive'?8:0,speed:0,descendHeld:false,jumpHeld:false})
    if(reason==='dive')a.jump={phase:'powered',elapsed:.2,originY:a.y-2,ceilingY:a.y+8}
    c.sync();f.tick()
    if(reason==='toggle')c.toggle()
    const phases=new Set(),yaw=a.yaw;let lowest=Infinity,backward=false,raised=false,peakBend=0
    for(let i=0;i<300;i++){
      c.update({forward:1,side:1,yaw:yaw+1,boost:true,rise:true,descend:reason==='dive'},1/60)
      if(a.groundLanding)phases.add(a.groundLanding.phase)
      f.tick()
      assert.ok(f.articulation.diagnostics.legs.every(l=>l.error<1e-6))
      for(const b of f.articulation.torsoBindings)assert.ok(maxError(b.mesh.matrixWorld,f.articulation.spine.matrixWorld.clone().multiply(b.inBone))<1e-7)
      assert.equal(a.yaw,yaw,'Player steering cannot fight the directed landing')
      if(a.groundLanding?.phase==='descend'){
        const hand=f.bones.get('mixamorigLeftHand').getWorldPosition(new T.Vector3()),shoulder=f.bones.get('mixamorigLeftShoulder').getWorldPosition(new T.Vector3())
        raised||=['Left','Right'].every(side=>f.bones.get('mixamorig'+side+'Hand').getWorldPosition(new T.Vector3()).y>f.bones.get('mixamorig'+side+'Shoulder').getWorldPosition(new T.Vector3()).y+.12)
        backward||=hand.sub(shoulder).dot(new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)))<-.04
      }
      peakBend=Math.max(peakBend,f.instance.armorLanding.weight)
      for(const limb of f.instance.mountedMotion.limbs.filter(l=>l.leg))for(const id of limb.soleIds)lowest=Math.min(lowest,f.instance.skins[0].mesh.localToWorld(f.instance.skins[0].mesh.getVertexPosition(id,new T.Vector3())).y)
      if(!a.groundLanding)break
    }
    assert.deepEqual([...phases],['prepare','descend','impact','recover'])
    if(reason==='dive')assert.ok(raised,'Ctrl raises both hands clearly above shoulder height')
    else assert.ok(backward,'G retains the native backward running swing')
    assert.ok(peakBend>.55&&lowest>=.0079,'Impact bends the knees while the actual soles remain above the terrain')
    assert.equal(a.mode,'ARMOR_GROUND');assert.equal(a.groundLanding,null);assert.ok(a.grounded)
    c.update({rise:true},1/60);assert.equal(a.jump,null,'Held input cannot queue a jump through the landing')
  }
  assert.deepEqual(f.source.animations.map(clip=>clip.toJSON()),original)
})

test('a jump lowers the actual pelvis over planted soles, extends the knees, and only then launches and gathers the legs',async()=>{
  const f=await fixture(),c=f.controller,a=c.state
  f.instance.armorLanding=new ArmorLandingMotion(f.instance)
  Object.assign(a,{mode:'ARMOR_GROUND',y:-a.soleOffset+.025,height:.025,vx:0,vz:0,vy:0,speed:0,jump:null,jumpHeld:false})
  c.sync();for(let i=0;i<30;i++)f.tick()
  const hips=()=>f.bones.get('mixamorigHips').getWorldPosition(new T.Vector3()).y
  const knee=side=>{const [h,k,f1]=['UpLeg','Leg','Foot'].map(s=>f.bones.get(`mixamorig${side}${s}`).getWorldPosition(new T.Vector3()));return Math.PI-h.sub(k).angleTo(f1.sub(k))}
  const start=hips(),phases=new Set();let low=start,maxBend=0,endExtension=Infinity,airBend=0
  for(let i=0;i<65;i++){
    c.update({rise:true},1/60);f.tick();const j=a.jump;phases.add(j?.phase)
    assert.ok(f.articulation.diagnostics.legs.every(l=>l.error<1e-6))
    if(j?.launched===false){
      assert.equal(a.vy,0,'No vertical launch during the preparation')
      low=Math.min(low,hips());maxBend=Math.max(maxBend,Math.min(knee('Left'),knee('Right')))
      for(const limb of f.instance.mountedMotion.limbs.filter(l=>l.leg)){
        const skin=f.instance.skins[0].mesh,min=Math.min(...limb.soleIds.map(id=>skin.localToWorld(skin.getVertexPosition(id,new T.Vector3())).y))
        assert.ok(min>=.0079&&min<.06,`${limb.side} boot clearance during ${j.phase}: ${min}; requested ${j.supportClearance}`)
      }
      if(j.phase==='pushOff')endExtension=Math.min(endExtension,knee('Left'))
    }else if(j?.elapsed>.25)airBend=Math.max(airBend,Math.min(knee('Left'),knee('Right')))
  }
  assert.ok(phases.has('compress')&&phases.has('pushOff')&&phases.has('powered'))
  assert.ok(start-low>.12,`Actual pelvis must visibly lower before takeoff: ${start-low} m`)
  assert.ok(maxBend>.7&&endExtension<maxBend*.5,'Legs visibly load then extend before leaving the floor')
  assert.ok(airBend>.7,'Both actual knees gather again after the impulse')
})


test('returning from Ground walk/run releases native locomotion without a sideways mounting tween or retired clip',async()=>{
  const f=await fixture(),a=f.controller.state,runtime=f.controller.runtime
  a.mode='ARMOR_GROUND';a.height=.025;a.speed=2.5
  for(let i=0;i<30;i++)f.tick()
  assert.equal(f.instance.clip,'Armor_Walk')
  a.speed=armorConfig.runSpeed;f.tick()
  const outgoing=f.instance.retiredActions.map(r=>r.action)
  assert.ok(outgoing.length>0,'Reproduce the native walk/run crossfade at T')
  f.controller.deactivate();Object.assign(f.entry,{returnFlight:true,phase:'returnboost',time:0,returnProgress:0})
  for(let i=0;i<3;i++){
    f.tick()
    assert.equal(f.instance.frameTransition,null,'Do not reuse the on-foot mount wrapper tween')
    assert.equal(f.instance.retiredActions.length,0)
    assert.equal(f.instance.clip,'Cyclone_RidingPose')
    assert.ok(outgoing.every(action=>!action.isScheduled()),'Old locomotion must no longer contribute to the return pose')
    const expected=runtime.scottBikeBody.localToWorld(new T.Vector3().fromArray(data.actorOrigin))
    assert.ok(f.wrapper.position.distanceTo(expected)<1e-8,'Use the same bike-local origin as the returning assembly')
  }
})


test('caballer and cuffs follow the completed assembly during its departure boost before Armor physics activates',async()=>{
  const f=await fixture(),layer=f.articulation
  layer.restore();f.controller.active=false;Object.assign(f.entry,{phase:'armorboost',returnFlight:false})
  const target=armorAttachmentTarget(f.controller,f.entry)
  assert.equal(target.active,true);assert.equal(target.state,f.entry);assert.equal(f.controller.active,false)
  layer.prepare(target)
  const binding=layer.bindings[0],canonical=layer.records.find(r=>r.mesh===binding.mesh).canonical.clone()
  f.bones.get('mixamorigLeftUpLeg').quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(-.28,0,.42)))
  f.bones.get('mixamorigRightUpLeg').quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(-.22,0,-.42)))
  f.bones.get('mixamorigLeftArm').quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(.25,0,.10)))
  f.wrapper.updateMatrixWorld(true);layer.apply(target,f.entry,1/60)
  assert.ok(layer.diagnostics.legs.every(l=>l.error<1e-6),'Both lower ends must still meet their actual knee discs during the booster')
  assert.ok(layer.diagnostics.legs.some(l=>Math.abs(l.lengthScale-1)>.01),'Length adaptation is already active')
  assert.ok(layer.diagnostics.cuffs.every(c=>c.error===0))
  layer.restore();assert.ok(maxError(binding.mesh.matrix,canonical)<1e-7)
  assert.equal(armorAttachmentTarget(f.controller,{phase:'transforming',returnFlight:false}).active,false)
  assert.equal(armorAttachmentTarget(f.controller,{phase:'returnboost',returnFlight:true}).active,false)
})
