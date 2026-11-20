import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { bikeConfig } from './bikeConfig.js'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { createDrivingCyclone } from './createDrivingCyclone.js'
import { FrontTransformEntry, canStartFrontTransformation } from './FrontTransformEntry.js'
import { frontTransformState as store } from './frontTransformState.js'
import { TransformationScottPose } from './TransformationScottPose.js'
import { parseCycloneScottActions } from './cycloneScottActions.js'
import {sampleFrontSequence} from './frontTransformMath.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
async function load(p){const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('public/models/mospeada/scott-bernard-animated-original.glb')])
const flat=(x,z,out)=>{if(out)out.surface='asphalt';return 0}
async function fixture(speed=12){
  const rig=createDrivingCyclone((await assets)[0].scene),s=createBikeState({x:0,z:0,yaw:0},rig.metrics,flat)
  s.speed=speed;s.parked=speed===0;s.idleBlend=speed===0?1:0
  const runtime={state:s};store.bindEntry(null);store.reset();store.set({ready:true,duration:2})
  const entry=new FrontTransformEntry(store,runtime)
  const tick=(input={},dt=1/60)=>{const effective=entry.beforePhysics(input,dt),cfg={...bikeConfig,...entry.physicsConfig};advanceBike(s,effective,dt,rig.metrics,flat,()=>true,cfg);entry.afterPhysics(dt,rig.metrics,cfg);store.advance(dt,entry.assemblyDuration);return effective}
  return{rig,s,runtime,entry,tick}
}

test('T is rejected at rest, in reverse and on foot; forward creeping can enter the automatic wheelie',async()=>{
  const f=await fixture()
  for(const speed of[0,-.9,-20]){
    f.s.speed=speed;const before=JSON.stringify(f.s);f.entry.request()
    assert.equal(f.entry.phase,'idle');assert.equal(store.snapshot().progress,0);assert.equal(JSON.stringify(f.s),before)
    assert.match(store.snapshot().message,/Avanzá/)
  }
  assert.equal(canStartFrontTransformation({...f.s,speed:3,riderMode:'onFoot'}),false)
  f.s.speed=.05;f.s.wheelieExhausted=true;f.s.wheelieTime=6;f.entry.request();assert.equal(f.entry.phase,'wheelie')
  assert.equal(f.s.wheelieExhausted,false);assert.equal(f.s.wheelieTime,0)
  for(let i=0;i<180&&f.entry.phase==='wheelie';i++)f.tick()
  assert.equal(f.entry.phase,'boost');assert.ok(f.s.wheelieAngle>=.42)
})

