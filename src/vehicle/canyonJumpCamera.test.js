import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,PerspectiveCamera,Vector3} from 'three'
import {stage2PhysicsFixture} from '../../scripts/forest-stage2-physics.mjs'
import {FOREST_STAGE2 as S,stage2Checkpoint,stage2PathX,stage2Void} from '../world/forest/forestStage2Config.js'
import {ForestStage2Progress} from '../world/forest/forestStage2Progress.js'
import {createBikeState,advanceBike} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {DrivingCamera} from './drivingCamera.js'

function cameraFixture(state,sample){
 const camera=new PerspectiveCamera(70,16/9,.1,500),canvas={addEventListener(){},removeEventListener(){}},orbit={domElement:canvas,target:new Vector3(),enableDamping:true,enabled:true,enableRotate:true,enableZoom:true,enablePan:false,addEventListener(){},removeEventListener(){},update(){camera.lookAt(this.target)},getDistance(){return camera.position.distanceTo(this.target)}}
 const runtime={state,cameraMode:0,paused:false,levelProgress:new ForestStage2Progress()},controller=new DrivingCamera(camera,orbit,runtime,bikeConfig,sample);runtime.cameraController=controller;controller.reset(state)
 return {camera,orbit,runtime,controller}
}

test('the real boosted canyon jump closes 360 degrees without changing any physical state at 30/60/120 FPS',async()=>{
 const f=await stage2PhysicsFixture(),config={...bikeConfig,airBoostEnabled:true}
 try{
  for(const fps of[30,60,120]){
   const s=createBikeState(stage2Checkpoint(),f.rig.metrics,f.sample),c=cameraFixture(s,f.sample);let used=false,halfTurn=false
   for(let i=0;i<fps*15;i++){
    const boost=s.airborne&&s.airTime>=.2&&!used;if(boost)used=true
    const canMove=(x,z)=>{const height=f.sample(x,z);return (!Number.isFinite(height)?stage2Void(x,z):!(s.airborne&&(s.frontOverVoid||s.rearOverVoid)&&s.height<height-.25))}
    advanceBike(s,{throttle:1,boost},1/fps,f.rig.metrics,f.sample,canMove,config)
    const before=JSON.stringify(s);c.controller.update(s,1/fps);assert.equal(JSON.stringify(s),before,'Camera never writes vehicle physics')
    const shot=c.controller.canyonShot
    if(shot){assert.equal(c.orbit.enabled,false);assert.ok(shot.phase==='orbit'||shot.phase==='closing');halfTurn||=shot.angle>=Math.PI-.01}
    if(c.controller.canyonJump.lastOutcome?.kind==='success')break
   }
   assert.ok(halfTurn);assert.equal(c.controller.canyonJump.lastOutcome?.kind,'success');assert.ok(Math.abs(c.controller.canyonJump.lastOutcome.angle-Math.PI*2)<1e-8)
   assert.equal(c.orbit.enabled,true);assert.equal(c.runtime.canyonCameraActive,false);assert.equal(s.airBoostCount,1);assert.ok(s.z<S.canyon.landingZ)
   c.controller.dispose()
  }
 }finally{f.dispose()}
})

