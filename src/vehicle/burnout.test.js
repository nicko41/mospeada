import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {createBikeState,advanceBike} from './bikePhysics.js'
import {bikeConfig as c} from './bikeConfig.js'
import {updateBurnout} from './burnoutDynamics.js'
import {EngineRPM} from '../audio/CycloneEngine.js'
import {ENGINE_AUDIO_DEFAULTS} from '../audio/engineAudioState.js'
import {dustResponse} from '../vfx/dustResponse.js'
import {ejectaResponse} from '../vfx/ejectaResponse.js'
import {WheelTracks} from '../vfx/WheelTracks.js'
import {vfxState} from '../vfx/vfxState.js'

const m={frontZ:.78,rearZ:-.78,frontY:.375,rearY:.375,frontRadius:.375,rearRadius:.375,wheelbase:1.56}
const flat=(x,z,out)=>{if(out)Object.assign(out,{surface:'dirt',biome:null,earthWeight:1});return 0}
const state=(speed=0)=>{const s=createBikeState({x:0,z:0,yaw:0},m,flat);s.speed=speed;return s}
const chord={throttle:1,brakeReverse:true}
function run(s,input,seconds=1,config=c,canMove=()=>true){for(let i=0;i<Math.ceil(seconds*120);i++)advanceBike(s,input,1/120,m,flat,canMove,config);return s}
const front=s=>new Vector3(s.x+Math.sin(s.yaw)*m.frontZ,0,s.z+Math.cos(s.yaw)*m.frontZ)

test('stationary burnout spins only the rear tire, with a planted front, supported suspension and rising engine RPM',()=>{
 const s=state(),p=front(s),engine=new EngineRPM()
 for(let i=0;i<240;i++){advanceBike(s,chord,1/120,m,flat);engine.update(1/120,{state:s,input:chord},ENGINE_AUDIO_DEFAULTS)}
 assert.equal(s.burnout.phase,'holding');assert.equal(s.speed,0);assert.equal(s.frontAngularSpeed,0);assert.ok(s.rearAngularSpeed>60)
 assert.ok(front(s).distanceTo(p)<1e-10);assert.ok(s.frontGrounded&&s.rearGrounded&&!s.airborne)
 assert.ok(s.rearSpin!==s.frontSpin);assert.equal(s.boostCount,0);assert.equal(s.wheelieAngle,0)
 assert.ok(engine.output.rpm>7500);assert.ok(engine.output.playbackRate>1.5);assert.ok(engine.output.gain>.4)
})

test('directional burnout pivots exactly around the front with progressive yaw, mirrored lean and steering inertia',()=>{
 for(const steer of [-1,1]){
  const s=state(),p=front(s),body=new Vector3(s.x,0,s.z)
  run(s,{...chord,steer},.1);const first=s.yawRate
  run(s,{...chord,steer},.9)
  assert.ok(Math.abs(s.yawRate)>Math.abs(first)*2);assert.ok(s.yaw*steer>.4);assert.ok(s.lean*steer<-.08)
  assert.ok(Math.hypot(s.x-body.x,s.z-body.z)>.3,'The centre translates around the front instead of rotating in place')
  assert.ok(front(s).distanceTo(p)<1e-10);assert.ok(Math.abs(s.rearLateralVelocity)>1)
  assert.ok(Math.max(s.riderDabLeft,s.riderDabRight)>.2)
  const before=s.yawRate;run(s,chord,1/120);assert.ok(Math.abs(s.yawRate)<Math.abs(before)&&Math.abs(s.yawRate)>Math.abs(before)*.9)
  run(s,{...chord,steer:-steer},1);assert.ok(s.yawRate*steer<0);assert.ok(front(s).distanceTo(p)<1e-10)
 }
})

test('brake release restores drive progressively along the new heading without an extra launch impulse',()=>{
 const s=state();run(s,{...chord,steer:1},1.5);const yaw=s.yaw,initialSpeed=s.speed
 let previous=s.speed,maxAcceleration=0
 for(let i=0;i<180;i++){advanceBike(s,{throttle:1},1/120,m,flat);maxAcceleration=Math.max(maxAcceleration,(s.speed-previous)*120);previous=s.speed}
 assert.ok(s.speed>initialSpeed+6);assert.equal(s.burnout.phase,'idle');assert.equal(s.launchTime,0)
 assert.ok(maxAcceleration<=c.acceleration+1e-6);assert.ok(Math.abs(s.yaw-yaw)<.25)
 assert.ok(Math.abs(Math.atan2(s.x,s.z)-s.yaw)<.3)
 assert.ok(Math.abs(s.rearAngularSpeed-s.speed/m.rearRadius)<1e-8)
})

test('throttle release gently ends the spin and turn; low-speed entry stops the front within centimetres',()=>{
 const s=state(1);run(s,{...chord,steer:1},1);assert.ok(front(s).distanceTo(new Vector3(0,0,m.frontZ))<.04)
 const wheel=s.rearAngularSpeed,yaw=s.yawRate;run(s,{brakeReverse:true},1/120)
 assert.equal(s.burnout.phase,'recovering');assert.ok(s.rearAngularSpeed<wheel&&s.rearAngularSpeed>wheel*.9);assert.ok(Math.abs(s.yawRate)>Math.abs(yaw)*.8)
 // Keep the front brake without invoking the ordinary S-to-reverse gesture.
 run(s,{brake:1},2);assert.equal(s.burnout.phase,'idle');assert.equal(s.rearAngularSpeed,0);assert.equal(s.speed,0)
})

