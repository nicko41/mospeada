import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,PerspectiveCamera,Vector2,Vector3} from 'three'
import {CinematicCombatFX,cinematicDirection,cinematicFalloff} from './CinematicCombatFX.js'
import {cinematicCombatState,cinematicPreset,CINEMATIC_TYPES} from './cinematicCombatState.js'
import {createCinematicCombatEvents,cinematicCombatEvents} from './cinematicCombatEvents.js'
import {cameraImpactState} from './cameraImpactState.js'
import {boostCameraState} from './boostCameraState.js'
import {Plano3CombatVFX} from '../vfx/Plano3CombatVFX.js'

function fixture(){
 const camera=new PerspectiveCamera(70,1.5,.1,1000);camera.updateMatrixWorld()
 const scene=new Group(),events=createCinematicCombatEvents(),effect=new CinematicCombatFX(scene,camera,events),config=cinematicPreset(),runtime={state:{x:0,z:0,height:0,speed:40,riderMode:'mounted'},paused:false,transformEntry:{phase:'idle'}},player=new Vector3(),focus=new Vector2(.5,.5)
 return {camera,scene,events,effect,config,runtime,player,focus,step(dt=1/60){return effect.update(dt,runtime,true,player,camera,focus,config)}}
}
const sum=f=>f.effect.uniforms.uCfxEvents.value.slice(0,f.effect.uniforms.uCfxCount.value).reduce((n,v)=>n+v.z,0)

test('all six families have independent controls, bounded presets and no changes to approved camera settings',()=>{
 const before=cinematicCombatState.snapshot(),impact=cameraImpactState.snapshot(),boost=boostCameraState.snapshot()
 try{
  for(const name of ['Off','Subtle','Normal','Intense']){cinematicCombatState.preset(name);const c=cinematicCombatState.snapshot();assert.equal(c.enabled,name!=='Off');assert.equal(Object.keys(c.families).length,6);assert.equal(c.chromaticEnabled,false)}
  cinematicCombatState.set({intensity:Infinity,maxConcurrent:900,maxParticles:999,groundShakeIntensity:7,chromaticAmount:90})
  let c=cinematicCombatState.snapshot();assert.equal(c.maxConcurrent,8);assert.equal(c.maxParticles,96);assert.equal(c.groundShakeIntensity,.025);assert.equal(c.chromaticAmount,.35)
  cinematicCombatState.setFamily('blast',{enabled:false,duration:900,particles:800,cooldown:0,maxDistance:1,minDistance:8,opacity:NaN})
  c=cinematicCombatState.snapshot();assert.equal(c.families.blast.enabled,false);assert.equal(c.families.blast.duration,.9);assert.equal(c.families.blast.particles,24);assert.ok(c.families.blast.minDistance<c.families.blast.maxDistance);assert.equal(c.families.explosion.enabled,true)
  assert.equal(cameraImpactState.snapshot(),impact);assert.equal(boostCameraState.snapshot(),boost)
 }finally{cinematicCombatState.preset(before.preset);cinematicCombatState.set(before);for(const kind of CINEMATIC_TYPES)cinematicCombatState.setFamily(kind,before.families[kind])}
})

test('events copy scratch vectors, bound event/projectile queues and reject malformed positions',()=>{
 const bus=createCinematicCombatEvents(),p=new Vector3(1,2,3),v=new Vector3(0,0,-30)
 bus.emit('ground',p,{direction:v});p.set(100,100,100);v.set(30,0,0)
 assert.deepEqual(bus.drain(),[{kind:'ground',point:{x:1,y:2,z:3},strength:1,direction:{x:0,y:0,z:-30},style:'earth'}])
 for(let i=0;i<500;i++){bus.emit('blast',{x:i,y:0,z:-3});bus.observeProjectile({active:true})}
 assert.ok(bus.drain().length<=24);assert.equal(bus.drainProjectiles().length,128)
 bus.emit('ground',{x:NaN,y:0,z:0});bus.emit('unknown',p);bus.emit('blast',p,{strength:-1});assert.equal(bus.drain().length,0)
})