test('an unboosted jump turns 180 degrees then leaves both visible actors behind while continuing across the gap',async()=>{
 const f=await stage2PhysicsFixture(),s=createBikeState(stage2Checkpoint(),f.rig.metrics,f.sample),c=cameraFixture(s,f.sample),config={...bikeConfig,airBoostEnabled:true}
 const wrapper=new Group(),root=new Group();c.runtime.scottInstance={mountedMotion:{wrapper}};c.runtime.vehicleRig={root}
 try{
  for(let i=0;i<120*15&&s.height>S.fallY;i++){
   advanceBike(s,{throttle:1},1/120,f.rig.metrics,f.sample,(x,z)=>Number.isFinite(f.sample(x,z))||stage2Void(x,z),config)
   c.controller.update(s,1/120);assert.equal(wrapper.visible,true);assert.equal(root.visible,true)
  }
  assert.equal(c.controller.canyonShot.phase,'conceal');assert.ok(Math.abs(c.controller.canyonShot.angle-Math.PI)<1e-8)
  assert.equal(wrapper.visible,true);assert.equal(root.visible,true);assert.ok(c.camera.position.y>0,'Camera stays above the gap')
  const fall=c.runtime.levelProgress.canyonFall(s);assert.equal(fall.kind,'fall');assert.ok(Number.isFinite(fall.floorAt(s.x,s.z)))
  const position=c.camera.position.clone();c.runtime.paused=true;for(let i=0;i<100;i++)c.controller.update(s,1/60);assert.deepEqual(c.camera.position.toArray(),position.toArray())
  const retry=createBikeState(stage2Checkpoint(),f.rig.metrics,f.sample);c.runtime.state=retry;c.controller.reset(retry)
  assert.equal(c.controller.canyonShot,null);assert.equal(c.orbit.enabled,true);assert.equal(c.orbit.enableZoom,true);assert.equal(wrapper.visible,true);assert.equal(root.visible,true)
 }finally{c.controller.dispose();f.dispose()}
})

test('failed jumps keep Scott readable from the far bank, crop the fall, and never alter actor scale',async()=>{
 const f=await stage2PhysicsFixture()
 try{
  for(const fps of[30,60,120]){
   const s=createBikeState(stage2Checkpoint(),f.rig.metrics,f.sample),c=cameraFixture(s,f.sample),wrapper=new Group(),root=new Group()
   wrapper.scale.setScalar(1.26);root.scale.setScalar(.85);const scales=[wrapper.scale.toArray(),root.scale.toArray()]
   c.runtime.scottInstance={mountedMotion:{wrapper}};c.runtime.vehicleRig={root};let partial=false,seen=0,offscreen=false,farBank=false
   try{
    for(let i=0;i<fps*15&&s.height>S.fallY;i++){
     advanceBike(s,{throttle:1},1/fps,f.rig.metrics,f.sample,(x,z)=>Number.isFinite(f.sample(x,z))||stage2Void(x,z),{...bikeConfig,airBoostEnabled:true})
     const before=JSON.stringify(s);c.controller.update(s,1/fps);assert.equal(JSON.stringify(s),before)
     assert.deepEqual([wrapper.scale.toArray(),root.scale.toArray()],scales);assert.ok(wrapper.visible&&root.visible)
     if(c.controller.canyonShot?.phase!=='conceal')continue
     const head=new Vector3(s.x,s.height+2.1,s.z).project(c.camera),feet=new Vector3(s.x,s.height,s.z).project(c.camera)
     if(head.z>0&&head.z<1&&head.y>=-1&&head.y<=1){seen++;assert.ok(Math.abs(head.y-feet.y)/2>.1,'Scott must not become a tiny whole-body silhouette');partial||=feet.y< -1;farBank||=c.camera.position.z< -920}
     if(s.height<0){assert.ok(head.y< -1,'The deep fall is below the frame instead of followed');offscreen=true}
    }
    assert.ok(seen>0&&partial&&offscreen&&farBank,'A readable glimpse from the opposite end leads to a cropped exit')
    assert.ok(c.camera.fov<30);c.controller.reset(s);assert.equal(c.camera.fov,70)
   }finally{c.controller.dispose()}
  }
 }finally{f.dispose()}
})

test('the preceding small jump and other driving areas keep the ordinary camera; fall scenes only apply inside this canyon',async()=>{
 const f=await stage2PhysicsFixture(),s=createBikeState({x:stage2PathX(-475),z:-475,yaw:Math.PI},f.rig.metrics,f.sample),c=cameraFixture(s,f.sample);s.speed=30
 try{
  for(let i=0;i<180;i++){advanceBike(s,{throttle:1},1/120,f.rig.metrics,f.sample);c.controller.update(s,1/120);assert.equal(c.controller.canyonShot,null)}
  assert.equal(c.runtime.levelProgress.canyonFall({...s,x:0,z:-530,height:-20,airborne:true}),null)
  assert.equal(c.runtime.levelProgress.canyonFall({...s,z:-860,height:-20,airborne:true,riderMode:'onFoot'}),null)
 }finally{c.controller.dispose();f.dispose()}
})
