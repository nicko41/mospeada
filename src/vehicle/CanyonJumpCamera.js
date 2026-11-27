import {MathUtils,Raycaster,Spherical,Vector3} from 'three'
import {FOREST_STAGE2 as S,stage2Void,stage2LipZ} from '../world/forest/forestStage2Config.js'
import {canyonFloor} from '../world/forest/forestCanyon.js'
import {raycastRideBarriers} from './rideSurface.js'
import {smoothCamera} from './cameraFraming.js'

const controls=['enabled','enableDamping','enableRotate','enablePan','enableZoom']
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle))
export class CanyonJumpCamera{
 constructor(camera,orbit,runtime,config,sample){
  Object.assign(this,{camera,orbit,runtime,config,sample,shot:null})
  this.center=new Vector3();this.position=new Vector3();this.target=new Vector3();this.hip=new Vector3();this.bike=new Vector3();this.spherical=new Spherical();this.ray=new Raycaster()
 }
 eligible(s){return !!(this.runtime.levelProgress&&s?.riderMode==='mounted'&&s.airborne&&stage2Void(s.x,s.z)&&!this.runtime.paused&&!this.runtime.armorController?.active&&(!this.runtime.transformEntry||this.runtime.transformEntry.phase==='idle'))}
 begin(s){
  this.lastOutcome=null
  const {camera,orbit}=this,saved=Object.fromEntries(controls.map(key=>[key,orbit[key]]))
  orbit.enableDamping=false;orbit.update()
  this.center.set(s.x,s.height+1.05,s.z);this.spherical.setFromVector3(this.position.copy(camera.position).sub(this.center))
  this.shot={actor:s,phase:'orbit',controls:saved,startTheta:this.spherical.theta,startYaw:s.travelYaw??s.yaw,phi:this.spherical.phi,radius:this.spherical.radius,angle:0,age:0,progress:0,crash:null}
  this.runtime.canyonCameraActive=true
 }
 lock(){for(const key of controls)this.orbit[key]=false}
 cannotClear(s){
  // Optimistic upper bound: even an unused boost applied right now cannot
  // clear the lip. This only chooses a camera shot, never changes the jump.
  const c=this.config,gravity=c.gravity*c.airGravityScale,vy=(s.verticalVelocity||0)+(s.airBoostUsed?0:c.airBoostVerticalImpulse)
  const earliest=Math.max(0,s.z-S.canyon.landingZ)/Math.max(1,c.airBoostMaxSpeed,Math.abs(s.speed))
  const time=Math.max(earliest,vy/gravity),height=s.height+vy*time-gravity*time*time*.5
  return height<S.canyon.landingHeight-.5
 }
 fail(s,crash){
  const q=this.shot;q.phase='conceal';q.age=0;q.crash=crash
  q.fromPosition=this.camera.position.clone()
  q.fromDirection=this.camera.getWorldDirection(new Vector3())
  q.floorAt=crash?.floorAt||canyonFloor
  // After the half-turn the camera faces back toward the takeoff side (+Z).
  // Retreat onto the opposite bank without turning away from that view.
  const bankZ=stage2LipZ(s.x,true)-12,bankHeight=this.sample(s.x,bankZ)
  q.crossingPosition=new Vector3(s.x,Math.max(q.fromPosition.y,Number.isFinite(bankHeight)?bankHeight+4:S.canyon.landingHeight+4),bankZ)
 }
 draw(position,target,floorAt=null){
  this.position.copy(position)
  if(floorAt){const floor=floorAt(this.position.x,this.position.z);if(Number.isFinite(floor))this.position.y=Math.max(this.position.y,floor+.45)}
  this.orbit.target.copy(target);this.camera.position.copy(this.position);this.camera.lookAt(target);this.camera.updateMatrixWorld(true)
 }
 orbitView(s,theta,radius,phi){
  this.center.set(s.x,s.height+1.05,s.z);this.spherical.set(radius,phi,theta)
  this.position.copy(this.center).add(this.target.setFromSpherical(this.spherical))
  const floor=this.sample(this.position.x,this.position.z);if(Number.isFinite(floor))this.position.y=Math.max(this.position.y,floor+.4)
  this.ray.ray.origin.copy(this.center);this.ray.ray.direction.subVectors(this.position,this.center);this.ray.far=this.ray.ray.direction.length();this.ray.ray.direction.normalize()
  const wall=raycastRideBarriers(this.ray)
  if(wall)this.position.copy(this.center).addScaledVector(this.ray.ray.direction,Math.max(.4,wall.distance-.4))
  this.draw(this.position,this.center)
 }
 update(s,delta){
  if(this.shot&&this.shot.actor!==s)this.finish()
  const crash=this.runtime.canyonCrash||this.runtime.canyonFall
  if(!this.shot){if(!s||!crash&&!this.eligible(s))return false;this.begin(s)}
  const q=this.shot,dt=this.runtime.paused?0:Math.max(0,Math.min(.1,delta));this.lock()
  if(crash&&!['conceal','approach','reveal','settled'].includes(q.phase))this.fail(s,crash)
  if(q.phase==='orbit'){
   q.progress=Math.max(q.progress,MathUtils.clamp((stage2LipZ(s.x)-s.z)/(stage2LipZ(s.x)-stage2LipZ(s.x,true)),0,1))
   const t=smoothCamera(q.progress/.5);q.angle=Math.PI*t
   this.orbitView(s,q.startTheta+q.angle,MathUtils.lerp(q.radius,6.5,t),MathUtils.lerp(q.phi,1.16,t))
   if(q.progress>=.5&&this.cannotClear(s))this.fail(s,null)
   else if(s.z<stage2LipZ(s.x,true)-3&&s.frontHasSurface!==false&&s.rearHasSurface!==false&&s.height>S.canyon.landingHeight-.25){q.phase='closing';q.age=0;q.closeAngle=q.angle}
   return true
  }
  if(q.phase==='closing'){
   q.age+=dt;const t=smoothCamera(q.age/.95),turn=wrap((s.travelYaw??s.yaw)-q.startYaw)
   q.angle=MathUtils.lerp(q.closeAngle,2*Math.PI+turn,t)
   const radius=(this.followRadius??Math.hypot(this.config.cameraDistance,this.config.cameraHeight-1.05))+Math.min(Math.abs(s.speed),80)*this.config.cameraSpeedPullback
   this.orbitView(s,q.startTheta+q.angle,MathUtils.lerp(6.5,radius,t),MathUtils.lerp(1.16,Math.atan2(this.config.cameraDistance,this.config.cameraHeight-1.05),t))
   if(t===1){this.lastOutcome={kind:'success',angle:q.angle,progress:q.progress};this.finish()}
   return true
  }
  if(q.phase==='conceal'){
   q.age+=dt
   this.position.lerpVectors(q.fromPosition,q.crossingPosition,smoothCamera(q.age/.95))
   this.target.copy(q.fromDirection).lerp(new Vector3(0,0,1),smoothCamera(q.age/.16)).normalize().multiplyScalar(20).add(this.position)
   this.draw(this.position,this.target)
   const fall=this.runtime.scottInstance?.defeatMotion,bike=this.runtime.bikeDefeatMotion
   if(q.age>=.95&&fall?.active&&fall.contact&&bike?.settled&&this.runtime.defeat?.ready){q.phase='approach';q.age=0;q.fromPosition=this.camera.position.clone()}
   return true
  }
  const fall=this.runtime.scottInstance?.defeatMotion
  if(fall?.hip?.bone)fall.hip.bone.getWorldPosition(this.hip);else this.hip.set(s.x,s.height,s.z)
  this.bike.copy(this.runtime.vehicleRig?.root.position||this.hip)
  this.center.copy(this.hip).lerp(this.bike,.5);this.center.y=Math.max(this.hip.y,this.bike.y)+.15
  // Advance to the overlook only after both actors are down. Keep the bank
  // height: the camera never descends into the canyon alongside the bodies.
  this.position.set(this.center.x,q.crossingPosition.y,this.center.z)
  const height=this.position.y-this.center.y
  if(q.phase==='approach'){
   q.age+=dt;const t=smoothCamera(q.age/.85)
   this.position.lerpVectors(q.fromPosition,this.position,t)
   this.target.copy(this.position).add(new Vector3(0,0,20));this.draw(this.position,this.target)
   if(t===1){q.phase='reveal';q.age=0}
   return true
  }
  if(q.phase==='reveal'){
   q.age+=dt;const t=smoothCamera(q.age/1.2),tilt=t*Math.PI/2
   this.target.copy(this.position).add(new Vector3(0,-Math.sin(tilt)*height,Math.max(.0001,Math.cos(tilt))*height))
   this.draw(this.position,this.target,q.floorAt)
   if(t===1){q.phase='settled';this.lastOutcome={kind:'failure',angle:q.angle}}
  }else{this.target.copy(this.center);this.target.z+=.001;this.draw(this.position,this.target,q.floorAt)}
  return true
 }
 finish(){
  if(!this.shot)return
  const saved=this.shot.controls;this.shot=null;this.runtime.canyonCameraActive=false
  this.orbit.enableDamping=false;this.orbit.update();Object.assign(this.orbit,saved)
 }
}