test('lateral flashes follow camera space, including threats behind and a rotated camera',()=>{
 const f=fixture(),uv=new Vector2(),dir=new Vector2()
 try{
  cinematicDirection(new Vector3(4,0,-4),f.camera,uv,dir);assert.ok(uv.x>.9)
  cinematicDirection(new Vector3(-4,0,-4),f.camera,uv,dir);assert.ok(uv.x<.1)
  cinematicDirection(new Vector3(4,0,4),f.camera,uv,dir);assert.ok(uv.x>.9,'A threat behind must not mirror across the camera')
  f.camera.rotation.y=Math.PI;f.camera.updateMatrixWorld();cinematicDirection(new Vector3(4,0,4),f.camera,uv,dir);assert.ok(uv.x<.1)
  const range=f.config.families.blast;assert.equal(cinematicFalloff(range.minDistance,range),1);assert.equal(cinematicFalloff(range.maxDistance,range),0)
 }finally{f.effect.dispose()}
})

test('explosions combine flash, world debris and shockwave without mutating cameras, runtime or old FX config',()=>{
 const f=fixture(),oldImpact=cameraImpactState.snapshot(),oldBoost=boostCameraState.snapshot()
 try{
  const before=JSON.stringify([f.runtime,f.camera.position,f.camera.quaternion,f.camera.projectionMatrix.elements])
  f.events.emit('explosion',new Vector3(3,0,-5),{style:'biomechanical'});const view=f.step()
  assert.equal(view,f.camera);assert.deepEqual(f.effect.pulses.filter(p=>p.active).map(p=>p.kind).sort(),['debris','explosion','shockwave'])
  assert.equal(f.effect.uniforms.uCfxCount.value,2);assert.ok(f.effect.particles.mesh.count>0);assert.ok(sum(f)<=f.config.accumulationCap)
  assert.equal(JSON.stringify([f.runtime,f.camera.position,f.camera.quaternion,f.camera.projectionMatrix.elements]),before)
  assert.equal(cameraImpactState.snapshot(),oldImpact);assert.equal(boostCameraState.snapshot(),oldBoost)
  assert.equal(f.scene.children.length,1,'World particles must share one batch')
 }finally{f.effect.dispose();assert.equal(f.scene.children.length,0)}
})

test('ground contacts combine violet side light, dust/debris and independently capped minimal camera response',()=>{
 const f=fixture()
 try{
  const source=JSON.stringify([f.camera.position,f.camera.quaternion,f.runtime]);f.events.emit('ground',new Vector3(1,0,-2));const view=f.step()
  assert.notEqual(view,f.camera);assert.equal(JSON.stringify([f.camera.position,f.camera.quaternion,f.runtime]),source)
  assert.ok(f.effect.groundFx.translation.length()<=.24*.025);assert.ok(f.effect.groundFx.rotation.length()<=4*Math.PI/180*.025)
  assert.ok(f.effect.particles.records.some(p=>p.active&&p.family==='ground'));assert.ok(f.effect.pulses.some(p=>p.active&&p.kind==='blast'))
  f.config.families.ground.enabled=false;assert.equal(f.step(),f.camera);assert.ok(!f.effect.particles.records.some(p=>p.active&&p.family==='ground'))
 }finally{f.effect.dispose()}
})

test('near miss sweeps observe live enemy trajectories once per launch without modifying projectile records',()=>{
 const f=fixture(),bolt={active:true,previous:new Vector3(1,0,-5),position:new Vector3(1,0,5),velocity:new Vector3(0,0,50),life:3}
 try{
  const before=JSON.stringify(bolt);f.events.observeProjectile(bolt);f.step();assert.equal(f.effect.metrics.nearMisses,1);assert.equal(JSON.stringify(bolt),before)
  const near=f.effect.pulses.find(p=>p.active&&p.kind==='nearMiss');assert.ok(near&&near.direction.length()>.9)
  for(let i=0;i<4;i++){bolt.life-=.01;f.events.observeProjectile(bolt);f.step()}
  assert.equal(f.effect.metrics.nearMisses,1,'The same swept segment may not repeat an effect')
  f.step(.2);bolt.life=8;f.events.observeProjectile(bolt);f.step();assert.equal(f.effect.metrics.nearMisses,2,'Reused projectile pool slots must be detected on a later launch')
  f.step(.2);bolt.active=false;bolt.life=9;f.events.observeProjectile(bolt);f.step();assert.equal(f.effect.metrics.nearMisses,2,'A projectile that already impacted is not a near miss')
 }finally{f.effect.dispose()}
})

