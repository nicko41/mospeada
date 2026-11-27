import {Euler,Quaternion,Vector2,Vector3} from 'three'

// Absolute presentation limits, even when several impacts arrive together.
export const CAMERA_IMPACT_LIMITS=Object.freeze({translation:.24,rotation:4*Math.PI/180,slots:4})
const gain={directHit:1,explosion:.8,environmentExplosion:.8,boostStart:1}
const falloff=(distance,range)=>Math.max(0,1-distance/range)**2
const envelope=(age,duration,damping)=>age>=duration?0:(1-Math.exp(-age*160))*(1-age/duration)**2*Math.exp(-damping*age)

export class CameraImpactFX{
 constructor(source=null){
  this.camera=source?source.clone(false):null
  this.slots=Array.from({length:4},()=>({active:false,age:0,strength:0,blur:0,duration:0,direction:new Vector3()}))
  this.translation=new Vector3();this.rotation=new Vector3();this.direction=new Vector3();this.inverse=new Quaternion();this.turn=new Quaternion();this.euler=new Euler(0,0,0,'YXZ')
  this.blurDirection=new Vector2(0,1);this.presentation={camera:null,blurDirection:this.blurDirection,blurFocus:new Vector2(.5,.5),blurPixels:0,blurBlend:0}
 }
 reset(){for(const slot of this.slots)slot.active=false;this.translation.set(0,0,0);this.rotation.set(0,0,0);this.presentation.blurPixels=this.presentation.blurBlend=0}
 add(event,player,config){
  const direct=event.kind==='directHit',boost=event.kind==='boostStart',distance=direct||boost?0:Math.hypot(event.origin.x-player.x,event.origin.y-player.y,event.origin.z-player.z)
  if(event.kind==='enemyImpact'||direct&&!config.blurEnabled&&!config.shakeEnabled)return
  if(boost){if(!config.shakeEnabled||this.slots.some(s=>s.active&&s.kind!=='boostStart'))return}
  const strength=event.strength*gain[event.kind]*falloff(distance,config.range)
  if(!(strength>0))return
  // Acceleration uses the same pool/limits, with strict combat priority.
  // A combat event retains exactly its original response, never a reduced
  // budget or a displaced slot because of the boost-start impulse.
  if(!boost)for(const s of this.slots)if(s.kind==='boostStart')s.active=false
  const slots=this.slots.slice(0,config.maxConcurrent)
  let slot=slots.find(s=>!s.active)
  if(!slot){slot=slots.reduce((a,b)=>a.strength<=b.strength?a:b);if(slot.strength>=strength)return}
  // Invid destruction has its own amplification; other impacts and the
  // approved Cyclone boost keep their existing settings and response.
  const power=event.kind==='explosion'?(config.explosionPower??1):1,extension=1+(power-1)*.2
  Object.assign(slot,{active:true,kind:event.kind,shake:event.kind==='explosion'||boost||direct,shakeScale:(event.shakeScale??1)*(direct?.12:1),age:0,strength,power,duration:direct?.2:config.duration*extension,damping:direct?12:config.damping/Math.sqrt(power),blurDuration:config.blurDuration*extension,blurPixels:config.blurPixels*power,blur:direct?event.strength:['explosion','environmentExplosion'].includes(event.kind)?event.strength*falloff(distance,config.blurRange):0})
  if(event.origin)slot.direction.set(event.origin.x-player.x,event.origin.y-player.y,event.origin.z-player.z)
  else slot.direction.set(0,0,-1)
  if(slot.direction.lengthSq()<1e-8)slot.direction.set(0,0,-1)
  slot.direction.normalize()
 }
 update(delta,source,player,config,events=[]){
  const dt=Number.isFinite(delta)?Math.max(0,delta):0,result=this.presentation
  result.camera=source;result.blurPixels=result.blurBlend=0;this.translation.set(0,0,0);this.rotation.set(0,0,0);this.blurDirection.set(0,0)
  if(!config.shakeEnabled&&!config.blurEnabled){this.reset();return result}
  for(const [i,slot]of this.slots.entries())if(slot.active){slot.age+=dt;if(i>=config.maxConcurrent||slot.age>=Math.max(slot.duration,slot.blurDuration))slot.active=false}
  for(const event of events)this.add(event,player,config)
  source.updateWorldMatrix(true,false);source.getWorldQuaternion(this.inverse).invert()
  let budget=0,blurBudget=0,blurPixels=config.blurPixels,maxPower=1
  for(const slot of this.slots){
   if(!slot.active)continue
   this.direction.copy(slot.direction).applyQuaternion(this.inverse)
   // Sample a newborn pulse within its first display interval. At low FPS a
   // zero-only birth frame could otherwise skip the entire short response.
   const age=slot.age===0?Math.min(dt*.5,1/60):slot.age
   const energy=slot.shake?slot.strength*envelope(age,slot.duration,slot.damping):0,wave=Math.sin(age*Math.PI*2*13),kick=energy*wave*slot.power*slot.shakeScale
   if(slot.shake)maxPower=Math.max(maxPower,slot.power)
   budget+=energy
   this.translation.x-=this.direction.x*kick;this.translation.y-=this.direction.y*kick;this.translation.z-=this.direction.z*kick*.25
   // Do not cancel a low frontal hit against a fixed upward pitch bias.
   // Vertical and longitudinal reactions reinforce the source's elevation.
   const pitch=slot.kind==='boostStart'?.65:this.direction.y*.8+Math.sign(this.direction.y||-this.direction.z)*Math.abs(this.direction.z)*.4
   this.rotation.x+=pitch*kick;this.rotation.y-=this.direction.x*.8*kick;this.rotation.z+=this.direction.x*.25*kick
   const blur=slot.blur*envelope(age,slot.blurDuration,slot.damping)*slot.power
   if(blur>0)blurPixels=Math.max(blurPixels,slot.blurPixels)
   blurBudget+=blur;this.blurDirection.x+=this.direction.x*blur;this.blurDirection.y+=this.direction.y*blur
  }
  const normalize=1/Math.max(1,budget)
  this.translation.multiplyScalar(normalize*config.intensity*CAMERA_IMPACT_LIMITS.translation).clampLength(0,CAMERA_IMPACT_LIMITS.translation*maxPower)
  this.rotation.multiplyScalar(normalize*config.intensity*CAMERA_IMPACT_LIMITS.rotation).clampLength(0,CAMERA_IMPACT_LIMITS.rotation*maxPower)
  if(config.shakeEnabled&&(this.translation.lengthSq()+this.rotation.lengthSq()>1e-18)){
   // A detached camera for this draw only. The gameplay camera, parent,
   // projection, raycaster, orbit target and controller history never change.
   if(!this.camera||this.camera.type!==source.type)this.camera=source.clone(false)
   this.camera.copy(source,false);this.camera.parent=null
   this.camera.matrixAutoUpdate=true;this.camera.matrixWorldAutoUpdate=true
   source.matrixWorld.decompose(this.camera.position,this.camera.quaternion,this.camera.scale)
   this.camera.position.add(this.direction.copy(this.translation).applyQuaternion(this.camera.quaternion))
   this.turn.setFromEuler(this.euler.set(this.rotation.x,this.rotation.y,this.rotation.z,'YXZ'));this.camera.quaternion.multiply(this.turn)
   this.camera.updateMatrixWorld(true);result.camera=this.camera
  }
  if(config.blurEnabled&&blurBudget>0){
   if(this.blurDirection.lengthSq()<1e-8)this.blurDirection.set(0,1)
   this.blurDirection.normalize();result.blurPixels=blurPixels;result.blurBlend=config.blurIntensity*Math.min(1,blurBudget)
  }
  if(!config.shakeEnabled){this.translation.set(0,0,0);this.rotation.set(0,0,0)}
  return result
 }
}