test('real driving runs wheelie, one native boost, launch, T-pose, then transformation while airborne',async()=>{
  const f=await fixture(),phases=[],max={height:0,wheelie:0};f.entry.request()
  let completeInAir=false,poseStartedInAir=false
  for(let i=0;i<420;i++){
    f.tick();if(phases.at(-1)!==f.entry.phase)phases.push(f.entry.phase)
    max.height=Math.max(max.height,f.s.height);max.wheelie=Math.max(max.wheelie,f.s.wheelieAngle)
    if(f.entry.poseBlend>0&&f.entry.phase==='airpose'){poseStartedInAir=true;assert.equal(f.s.airborne,true);assert.equal(store.snapshot().progress,0)}
    if(store.snapshot().progress>0&&f.entry.phase==='transforming')assert.equal(f.entry.poseBlend,1)
    if(f.entry.phase==='armorboost'&&f.s.airborne)completeInAir=true
  }
  assert.deepEqual(phases.slice(0,6),['wheelie','boost','airpose','transforming','armorboost','complete'])
  assert.equal(f.s.boostCount,1);assert.ok(max.wheelie>.42&&max.height>3&&max.height<5)
  assert.ok(poseStartedInAir&&completeInAir)
  assert.equal(store.snapshot().progress,1);assert.equal(f.entry.poseBlend,1)
  assert.equal(f.entry.armorBoostCount,1);assert.ok(f.entry.actorOffset.y>2);assert.ok(f.entry.actorOffset.z>7)
  assert.equal(f.s.airborne,false);assert.equal(f.entry.physicsConfig,null)
  // Returning from Armor launches the same physical supports, assembles all
  // parts in their original order, then hands the impact to the landing solver.
  const origin={x:f.s.x,z:f.s.z,height:f.s.height},offset=f.entry.actorOffset.clone(),landings=f.s.frontLandingCount
  f.entry.request();assert.equal(f.entry.phase,'returnboost');assert.equal(f.entry.upwardBoost,true)
  assert.equal(f.entry.armorBoostLevel,1);assert.equal(store.snapshot().progress,1)
  f.tick();assert.ok(Math.abs(f.s.x-origin.x-offset.x)<.1);assert.ok(Math.abs(f.s.z-origin.z-offset.z)<1)
  assert.ok(f.s.height>=origin.height+offset.y);assert.equal(f.entry.actorOffset.length(),0)
  const returnPhases=[],returnMax={height:f.s.height,compression:0};let completedAloft=false
  for(let i=0;i<300&&f.entry.phase!=='idle';i++){
    f.tick();if(returnPhases.at(-1)!==f.entry.phase)returnPhases.push(f.entry.phase)
    returnMax.height=Math.max(returnMax.height,f.s.height)
    returnMax.compression=Math.max(returnMax.compression,f.s.frontTarget-f.s.frontSpring,f.s.rearTarget-f.s.rearSpring)
    if(f.entry.phase==='reversing'){
      assert.equal(f.s.airborne,true);assert.equal(f.entry.assemblyDuration,1)
      assert.ok(f.s.riderStand>.9);assert.equal(f.entry.actorPose.arms,1);assert.equal(f.entry.actorPose.legs,1)
      assert.equal(f.entry.poseBlend,1,'Scott must hold Armor posture until assembly is complete')
      assert.equal(f.entry.returnTilt,0,'Scott and Armor remain upright throughout assembly')
    }
    if(f.entry.phase==='returnpose'){
      completedAloft||=f.s.airborne;assert.equal(store.snapshot().progress,0)
      assert.equal(f.entry.physicsConfig,null);assert.ok(f.entry.poseBlend>=0&&f.entry.poseBlend<=1)
      assert.ok(f.entry.returnTilt>=0&&f.entry.returnTilt<.55,'Tail begins to settle only after the motorcycle is complete')
    }
    if(f.entry.phase==='falling'){
      completedAloft||=f.s.airborne;assert.equal(store.snapshot().progress,0);assert.equal(f.entry.poseBlend,0);assert.equal(f.entry.physicsConfig,null)
    }
  }
  for(let i=0;i<60;i++){f.tick();returnMax.compression=Math.max(returnMax.compression,f.s.frontTarget-f.s.frontSpring,f.s.rearTarget-f.s.rearSpring)}
  assert.deepEqual(returnPhases,['returnboost','reversing','returnpose','falling','idle'])
  assert.ok(completedAloft);assert.ok(returnMax.height>origin.height+offset.y+2.7)
  assert.ok(f.s.frontLandingCount>landings);assert.ok(returnMax.compression>.04,'Existing landing suspension absorbs the fall')
  assert.equal(store.snapshot().progress,0);assert.equal(f.entry.poseBlend,0);assert.equal(f.entry.phase,'idle');assert.equal(f.s.boostCount,1)
  assert.equal(f.entry.returnTilt,0)
})