test('entry cannot arm at speed, on a wheelie, in air, off the bike, during boost, handbrake or transformation',()=>{
 for(const patch of [{speed:12},{airborne:true,frontGrounded:false,rearGrounded:false},{frontGrounded:false},{riderMode:'onFoot',pedestrian:{x:0,z:0,ground:0,yaw:0,moving:false,feet:{}}},{wheelieAngle:.5},{boostTime:.3}]){
  const s=Object.assign(state(),patch)
  if(patch.riderMode==='onFoot'){updateBurnout(s,{...chord,brake:1},1/120,c);assert.equal(s.burnout.phase,'idle');continue}
  run(s,chord,1/120);assert.equal(s.burnout.phase,'idle',JSON.stringify(patch))
 }
 for(const input of [{...chord,boost:true},{...chord,handbrake:true},{...chord,wheelie:true}])assert.equal(run(state(),input).burnout.phase,'idle')
 assert.equal(run(state(),chord,1,{...c,burnoutEnabled:false}).burnout.phase,'idle')
 const fast=state(12);run(fast,chord,2);assert.equal(fast.speed,0);assert.equal(fast.burnout.phase,'idle')
 run(fast,{brake:1},.1);run(fast,chord,.5);assert.equal(fast.burnout.phase,'holding')
 const s=state();run(s,chord);run(s,{throttle:1,boost:true},1/120);assert.equal(s.burnout.phase,'idle');assert.equal(s.boostCount,1)
})

test('normal driving, braking, handbrake, reverse and boost retain the same dynamics with burnout enabled or disabled',()=>{
 for(const input of [{throttle:1,steer:.5},{brakeReverse:true},{handbrake:true,steer:1},{throttle:1,boost:true},{throttle:1,wheelie:true},{}]){
  const a=state(20),b=state(20);run(a,input,1);run(b,input,1,{...c,burnoutEnabled:false})
  for(const key of Object.keys(a))if(!['burnout'].includes(key))assert.deepEqual(a[key],b[key],key)
 }
})

test('the rear pivot respects collision rejection without moving through an obstacle',()=>{
 const s=state(),p=front(s);run(s,{...chord,steer:1},1,c,()=>false)
 assert.equal(s.x,0);assert.equal(s.z,0);assert.equal(s.yaw,0);assert.equal(s.yawRate,0)
 assert.ok(s.blocked&&s.rearAngularSpeed>60);assert.ok(front(s).equals(p))
})

test('the fixed-step burnout is consistent across frame rates, and asphalt stamps stay rear-only and bounded',()=>{
 const states=[30,60,120].map(fps=>{const s=state();for(let i=0;i<fps*2;i++)advanceBike(s,{...chord,steer:1},1/fps,m,flat);return s})
 for(const s of states){assert.ok(Math.abs(s.yaw-states[0].yaw)<1e-10);assert.ok(Math.abs(s.rearSpin-states[0].rearSpin)<1e-10)}
 const sample=(x,z,out)=>{if(out)out.surface='asphalt';return 0},tracks=new WheelTracks(sample,{capacity:16}),s=run(state(),chord)
 const w={grounded:true,surface:'asphalt',position:new Vector3(),forward:new Vector3(0,0,1),radius:.375},wheels={front:{...w,position:new Vector3(0,0,.78)},rear:{...w,position:new Vector3(0,0,-.78)}}
 try{
  for(let i=0;i<1000;i++)tracks.update(1/120,wheels,s,{humidity:.1})
  assert.equal(tracks.stats.active,1);assert.equal(tracks.stats.emitted,1);assert.equal(tracks.history.front,null)
  assert.equal(tracks.history.rear.kind,'asphalt')
 }finally{tracks.dispose()}
})

test('stationary rear spin emits surface-sensitive dust/ejecta and one contact stamp, then curved rear tracks in the same pool',()=>{
 const s=run(state(),chord),config={...vfxState.defaults,humidity:.1},wheel={grounded:true,surface:'dirt',radius:m.rearRadius,position:new Vector3(),forward:new Vector3(0,0,1)}
 const dirt=dustResponse(wheel,s,config,3),road=dustResponse({...wheel,surface:'asphalt'},s,config,3)
 assert.ok(dirt.rate>200);assert.ok(road.rate>0&&road.rate<dirt.rate*.2)
 assert.equal(dustResponse({...wheel,grounded:false},s,config,3).rate,0)
 assert.equal(ejectaResponse(wheel,s,'front',config,0,3,1/60).earth,0)
 assert.ok(ejectaResponse(wheel,s,'rear',config,0,3,1/60).earth>0)
 assert.ok(dustResponse(wheel,s,{...config,humidity:.9},3).rate<dirt.rate*.02)
 const tracks=new WheelTracks(flat,{capacity:64}),wheels={front:{...wheel,position:front(s)},rear:{...wheel,position:new Vector3(0,0,m.rearZ)}}
 try{
  const buffer=tracks.geometry.attributes.position.array
  for(let i=0;i<240;i++)tracks.update(1/120,wheels,s,config)
  assert.equal(tracks.stats.emitted,1,'Stationary spin cannot stack unbounded marks')
  for(let i=0;i<360;i++){
   advanceBike(s,{...chord,steer:1},1/120,m,flat)
   wheels.front.position.copy(front(s));wheels.rear.position.set(s.x+Math.sin(s.yaw)*m.rearZ,0,s.z+Math.cos(s.yaw)*m.rearZ)
   tracks.update(1/120,wheels,s,config)
  }
  assert.ok(tracks.stats.emitted>20);assert.equal(tracks.geometry.attributes.position.array,buffer);assert.ok(tracks.stats.active<=64)
 }finally{tracks.dispose()}
})
