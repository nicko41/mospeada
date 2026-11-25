import {Vector2,Vector3} from 'three'
import {CameraImpactFX} from './CameraImpactFX.js'
import {cameraImpactState} from './cameraImpactState.js'
import {cameraImpactAllowed} from './cameraImpactGameplay.js'
import {cinematicCombatState} from './cinematicCombatState.js'
import {cinematicCombatEvents} from './cinematicCombatEvents.js'
import {cinematicUniforms} from './cinematicCombatShader.js'
import {CinematicCombatParticles} from './CinematicCombatParticles.js'

const indices={blast:0,nearMiss:1,explosion:2,debris:3,ground:4,shockwave:5}
const priority={blast:3,nearMiss:4,explosion:4,debris:0,ground:1,shockwave:2}
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n))
export function cinematicFalloff(distance,f){return distance>=f.maxDistance?0:1-clamp((distance-f.minDistance)/Math.max(.01,f.maxDistance-f.minDistance))**2}
export function cinematicDirection(point,camera,uv=new Vector2(),direction=new Vector2(),local=new Vector3()){
 local.copy(point).applyMatrix4(camera.matrixWorldInverse)
 direction.set(local.x,local.y);if(direction.lengthSq()<1e-8)direction.set(0,local.z>0?-1:1)
 direction.normalize();uv.copy(direction).multiplyScalar(.48/Math.max(Math.abs(direction.x),Math.abs(direction.y))).addScalar(.5)
 return uv
}