test('Armor return takes one second regardless of inspection duration and changes to jump pose only after assembly',async()=>{
  for(const duration of[.5,8]){
    const f=await fixture();store.duration(duration);store.seek(1);f.entry.phase='complete';f.entry.poseBlend=1;f.entry.actorOffset.set(1,2.4,7.5)
    f.entry.request();const count=f.entry.armorBoostCount;f.entry.request();assert.equal(f.entry.armorBoostCount,count)
    let assemblyInAir=false,apex=f.s.height,assemblySeconds=0,jumpPoseStarted=false
    for(let i=0;i<900&&f.entry.phase!=='idle';i++){
      f.tick();apex=Math.max(apex,f.s.height)
      if(f.entry.phase==='reversing'){assert.equal(f.s.airborne,true);assert.equal(f.entry.poseBlend,1);assemblySeconds+=1/60}
      if(f.entry.phase==='returnpose'&&f.entry.poseBlend<1){jumpPoseStarted=true;assert.equal(store.snapshot().progress,0)}
      if(f.entry.phase==='falling'&&f.s.airborne)assemblyInAir=true
    }
    assert.ok(assemblyInAir&&jumpPoseStarted);assert.ok(apex>4.5);assert.equal(f.entry.phase,'idle');assert.equal(f.entry.returnFlight,false)
    assert.ok(Math.abs(assemblySeconds-1)<.02,`Return took ${assemblySeconds} s`);assert.equal(store.snapshot().duration,duration)
    assert.equal(f.entry.actorOffset.length(),0);assert.equal(f.entry.physicsConfig,null)
  }
})

test('Armor return restores the coordinated inverse sequence, without the early CHEST override',async()=>{
  const f=await fixture();store.seek(1);f.entry.phase='complete';f.entry.poseBlend=1;f.entry.request();let mid=false,closing=false
  for(let i=0;i<100&&f.entry.phase!=='returnpose';i++){
    f.tick();const e=f.entry,ch=e.choreography,p=store.snapshot().progress
    assert.equal(ch.frontSequence,undefined)
    if(e.phase==='reversing'&&p>.25){assert.equal(ch.chestLift,1);assert.equal(ch.cuffs,1);mid=true}
    if(e.phase==='reversing'&&p>0&&p<.24){assert.equal(ch.chestLift,ch.cuffs);assert.ok(ch.cuffs<1);closing=true}
  }
  assert.ok(mid&&closing)
})

test('entry can pause, cancel and recover after resetting the bike; ordinary input/config remain unchanged when inactive',async()=>{
  const f=await fixture(),input={throttle:.5,steer:.2}
  assert.equal(f.entry.beforePhysics(input,1/60),input);assert.equal(f.entry.physicsConfig,null)
  f.entry.request();f.entry.pause();const time=f.entry.time;f.tick();assert.equal(f.entry.time,time);assert.equal(f.entry.phase,'wheelie')
  f.entry.resume();for(let i=0;i<10;i++)f.tick();assert.ok(f.entry.time>time)
  f.entry.request();assert.equal(f.entry.phase,'idle');assert.equal(f.entry.physicsConfig,null)
  f.entry.request();f.runtime.state={...f.s};f.entry.beforePhysics(input,1/60);assert.equal(f.entry.phase,'idle')
})

test('waist-up T-pose keeps mounted hips, legs and feet exact while the torso follows the bike upright frame',async()=>{
  const source=(await assets)[1],model=clone(source.scene),wrapper=new T.Group(),bones=new Map()
  wrapper.add(model);wrapper.scale.setScalar(1.2607598654177716);wrapper.position.set(1.0539,.0723,-.3394);wrapper.rotation.y=.7
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)})
  const mixer=new T.AnimationMixer(model),data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
  mixer.clipAction(parseCycloneScottActions(data).find(c=>c.name==='Cyclone_RidingPose')).play();mixer.update(0);wrapper.updateMatrixWorld(true)
  const base=new Map([...bones].map(([name,b])=>[name,{position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}]))
  wrapper.rotation.x=-.6;wrapper.rotation.z=.12;wrapper.updateMatrixWorld(true)
  const lower=[...bones].filter(([name])=>/Hips|UpLeg|LeftLeg|RightLeg|Foot|ToeBase/.test(name))
  const world=new Map(lower.map(([name,b])=>[name,b.matrixWorld.clone()])),root=wrapper.position.clone()
  const pose=new TransformationScottPose({model,bones,sourceScene:source.scene},wrapper)
  for(let repeat=0;repeat<3;repeat++)for(const alpha of[.2,.5,1]){
    pose.restore();pose.apply(alpha)
    for(const [name,b]of bones){assert.deepEqual(b.scale,base.get(name).scale);assert.deepEqual(b.position,base.get(name).position)}
    for(const [name,b]of lower){assert.deepEqual(b.quaternion.toArray(),base.get(name).quaternion.toArray());assert.ok(b.matrixWorld.elements.every((v,i)=>Math.abs(v-world.get(name).elements[i])<1e-9))}
    assert.ok(wrapper.position.distanceTo(root)<1e-9)
    if(alpha===1){
      const expected=model.getWorldQuaternion(new T.Quaternion()).multiply(pose.restInModel)
      assert.ok(pose.spine.getWorldQuaternion(new T.Quaternion()).angleTo(expected)<1e-7)
      for(const p of pose.records)if(p.bone!==pose.spine)assert.ok(p.bone.quaternion.angleTo(p.restQ)<1e-7)
    }
  }
  pose.restore();assert.ok(wrapper.position.distanceTo(root)<1e-9)
  for(const [name,b]of bones){assert.deepEqual(b.position,base.get(name).position);assert.deepEqual(b.quaternion.toArray(),base.get(name).quaternion.toArray())}
})

