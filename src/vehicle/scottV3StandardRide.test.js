import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3,Quaternion} from 'three'
import {ScottRideSpeedResponse} from './ScottRideSpeedResponse.js'
import {ScottV3Visual} from './ScottV3Visual.js'
import {ridingFixture} from '../../scripts/scott-v2-riding-fixture.mjs'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=(async()=>{const b=fs.readFileSync('public/models/mospeada/scott-gear-v3-animated.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')})()
const point=(f,v,name)=>f.rig.body.worldToLocal(v.retarget.bones.get(name).getWorldPosition(new Vector3()))
const palm=(f,v,side)=>{const mesh=v.skins[0].mesh,ids=v.shapes[side].palmIds,p=new Vector3();ids.forEach(id=>p.add(f.rig.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return p.divideScalar(ids.length)}
const torsoPitch=(f,v)=>{const p=new Vector3(0,0,1).applyQuaternion(v.retarget.bones.get('Spine2').getWorldQuaternion(new Quaternion()).multiply(v.retarget.targetBind.get('Spine2').rotation.clone().invert()).premultiply(f.rig.body.getWorldQuaternion(new Quaternion()).invert()));return Math.atan2(-p.y,p.z)}

test('speed posture eases at the same rate at 30/60/120 FPS, freezes on pause and releases on slowing',()=>{
 const results=[]
 for(const fps of [30,60,120]){
  const response=new ScottRideSpeedResponse(),state={speed:45,airborne:false},values=[]
  for(let i=0;i<fps;i++)values.push(response.sample(state,1/fps).torsoLean)
  assert.ok(values[0]>0&&values[0]<.03,'Posture snaps on acceleration')
  assert.ok(values.every((v,i)=>i===0||v>=values[i-1]))
  results.push(values.at(-1))
  const paused=response.blend;for(let i=0;i<20;i++)response.sample({speed:0},1/fps,true);assert.equal(response.blend,paused)
  for(let i=0;i<fps*2;i++)response.sample({speed:0,airborne:false},1/fps)
  assert.ok(response.blend<.001,'Posture does not relax on deceleration')
  response.sample(state);assert.equal(response.sample({speed:45,airborne:true},1/fps).torsoLean,0,'Speed tuck leaks into the approved flying pose')
  response.reset();assert.equal(response.sample({speed:-3,airborne:false},1/fps).torsoLean,0)
 }
 assert.ok(Math.max(...results)-Math.min(...results)<1e-12,'Frame rate changes the posture response')
})

test('speed posture is perceptible at normal riding speeds without increasing its maximum lean',()=>{
 const response=new ScottRideSpeedResponse()
 assert.equal(response.sample({speed:0}).torsoLean,0)
 assert.ok(response.sample({speed:12}).torsoLean>5*Math.PI/180,'Ordinary forward travel barely changes the pose')
 assert.ok(response.sample({speed:18}).torsoLean>9*Math.PI/180)
 assert.ok(response.sample({speed:24}).torsoLean<=12*Math.PI/180)
 assert.equal(response.sample({speed:24}).torsoLean,response.sample({speed:60}).torsoLean,'High speed exaggerates the tuck')
 assert.equal(response.sample({speed:60,airborne:true}).torsoLean,0)
})

test('standard riding visibly advances the torso while hands stay at the cockpit and boots stay supported',async()=>{
 const f=await ridingFixture(),v=new ScottV3Visual(f.instance,(await asset).scene);f.runtime.scottData=f.authored.data
 try{
  const records=[]
  for(const speed of [3,18,45]){
   Object.assign(f.s,{speed,idleBlend:0,parked:false,airborne:false,riderStand:0});f.step(100);v.apply(f.runtime)
   records.push({pitch:torsoPitch(f,v),chest:point(f,v,'Spine2'),hips:point(f,v,'Hips'),feet:['Left','Right'].map(s=>point(f,v,s+'Foot')),hands:['Left','Right'].map(s=>point(f,v,s+'Hand')),palms:['Left','Right'].map(s=>palm(f,v,s))})
   assert.ok(v.diagnostics.speedPose.torsoLean<=12*Math.PI/180+1e-12)
   assert.equal(v.diagnostics.speedPose.elbowOpening,0,'Acceleration should not animate the arm opening')
   assert.equal(v.diagnostics.speedPose.elbowBend,0)
   for(const side of ['Left','Right'])assert.ok(v.diagnostics.contacts[side+'Foot']<.002)
  }
  assert.ok(records[1].pitch>records[0].pitch&&records[2].pitch>records[1].pitch)
  const extra=records[2].pitch-records[0].pitch;assert.ok(extra>11*Math.PI/180&&extra<12.1*Math.PI/180,'Forward movement remains imperceptible or exceeds its cap')
  assert.ok(records[2].chest.z>records[0].chest.z+.025,'Chest does not actually move forward relative to the bike')
  for(const r of records){assert.ok(r.hips.distanceTo(records[0].hips)<1e-8);r.feet.forEach((foot,i)=>assert.ok(foot.distanceTo(records[0].feet[i])<1e-8,'Acceleration dragged a boot'))}
  for(let i=0;i<2;i++){assert.ok(records[2].hands[i].distanceTo(records[0].hands[i])<1e-8,'Speed pulled a hand out of the grip zone');assert.ok(records[2].palms[i].distanceTo(records[0].palms[i])<.003,'Visible glove moved off its contact')}
  const approved=records[0].feet
  Object.assign(f.s,{airborne:true,frontGrounded:false,rearGrounded:false,riderStand:1});f.step(100);v.apply(f.runtime)
  for(const [i,side]of ['Left','Right'].entries())assert.ok(point(f,v,side+'Foot').distanceTo(approved[i])<.015,'Standard ride does not share the approved airborne support')
  assert.equal(v.diagnostics.speedPose.torsoLean,0)
 }finally{v.dispose()}
})

test('live V3 speed motion progresses across frames, pauses and resets outside standard riding',async()=>{
 const f=await ridingFixture(),v=new ScottV3Visual(f.instance,(await asset).scene);f.runtime.scottData=f.authored.data
 try{
  Object.assign(f.s,{speed:45,idleBlend:0,parked:false,airborne:false,riderStand:0});f.step(100)
  v.apply(f.runtime,1/60);const first=v.diagnostics.speedPose.blend
  for(let i=0;i<60;i++)v.apply(f.runtime,1/60)
  assert.ok(first<.1&&v.diagnostics.speedPose.blend>.97)
  f.runtime.paused=true;const before=v.diagnostics.speedPose.blend;f.s.speed=3;for(let i=0;i<30;i++)v.apply(f.runtime,1/60);assert.equal(v.diagnostics.speedPose.blend,before)
  f.runtime.paused=false;f.runtime.gallant={aiming:true};v.apply(f.runtime,1/60);assert.equal(v.speedResponse.blend,0)
 }finally{v.dispose()}
})

test('cornering response follows bike lean in both directions, eases at every frame rate and excludes idle/reverse/air',()=>{
 const results=[]
 for(const fps of [30,60,120]){
  const response=new ScottRideSpeedResponse(),state={speed:18,lean:-.35}
  const first=response.sample(state,1/fps).torsoRoll;assert.ok(first<0&&first>-.03,'Left lean snaps')
  for(let i=1;i<fps;i++)response.sample(state,1/fps)
  const left=response.roll;results.push(left)
  assert.ok(left<-7*Math.PI/180&&left>=-8*Math.PI/180)
  for(let i=0;i<fps*2;i++)response.sample({...state,lean:.35},1/fps)
  assert.ok(response.roll>7*Math.PI/180,'Right turn leans the wrong way')
  const frozen=response.roll;response.sample({...state,lean:0},1/fps,true);assert.equal(response.roll,frozen)
  for(let i=0;i<fps*2;i++)response.sample({...state,lean:0},1/fps)
  assert.ok(Math.abs(response.roll)<.0001,'Torso fails to return upright')
  for(const s of [{speed:0,lean:-.14,idleBlend:1},{speed:-2,lean:.3},{speed:18,lean:.3,airborne:true}])assert.equal(response.sample(s).torsoRoll,0)
  response.reset();assert.equal(response.roll,0)
 }
 assert.ok(Math.max(...results)-Math.min(...results)<1e-12,'Frame rate changes the cornering response')
})

test('native V3 torso follows left/right chassis lean without moving the pelvis, boots or legacy skeleton',async()=>{
 const f=await ridingFixture(),v=new ScottV3Visual(f.instance,(await asset).scene);f.runtime.scottData=f.authored.data
 try{
  for(const lean of [-.35,.35]){
   Object.assign(f.s,{speed:18,idleBlend:0,parked:false,airborne:false,riderStand:0,lean});f.step(100)
   // First sample the same source pose with no extra torso roll.
   v.speedResponse.sample({...f.s,lean:0});f.runtime.paused=true;v.apply(f.runtime,0)
   const chest=point(f,v,'Neck'),hips=point(f,v,'Hips'),feet=['Left','Right'].map(s=>point(f,v,s+'Foot')),hands=['Left','Right'].map(s=>point(f,v,s+'Hand')),palms=['Left','Right'].map(s=>palm(f,v,s)),source=[...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()])
   f.runtime.paused=false;v.apply(f.runtime)
   const shift=point(f,v,'Neck').x-chest.x
   assert.ok(shift*lean<0&&Math.abs(shift)>.025,'Torso does not lean into the turn: '+lean)
   assert.ok(point(f,v,'Hips').distanceTo(hips)<1e-10,'Cornering drags the pelvis')
   for(const [i,side]of ['Left','Right'].entries()){
    assert.ok(point(f,v,side+'Foot').distanceTo(feet[i])<1e-8,'Cornering detaches a boot')
    assert.ok(point(f,v,side+'Hand').distanceTo(hands[i])<1e-8,'Cornering pulls a hand from the cockpit')
    assert.ok(palm(f,v,side).distanceTo(palms[i])<.003,'Cornering detaches the visible glove')
   }
   assert.deepEqual([...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()]),source,'Cornering changed V1/V2')
  }
 }finally{v.dispose()}
})