export class CinematicCombatFX{
 constructor(scene,camera,events=cinematicCombatEvents){
  this.events=events;this.uniforms=cinematicUniforms();this.particles=new CinematicCombatParticles(scene);this.groundFx=new CameraImpactFX(camera)
  this.groundConfig={...cameraImpactState.defaults,explosionPower:1,maxConcurrent:1,duration:.09,damping:24,range:1e6,blurEnabled:false}
  this.pulses=Array.from({length:8},()=>({active:false,kind:'blast',point:new Vector3(),direction:new Vector2(),age:0,duration:0,gain:0,size:0,blur:0,distortion:0,sector:0}))
  this.cameraPoint=new Vector3();this.previousCamera=new Vector3();this.local=new Vector3();this.uv=new Vector2();this.direction=new Vector2();this.projected=new Vector3();this.start=new Vector3();this.end=new Vector3();this.delta=new Vector3();this.closest=new Vector3();this.velocity=new Vector3()
  this.metrics={accepted:0,dropped:0,nearMisses:0,maxActive:0};this.reset()
 }
 reset(){
  for(const p of this.pulses)p.active=false
  this.particles.clear();this.groundFx.reset();this.uniforms.uCfxCount.value=0;this.cooldowns=new Map();this.seen=new WeakMap();this.clock=0;this.haveCamera=false;this.actor=null;this.groundEvents=[];this.events.clear()
 }
 add(kind,event,camera,player,config){
  const f=config.families[kind];if(!f?.enabled)return false
  const distance=event.distance??this.local.copy(event.point).distanceTo(player),gain=event.strength*cinematicFalloff(distance,f)
  if(gain<=.0001||f.intensity*config.intensity<=0)return false
  cinematicDirection(event.point,camera,this.uv,this.direction,this.local)
  const sector=Math.round(Math.atan2(this.direction.y,this.direction.x)/Math.PI*3),key=kind+':'+sector
  if(this.clock<(this.cooldowns.get(key)||-1)){this.metrics.dropped++;return false}
  const active=this.pulses.filter(p=>p.active),same=active.filter(p=>p.kind===kind)
  let slot=same.length>=f.cap?same.reduce((a,b)=>a.age/a.duration>b.age/b.duration?a:b):this.pulses.slice(0,config.maxConcurrent).find(p=>!p.active)
  if(!slot){slot=active.reduce((a,b)=>priority[a.kind]<priority[b.kind]||priority[a.kind]===priority[b.kind]&&a.gain<b.gain?a:b);if(priority[slot.kind]>priority[kind]||priority[slot.kind]===priority[kind]&&slot.gain>=gain){this.metrics.dropped++;return false}}
  slot.active=true;slot.kind=kind;slot.point.copy(event.point);slot.direction.copy(event.screenDirection||this.direction);slot.age=0;slot.duration=f.duration;slot.gain=gain;slot.size=f.size;slot.blur=f.blurAmount;slot.distortion=f.distortionAmount;slot.sector=sector
  this.cooldowns.set(key,this.clock+f.cooldown);this.metrics.accepted++
  if(kind==='explosion'||kind==='debris'||kind==='ground')this.particles.burst({...event,family:kind},f,camera,config,gain*f.intensity*config.intensity)
  if(kind==='ground'&&config.groundShakeEnabled&&config.groundShakeIntensity>0)this.groundEvents.push({kind:'explosion',origin:{...event.point},strength:Math.min(1,gain)})
  return true
 }
 observe(b,camera,config){
  if(!b.active||!config.families.nearMiss.enabled)return
  if(![b.previous.x,b.previous.y,b.previous.z,b.position.x,b.position.y,b.position.z,b.velocity.x,b.velocity.y,b.velocity.z,b.life].every(Number.isFinite))return
  let memo=this.seen.get(b)
  if(!memo||b.life>memo.life+.025){memo={life:b.life,passed:false};this.seen.set(b,memo)}
  memo.life=b.life;if(memo.passed)return
  this.start.copy(b.previous).sub(this.haveCamera?this.previousCamera:this.cameraPoint);this.end.copy(b.position).sub(this.cameraPoint);this.delta.subVectors(this.end,this.start)
  const den=this.delta.lengthSq();if(den<1e-8||this.end.dot(this.delta)<=0)return
  const t=clamp(-this.start.dot(this.delta)/den);this.closest.copy(this.start).addScaledVector(this.delta,t)
  const distance=this.closest.length(),f=config.families.nearMiss
  if(distance>=f.maxDistance)return
  memo.passed=true;this.closest.add(this.cameraPoint)
  this.velocity.copy(b.velocity).transformDirection(camera.matrixWorldInverse);this.direction.set(this.velocity.x,this.velocity.y)
  if(this.direction.lengthSq()<1e-6){cinematicDirection(this.closest,camera,this.uv,this.direction,this.local)}else this.direction.normalize()
  const event={point:this.closest,strength:1,distance,screenDirection:this.direction.clone(),style:'energy'}
  if(this.add('nearMiss',event,camera,this.cameraPoint,config))this.metrics.nearMisses++
 }
 update(delta,runtime,ready,player,camera,focus,config=cinematicCombatState.snapshot()){
  let events=this.events.drain(),projectiles=this.events.drainProjectiles()
  if(!config.enabled||!cameraImpactAllowed(runtime,ready)){this.reset();return camera}
  if(this.actor&&this.actor!==runtime.state){this.reset();events=[];projectiles=[]}
  this.actor=runtime.state;const dt=Number.isFinite(delta)?Math.max(0,delta):0;this.clock+=dt;camera.updateWorldMatrix(true,false);camera.getWorldPosition(this.cameraPoint)
  this.groundEvents.length=0;this.particles.advance(dt,config)
  for(const p of this.pulses)if(p.active){p.age+=dt;if(p.age>=p.duration||!config.families[p.kind].enabled)p.active=false}
  // Reducing the global cap also retires already active excess slots.
  for(let i=config.maxConcurrent;i<8;i++)this.pulses[i].active=false
  for(const e of events){
   if(e.kind==='explosion'){this.add('explosion',e,camera,player,config);this.add('debris',{...e,style:'biomechanical'},camera,player,config);this.add('shockwave',e,camera,player,config)}
   if(e.kind==='blast') {this.add('blast',e,camera,player,config);this.add('debris',e,camera,player,config)}
   if(e.kind==='ground'){this.add('blast',e,camera,player,config);this.add('ground',e,camera,player,config);this.add('debris',e,camera,player,config)}
  }
  for(const b of projectiles)this.observe(b,camera,config)
  this.previousCamera.copy(this.cameraPoint);this.haveCamera=true
  let n=0,total=0
  const u=this.uniforms
  for(const p of this.pulses){
   if(!p.active||p.kind==='debris')continue
   const f=config.families[p.kind],t=p.age/p.duration,age=p.age===0?Math.min(dt*.5,.012):p.age
   const envelope=(1-Math.exp(-Math.max(age,.002)*150))*(1-t)**2
   const strength=p.gain*f.intensity*config.intensity*f.opacity*envelope
   if(strength<.00001)continue
   cinematicDirection(p.point,camera,this.uv,this.direction,this.local)
   if(p.kind==='shockwave'&&this.local.z<-camera.near){this.projected.copy(p.point).project(camera);this.uv.set(clamp(this.projected.x*.5+.5),clamp(this.projected.y*.5+.5))}
   u.uCfxEvents.value[n].set(this.uv.x,this.uv.y,strength,indices[p.kind]);u.uCfxParams.value[n].set(t,p.size,config.blurEnabled?p.blur:0,p.distortion);u.uCfxDirections.value[n].set(p.direction.x,p.direction.y,f.directionality*config.directionality,0);total+=strength;n++
  }
  if(total>config.accumulationCap)for(let i=0;i<n;i++)u.uCfxEvents.value[i].z*=config.accumulationCap/total
  u.uCfxCount.value=n;u.uCfxCap.value=config.accumulationCap;u.uCfxExposure.value=config.exposureEnabled?config.exposureAmount:0;u.uCfxChromatic.value=config.chromaticEnabled?config.chromaticAmount:0
  this.metrics.maxActive=Math.max(this.metrics.maxActive,this.pulses.filter(p=>p.active).length)
  this.particles.paint(camera,focus)
  if(!config.groundShakeEnabled||!config.families.ground.enabled){this.groundFx.reset();return camera}
  this.groundConfig.intensity=config.groundShakeIntensity
  return this.groundFx.update(dt,camera,player,this.groundConfig,this.groundEvents).camera
 }
 dispose(){this.reset();this.particles.dispose()}
}