test('headlights turn and CHEST opens while covers and tank wait for placement; pause freezes the choreography',async()=>{
  const f=await fixture();f.entry.request()
  for(let i=0;i<12;i++)f.tick()
  assert.equal(f.entry.phase,'wheelie');assert.ok(f.entry.choreography.turn>.5);assert.equal(f.entry.choreography.separate,0)
  assert.ok(f.entry.cameraProgress>0&&f.entry.cameraProgress<.1)
  for(let i=0;i<12;i++)f.tick()
  assert.equal(f.entry.choreography.turn,1);assert.equal(f.entry.choreography.covers,0);assert.ok(f.entry.choreography.separate>0);assert.equal(f.entry.choreography.fold,0)
  for(let i=0;i<12;i++)f.tick()
  assert.equal(f.entry.choreography.covers,0);assert.equal(f.entry.choreography.separate,1);assert.equal(f.entry.choreography.fold,0)
  f.entry.pause();const before={elapsed:f.entry.elapsed,camera:f.entry.cameraProgress,...f.entry.choreography}
  for(let i=0;i<30;i++)f.tick()
  assert.deepEqual({elapsed:f.entry.elapsed,camera:f.entry.cameraProgress,...f.entry.choreography},before)
  f.entry.resume();for(let i=0;i<180;i++)f.tick()
  assert.equal(f.entry.choreography.separate,1);assert.equal(f.entry.cameraProgress,1)
  f.entry.reset();assert.equal(f.entry.choreography,null);assert.equal(f.entry.cameraProgress,null)
})

test('CHEST fits during the existing boost and follows Scott throughout airpose without waiting for the assembly clock',async()=>{
  const f=await fixture();f.entry.request();let boostLifted=false,rising=false
  for(let i=0;i<180&&f.entry.phase!=='transforming';i++){
    f.tick()
    if(f.entry.phase==='boost'&&f.entry.choreography.chestLift>0)boostLifted=true
    if(f.entry.phase==='airpose'){
      rising=true;assert.equal(store.snapshot().progress,0)
      assert.equal(f.entry.choreography.chestLift,1);assert.equal(f.entry.choreography.torsoFollow,1)
    }
  }
  assert.ok(boostLifted&&rising);assert.equal(f.entry.phase,'transforming');assert.equal(f.entry.choreography.chestLift,1)
  f.entry.reset()
})