test('floods respect cooldowns, all family caps, global energy and fixed particle budgets',()=>{
 const f=fixture()
 try{
  for(let n=0;n<90;n++){
   for(let i=0;i<30;i++)f.events.emit(i%2?'ground':'explosion',new Vector3(Math.sin(i+n)*4,0,-2-Math.cos(i)*2))
   f.step(1/60)
   const active=f.effect.pulses.filter(p=>p.active);assert.ok(active.length<=8);assert.ok(sum(f)<=f.config.accumulationCap+1e-9);assert.ok(f.effect.particles.records.filter(p=>p.active).length<=64)
   for(const kind of CINEMATIC_TYPES)assert.ok(active.filter(p=>p.kind===kind).length<=f.config.families[kind].cap)
  }
  assert.ok(f.effect.metrics.dropped>0)
  f.step(1);assert.equal(f.effect.uniforms.uCfxCount.value,0);assert.equal(f.effect.particles.mesh.count,0)
 }finally{f.effect.dispose()}
})

test('Off, pause, cinematics, defeat and actor reset discard effects without delayed replay; distant events stay silent',()=>{
 for(const gate of ['off','paused','opening','ending','defeat','loading']){
  const f=fixture()
  try{
   f.events.emit('explosion',new Vector3(2,0,-3));f.step();assert.ok(f.effect.uniforms.uCfxCount.value>0)
   if(gate==='off')f.config.enabled=false
   else if(gate==='paused')f.runtime.paused=true
   else if(gate==='opening')f.runtime.opening={active:true}
   else if(gate==='ending')f.runtime.ending={holding:true}
   else if(gate==='defeat')f.runtime.defeat={}
   f.events.emit('ground',new Vector3(2,0,-3));f.effect.update(.1,f.runtime,gate!=='loading',f.player,f.camera,f.focus,f.config)
   assert.equal(f.effect.uniforms.uCfxCount.value,0);assert.equal(f.effect.particles.mesh.count,0);assert.equal(f.events.drain().length,0)
   f.config.enabled=true;f.runtime.paused=false;delete f.runtime.opening;delete f.runtime.ending;delete f.runtime.defeat;f.step();assert.equal(f.effect.uniforms.uCfxCount.value,0)
   f.events.emit('explosion',new Vector3(200,0,-200));f.step();assert.equal(f.effect.uniforms.uCfxCount.value,0)
   f.events.emit('explosion',new Vector3(2,0,-3));f.step();f.runtime.state={...f.runtime.state};f.step();assert.equal(f.effect.uniforms.uCfxCount.value,0)
  }finally{f.effect.dispose()}
 }
})

test('existing hostile VFX publishes new screen events while approved impact bus rules remain separate',()=>{
 cinematicCombatEvents.clear()
 const fx=Object.assign(Object.create(Plano3CombatVFX.prototype),{emitDeathEnergy(){},impacts:{spawn(){}},impactDust:{burst(){}},sampleGround:()=>0,contactNormal:new Vector3(),axis:new Vector3(0,1,0)})
 fx.enemyWorldImpact(new Vector3(1,0,2));assert.equal(cinematicCombatEvents.drain()[0].kind,'ground')
 const originalEmit=fx.emit;fx.emit=()=>{};fx.enemyImpact(new Vector3(1,3,2));assert.equal(cinematicCombatEvents.drain()[0].kind,'blast');fx.emit=originalEmit
 fx.emit(new Vector3(1,3,2),true,null,'invidExplosion',.45);assert.equal(cinematicCombatEvents.drain()[0].kind,'explosion')
 fx.emit(new Vector3(1,3,2),true,null,'invidExplosion',.25,{cameraShake:false});assert.equal(cinematicCombatEvents.drain().length,0)
 cinematicCombatEvents.clear()
})
