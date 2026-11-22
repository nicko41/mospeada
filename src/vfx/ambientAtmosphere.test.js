import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,PerspectiveCamera,Vector3} from 'three'
import {AmbientAtmosphere,AMBIENT_LIMITS,ambientBiome} from './AmbientAtmosphere.js'
import {ambientVFXState} from './ambientVFXState.js'
import {stage2PathX,stage2LipZ} from '../world/forest/forestStage2Config.js'
import {stage4Edge} from '../world/forest/forestStage4Config.js'

function fixture(){
 const fx=new AmbientAtmosphere(),camera=new PerspectiveCamera(70,16/9,.1,1000),s={x:0,z:0,height:0,yaw:Math.PI,airborne:false},runtime={state:s,paused:false,weathering:{contacts:{wheels:{rear:{biome:'forest'}}}}},config={...ambientVFXState.defaults,quality:'high'}
 camera.position.set(0,3,5);camera.lookAt(0,2,-10);camera.updateMatrixWorld(true)
 const tick=(seconds,dt=1/60)=>{for(let t=0;t<seconds;t+=dt)fx.update(dt,camera,runtime,config)}
 return{fx,camera,s,runtime,config,tick}
}
test('forest drifts gently upward and explicitly enabled desert particles travel horizontally in the same pool',()=>{
 const f=fixture(),{fx,runtime,config,tick}=f
 try{
  tick(.1);assert.ok(fx.stats.motes>10);assert.equal(fx.stats.biome,'forest')
  const pools=fx.motePool.slice(),p=fx.motePool[0],start=p.position.clone();tick(1)
  assert.ok(p.position.distanceTo(start)<.7,'Pollen floats slowly rather than streaming like snow')
  assert.ok(Math.abs(p.position.y-start.y)<.2)
  Object.assign(config,{desertEnabled:true,sandEnabled:true,gustsEnabled:true});runtime.weathering.contacts.wheels.rear.biome='desert';tick(.1);assert.equal(fx.stats.biome,'desert')
  const desert=p.position.clone();tick(1);assert.ok(p.position.x-desert.x>1.7);assert.ok(Math.abs(p.position.y-desert.y)<.001)
  assert.deepEqual(fx.motePool,pools);assert.ok(fx.stats.gusts>0);assert.equal(fx.stats.leaves,0)
 }finally{fx.dispose()}
})
test('quality, viewing distance and all independent toggles cap ambient work and never change gameplay',()=>{
 const f=fixture(),{fx,camera,s,runtime,config,tick}=f
 try{
  tick(.1);const high=fx.stats.motes,before=JSON.stringify(s),geometry=fx.motes.geometry,buffers=fx.meshes.map(m=>m.instanceMatrix)
  config.quality='low';tick(.1);assert.ok(fx.stats.motes<high*.6)
  config.quality='high';config.pollenEnabled=false;tick(.1);assert.equal(fx.stats.motes,0)
  config.pollenEnabled=true;camera.position.set(200,50,200);tick(.1);assert.equal(fx.stats.motes,0)
  camera.position.set(0,3,5);config.enabled=false;tick(.1);assert.equal(fx.stats.active,0);assert.equal(fx.root.visible,false)
  assert.equal(JSON.stringify(s),before);assert.equal(fx.motes.geometry,geometry);assert.deepEqual(fx.meshes.map(m=>m.instanceMatrix),buffers)
  config.enabled=true;config.quality='auto';tick(8,.1);assert.ok(fx.qualityScale<.5,'Only the ambient particle budget adapts to slow frames')
  assert.equal(runtime.state,s)
 }finally{fx.dispose()}
})
test('varied leaves and intermittent sky birds stay pooled, pause exactly and disappear between crossings',()=>{
 const f=fixture(),{fx,runtime,config,tick}=f
 try{
  tick(15);assert.equal(fx.stats.skyEvents,1);assert.ok(fx.stats.birds>0);assert.ok(fx.stats.leaves<=AMBIENT_LIMITS.leaves)
  const time=fx.timeUniform.value,age=fx.flocks[0].age,p=fx.motePool[0].position.clone(),matrix=fx.birds.instanceMatrix.array.slice()
  runtime.paused=true;tick(1);assert.equal(fx.timeUniform.value,time);assert.equal(fx.flocks[0].age,age);assert.ok(fx.motePool[0].position.distanceTo(p)<1e-8);assert.deepEqual(fx.birds.instanceMatrix.array,matrix)
  runtime.paused=false;tick(15);assert.equal(fx.stats.birds,0);assert.equal(fx.stats.skyEvents,1)
  config.skyBirdsEnabled=false;config.leavesEnabled=false;tick(20);assert.equal(fx.stats.birds,0);assert.equal(fx.stats.leaves,0)
  for(const mesh of fx.meshes)assert.ok(mesh.count<=mesh.instanceMatrix.count)
 }finally{fx.dispose()}
})
test('default forest stays sparse with varied leaves and desert has no ambient particles',()=>{
 const f=fixture(),atlas=new DataTexture(new Uint8Array([255,255,255,255]),1,1);f.fx.dispose();f.fx=new AmbientAtmosphere({leafAtlas:atlas})
 const {fx,camera,runtime,config}=f,tick=()=>fx.update(1/60,camera,runtime,config)
 try{
  tick();assert.equal(fx.leaves.material.map,atlas);assert.ok(fx.leaves.count>=5&&fx.leaves.count<=9);assert.ok(fx.motes.count>=25&&fx.motes.count<=55)
  const active=fx.leafPool.filter(p=>p.age<p.life),sizes=active.map(p=>p.size),frames=new Set(active.map(p=>(p.frameOffset+Math.floor(p.age*p.frameRate))%12))
  assert.ok(Math.max(...sizes)>Math.min(...sizes)*1.5);assert.ok(frames.size>=4)
  for(const p of active)assert.ok(p.velocity.dot(fx.right)>.6,'Leaves travel from one side to the other')
  let visible=0;for(let i=0;i<fx.motes.count;i++){const p=fx.motePool[i].position.clone().project(camera);if(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1)visible++}
  assert.ok(visible>fx.motes.count*.7,'The majority of the budget contributes to the gameplay view')
  runtime.weathering.contacts.wheels.rear.biome='desert';tick();assert.equal(fx.stats.active,0);assert.equal(fx.root.visible,false)
 }finally{fx.dispose();atlas.dispose()}
})
test('canyon flock fires only during the large airborne crossing, stays below Scott and rearms on checkpoint retry',()=>{
 const f=fixture(),{fx,camera,s,runtime,config,tick}=f
 try{
  config.skyBirdsEnabled=false;s.x=stage2PathX(-800);s.height=14
  s.z=-530;s.airborne=true;tick(.1);assert.equal(fx.stats.canyonEvents,0,'Small forest jumps do not trigger it')
  s.z=stage2LipZ(s.x)-4;s.airborne=false;tick(.1);assert.equal(fx.stats.canyonEvents,0)
  camera.position.set(s.x,17,s.z+5);camera.lookAt(s.x,5,s.z-50);camera.updateMatrixWorld(true)
  s.airborne=true;runtime.paused=true;tick(.1);assert.equal(fx.stats.canyonEvents,0)
  runtime.paused=false;tick(.1);assert.equal(fx.stats.canyonEvents,1);assert.ok(fx.stats.birds>=6)
  const flock=fx.flocks[1],origin=flock.position.clone();assert.ok(flock.position.y<s.height-8)
  tick(1);assert.equal(fx.stats.canyonEvents,1);assert.ok(flock.velocity.x>12);assert.ok(flock.position.equals(origin),'Flock follows its own world trajectory')
  const position=new Vector3();for(let i=0;i<fx.birds.count;i++){fx.birds.getMatrixAt(i,fx.object.matrix);position.setFromMatrixPosition(fx.object.matrix);assert.ok(position.y<s.height-8)}
  runtime.state={...s,z:-655,airborne:false};tick(.1);assert.equal(fx.canyonTriggered,false)
  runtime.state.z=s.z;runtime.state.airborne=true;tick(.1);assert.equal(fx.stats.canyonEvents,2)
 }finally{fx.dispose()}
})
test('desert detection follows the curved cliff in world coordinates even while airborne over old wheel contacts',()=>{
 const world={bound:true,position:new Vector3(100,20,-2000),distance(z){return this.position.z-z},contains:()=>true}
 for(const x of[0,80,320]){
  const edge=stage4Edge(x)
  assert.equal(ambientBiome({x:x+100,z:-2000-edge+2},'desert',world),'forest')
  assert.equal(ambientBiome({x:x+100,z:-2000-edge-2},'forest',world),'desert')
 }
 ambientVFXState.set({forestDensity:99,desertDensity:-4,quality:'invalid'});assert.equal(ambientVFXState.snapshot().forestDensity,1.5);assert.equal(ambientVFXState.snapshot().desertDensity,0);assert.equal(ambientVFXState.snapshot().quality,'auto');ambientVFXState.reset()
})

test('fast riding and teleports never exceed four terrain probes per ambient update',()=>{
 const f=fixture();let probes=0;f.fx.sampleGround=()=>{probes++;return 0}
 try{
  for(let i=0;i<120;i++){
   probes=0;f.s.z-=i%10===0?120:7;f.camera.position.z=f.s.z+5;f.fx.update(1/60,f.camera,f.runtime,f.config)
   assert.ok(probes<=4);assert.ok(f.fx.motes.count<=AMBIENT_LIMITS.motes)
  }
 }finally{f.fx.dispose()}
})