test('cuffs start just after CHEST settles and finish during torso rise before the assembly clock starts',async()=>{
  const f=await fixture();f.entry.request();let moving=false,earlyFit=false
  for(let i=0;i<180&&f.entry.phase!=='transforming';i++){
    f.tick()
    if(f.entry.phase==='wheelie'||f.entry.phase==='boost')assert.equal(f.entry.choreography.cuffs,0)
    if(f.entry.phase==='airpose'){
      assert.equal(f.entry.choreography.chestLift,1);assert.equal(store.snapshot().progress,0)
      assert.equal(f.entry.choreography.covers,0);assert.equal(f.entry.choreography.fold,0)
      if(f.entry.time>.04&&f.entry.time<.24){moving=true;assert.ok(f.entry.choreography.cuffs>0&&f.entry.choreography.cuffs<1)}
      if(f.entry.time>=.26)assert.equal(f.entry.choreography.cuffs,1)
      if(f.entry.time>=.26&&f.entry.time<.35){earlyFit=true;assert.ok(f.entry.poseBlend<1)}
    }
  }
  assert.ok(moving&&earlyFit);assert.equal(f.entry.choreography.cuffs,1)
  f.entry.reset()
})

test('early cuff timing pauses and reverses continuously during the torso rise',async()=>{
  const f=await fixture();f.entry.request()
  for(let i=0;i<180&&!(f.entry.phase==='airpose'&&f.entry.time>.1);i++)f.tick()
  const cuffs=f.entry.choreography.cuffs;assert.ok(cuffs>0&&cuffs<1)
  f.entry.pause();for(let i=0;i<20;i++)f.tick();assert.equal(f.entry.choreography.cuffs,cuffs)
  f.entry.request();assert.equal(f.entry.choreography.cuffs,cuffs)
  f.tick();assert.equal(f.entry.phase,'returning');assert.equal(f.entry.choreography.cuffs,cuffs)
  for(let i=0;i<10;i++)f.tick();assert.ok(f.entry.choreography.cuffs<cuffs)
  for(let i=0;i<25;i++)f.tick();assert.equal(f.entry.phase,'idle')
})

test('reversing during torso rise returns the carried front smoothly instead of snapping at assembly progress zero',async()=>{
  const f=await fixture();f.entry.request()
  for(let i=0;i<180&&!(f.entry.phase==='airpose'&&f.entry.poseBlend>.3);i++)f.tick()
  assert.equal(f.entry.phase,'airpose');assert.equal(store.snapshot().progress,0)
  f.entry.request();assert.equal(f.entry.phase,'reversing');assert.equal(f.entry.choreography.chestLift,1)
  f.tick();assert.equal(f.entry.phase,'returning');assert.equal(f.entry.choreography.chestLift,1)
  for(let i=0;i<10;i++)f.tick()
  assert.ok(f.entry.choreography.chestLift>0&&f.entry.choreography.chestLift<1)
  for(let i=0;i<30;i++)f.tick()
  assert.equal(f.entry.phase,'idle');assert.equal(f.entry.choreography,null);assert.equal(f.entry.poseBlend,0)
})

test('cancelling boost after CHEST starts lifting returns it smoothly through the existing return stage',async()=>{
  const f=await fixture();f.entry.request()
  for(let i=0;i<180&&!(f.entry.phase==='boost'&&f.entry.choreography.chestLift>.1);i++)f.tick()
  assert.equal(f.entry.phase,'boost');const before=f.entry.choreography.chestLift
  f.entry.request();assert.equal(f.entry.phase,'returning');assert.equal(f.entry.choreography.chestLift,before)
  f.tick();assert.ok(f.entry.choreography.chestLift<before&&f.entry.choreography.chestLift>0)
  for(let i=0;i<30;i++)f.tick()
  assert.equal(f.entry.phase,'idle');assert.equal(f.entry.choreography,null)
})

test('covers finish before arms lower, then original legs straighten apart without changing bone positions or scale',async()=>{
  assert.equal(sampleFrontSequence(.48).coverFit,1);assert.equal(sampleFrontSequence(.48).arms,0)
  assert.equal(sampleFrontSequence(.62).arms,1);assert.equal(sampleFrontSequence(.62).legs,0)
  assert.equal(sampleFrontSequence(.9).legs,1)
  const source=(await assets)[1],model=clone(source.scene),wrapper=new T.Group(),bones=new Map()
  wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n)})
  const mixer=new T.AnimationMixer(model),data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
  mixer.clipAction(parseCycloneScottActions(data).find(c=>c.name==='Cyclone_RidingPose')).play();mixer.update(0);wrapper.updateMatrixWorld(true)
  const base=[...bones.values()].map(b=>({bone:b,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  const pose=new TransformationScottPose({model,bones,sourceScene:source.scene},wrapper)
  for(const progress of[.48,.56,.62,.75,1,1]){
    pose.restore();pose.apply(1,sampleFrontSequence(progress))
    for(const r of base){assert.deepEqual(r.bone.position.toArray(),r.p);assert.deepEqual(r.bone.scale.toArray(),r.s)}
    if(progress>=.62)for(const side of['Left','Right']){
      const arm=bones.get(`mixamorig${side}Arm`),forearm=bones.get(`mixamorig${side}ForeArm`)
      const direction=forearm.getWorldPosition(new T.Vector3()).sub(arm.getWorldPosition(new T.Vector3())).normalize()
      assert.ok(direction.y<-.9,`${side} arm should be down: ${direction.toArray()}`)
    }
    if(progress===1){
      const left=bones.get('mixamorigLeftFoot').getWorldPosition(new T.Vector3()),right=bones.get('mixamorigRightFoot').getWorldPosition(new T.Vector3())
      assert.ok(left.distanceTo(right)>.3,'Feet remain separated')
      for(const side of['Left','Right']){
        const hip=bones.get(`mixamorig${side}UpLeg`).getWorldPosition(new T.Vector3()),knee=bones.get(`mixamorig${side}Leg`).getWorldPosition(new T.Vector3()),foot=bones.get(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3())
        assert.ok(knee.clone().sub(hip).normalize().dot(foot.clone().sub(knee).normalize())>.94,'Original near-straight leg chain, no knee inversion')
      }
    }
  }
  pose.restore();for(const r of base)assert.deepEqual(r.bone.quaternion.toArray(),r.q)
})

test('rear1 impulse fires only on completed playback, pauses, reverses and never triggers from manual seeking',async()=>{
  const f=await fixture();f.entry.request()
  for(let i=0;i<360&&f.entry.phase!=='armorboost';i++)f.tick()
  assert.equal(store.snapshot().progress,1);assert.equal(f.entry.armorBoostCount,1);assert.equal(f.entry.actorPose.legs,1);assert.equal(f.entry.actorPose.arms,1)
  for(let i=0;i<8;i++)f.tick()
  assert.ok(f.entry.actorOffset.length()>1);f.entry.pause();const offset=f.entry.actorOffset.clone(),level=f.entry.armorBoostLevel
  for(let i=0;i<20;i++)f.tick()
  assert.deepEqual(f.entry.actorOffset,offset);assert.equal(f.entry.armorBoostLevel,level)
  f.entry.resume();for(let i=0;i<60;i++)f.tick();assert.equal(f.entry.phase,'complete');assert.equal(f.entry.armorBoostLevel,0)
  f.entry.request();for(let i=0;i<180;i++)f.tick();assert.equal(f.entry.actorOffset.length(),0)
  const count=f.entry.armorBoostCount;f.entry.scrub(1);f.tick();assert.equal(f.entry.armorBoostCount,count)
})

test('left leg rises slowly, right bends gently with its boot down, and Armor arms open with soft elbows',async()=>{
  const source=(await assets)[1],model=clone(source.scene),wrapper=new T.Group(),bones=new Map()
  wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n)})
  const pose=new TransformationScottPose({model,bones,sourceScene:source.scene,sourceClips:source.animations},wrapper)
  const initial=[...bones.values()].map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}))
  const clip=source.animations.find(c=>c.name.toLowerCase()==='air_squat'),tracks=clip.tracks.map(t=>t.values.slice())
  assert.equal(pose.tuck.length,8)
  assert.equal(sampleFrontSequence(.22).legLift,0);assert.ok(sampleFrontSequence(.36).legLift<.3);assert.ok(Math.abs(sampleFrontSequence(.43).legLift-.5)<1e-8);assert.equal(sampleFrontSequence(.64).legLift,1);assert.equal(sampleFrontSequence(.81).legLift,1);assert.equal(sampleFrontSequence(1).legLift,0)
  const points=side=>['UpLeg','Leg','Foot'].map(s=>bones.get(`mixamorig${side}${s}`).getWorldPosition(new T.Vector3()))
  pose.apply(1,{arms:1,legs:1});const standing={Left:points('Left'),Right:points('Right')};pose.restore()
  for(const p of[.22,.28,.36,.43,.64,.81,.94,1,.81,.36]){
    pose.apply(1,sampleFrontSequence(p));wrapper.updateMatrixWorld(true)
    for(const r of initial){assert.deepEqual(r.b.position.toArray(),r.p.toArray());assert.deepEqual(r.b.scale.toArray(),r.s.toArray())}
    if(p>=.64&&p<=.81){
      const left=points('Left'),right=points('Right')
      assert.ok(left[1].y>right[1].y+.2,'Left knee substantially higher than the gently bent right leg')
      assert.ok(left[2].y>right[2].y+.2,'Left boot higher than right')
      for(const side of ['Left','Right']){
        const [h,k,f]=side==='Left'?left:right
        const flex=180-T.MathUtils.radToDeg(h.clone().sub(k).angleTo(f.clone().sub(k)))
        if(side==='Left'){
          assert.ok(k.y>standing.Left[1].y+.2&&f.y>standing.Left[2].y+.2,'Left knee and heel actually rise')
          assert.ok(flex>80&&flex<135,'Original left knee flexion')
        }else{assert.ok(flex>10&&flex<45,'Right knee has only a soft bend');continue}
        for(const suffix of ['UpLeg','Leg','Foot','ToeBase']){
          const name=`mixamorig${side}${suffix}`,track=clip.tracks.find(t=>t.name===name+'.quaternion'),expected=new T.Quaternion().fromArray(track.createInterpolant().evaluate(side==='Left'?.6:.5)).normalize()
          assert.ok(bones.get(name).quaternion.clone().normalize().angleTo(expected)<1e-6,`Use the original local squat transform without procedural twist: ${name}`)
        }
      }
      const foot=pose.rightFoot.getWorldQuaternion(new T.Quaternion()).premultiply(model.getWorldQuaternion(new T.Quaternion()).invert())
      const sole=new T.Vector3(0,1,0).applyQuaternion(pose.footInModel.clone().invert()).applyQuaternion(foot)
      assert.ok(sole.z>.25&&sole.y>.85,'Boot sole has a modest downward toe pitch, using geometry rather than the toe bone vector')
      for(const side of['Left','Right']){
        const arm=bones.get(`mixamorig${side}Arm`).getWorldPosition(new T.Vector3()),elbow=bones.get(`mixamorig${side}ForeArm`).getWorldPosition(new T.Vector3()),hand=bones.get(`mixamorig${side}Hand`).getWorldPosition(new T.Vector3())
        const upper=elbow.clone().sub(arm).normalize(),flex=180-T.MathUtils.radToDeg(arm.clone().sub(elbow).angleTo(hand.clone().sub(elbow)))
        assert.ok(Math.abs(upper.x)>.3&&upper.y<-.75,'Arms stand slightly away from the torso')
        assert.ok(flex>12&&flex<40,'Elbows have a soft natural bend')
      }
    }
    pose.restore();for(const r of initial)assert.deepEqual(r.b.quaternion.toArray(),r.q.toArray())
  }
  clip.tracks.forEach((t,i)=>assert.deepEqual(t.values,tracks[i]))
  pose.apply(1,sampleFrontSequence(1))
  for(const ankle of pose.ankles){
    const frame=ankle.bone.getWorldQuaternion(new T.Quaternion()).premultiply(model.getWorldQuaternion(new T.Quaternion()).invert())
    const sole=new T.Vector3(0,1,0).applyQuaternion(ankle.reference.clone().invert()).applyQuaternion(frame)
    assert.ok(sole.z>.25&&sole.y>.85,'Both boots point down once the left leg has returned')
  }
  pose.restore()
})

test('tank and wheels start at chest coupling during torso rise; the leg prepares before the front passes',async()=>{
  for(const duration of[.5,2,8]){
    const f=await fixture();store.duration(duration);f.entry.request();let immediate=false,beforePass=0,passed=false,lowering=false
    for(let i=0;i<1500&&f.entry.phase!=='complete';i++){
      f.tick();const entry=f.entry,p=entry.mechanicalProgress,pose=entry.actorPose
      if(entry.phase==='airpose'){
        assert.equal(entry.choreography.chestLift,1);assert.equal(store.snapshot().progress,0)
        if(entry.time>0){assert.ok(p>.22);immediate=true}
      }
      if(p<.42)beforePass=Math.max(beforePass,entry.poseBlend*(pose.legLift||0))
      if(p>=.42&&['airpose','transforming'].includes(entry.phase)){
        passed=true;assert.ok(beforePass>.85,'Left leg must already be raised before the intermediate wheel pose')
      }
      if(p>.7&&p<.88&&entry.phase==='transforming'){
        lowering=true;assert.ok(pose.leftToeDown>0);assert.equal(pose.legs,1,'Do not reseat the hips when lowering the tucked leg')
      }
    }
    assert.ok(immediate&&passed&&lowering)
  }
})

test('return boost tucks both legs and bends the forearms forward until the completed bike takes the jump pose',async()=>{
  const f=await fixture();store.seek(1);f.entry.phase='complete';f.entry.poseBlend=1
  f.entry.request();assert.equal(f.entry.actorPose.returnTuck,0)
  f.tick({},.09);assert.ok(Math.abs(f.entry.actorPose.returnTuck-.5)<1e-8)
  f.entry.pause();const held=f.entry.actorPose.returnTuck;f.tick();assert.equal(f.entry.actorPose.returnTuck,held);f.entry.resume()
  for(let i=0;i<100&&f.entry.phase!=='returnpose';i++){
    f.tick()
    if(f.entry.phase==='reversing'){assert.equal(f.entry.actorPose.returnTuck,1);assert.equal(f.entry.poseBlend,1)}
  }
  assert.equal(f.entry.phase,'returnpose');assert.equal(store.snapshot().progress,0)
  f.tick();assert.ok(f.entry.poseBlend<1);assert.equal(f.entry.actorPose.returnTuck,1)
  const source=(await assets)[1],model=clone(source.scene),wrapper=new T.Group(),bones=new Map()
  wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n)})
  const pose=new TransformationScottPose({model,bones,sourceScene:source.scene,sourceClips:source.animations},wrapper)
  const initial=[...bones.values()].map(b=>({b,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  for(let repeat=0;repeat<3;repeat++){
    pose.apply(1,{arms:1,legs:1,returnTuck:1})
    for(const side of ['Left','Right']){
      const point=s=>bones.get(`mixamorig${side}${s}`).getWorldPosition(new T.Vector3())
      const hip=point('UpLeg'),knee=point('Leg'),foot=point('Foot'),shoulder=point('Arm'),elbow=point('ForeArm'),hand=point('Hand')
      const flex=180-T.MathUtils.radToDeg(hip.clone().sub(knee).angleTo(foot.clone().sub(knee)))
      assert.ok(flex>80&&flex<135,'Both knees use the native squat flexion')
      assert.ok(knee.z>hip.z+.2,'Knees lift forward')
      assert.ok(hand.z>elbow.z+.15,'Forearms face forward')
      const elbowFlex=180-T.MathUtils.radToDeg(shoulder.clone().sub(elbow).angleTo(hand.clone().sub(elbow)))
      assert.ok(elbowFlex>55&&elbowFlex<120,'Bent elbows rather than rigid arms')
    }
    pose.restore()
    for(const r of initial){assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.scale.toArray(),r.s);assert.deepEqual(r.b.quaternion.toArray(),r.q)}
  }
})
