import {Ray,Vector2,Vector3} from 'three'

export const GALLANT_AIM_LOCK=Object.freeze({enabled:true,acquireRadius:.32,retainRadius:1.1,maxDistance:220,missileLockSeconds:3})

// A held aim keeps one visible Scout or prototype drone. The real muzzle ray still resolves
// damage and cover; locking never creates a hit or extends Gallant range.
export class GallantAimLock{
 constructor(){this.target=null;this.lockAge=0;this.point=new Vector3();this.screen=new Vector2();this.projection=new Vector3();this.candidate=new Vector3();this.direction=new Vector3();this.ray=new Ray();this.state=null}
 clear(){this.target=null;this.lockAge=0}
 get progress(){return this.target?.receiveMissileHit?Math.min(1,this.lockAge/GALLANT_AIM_LOCK.missileLockSeconds):0}
 get ready(){return !!this.target?.receiveMissileHit&&!this.target.dead&&this.target.meleeEnabled!==false&&this.progress>=1}
 inspect(target,camera,pointer,hitscan,retained=false){
  if(!target||target.dead||target.evading||target.health<=0||target.hp<=0||target.meleeEnabled===false)return Infinity
  if(target.spawned!==undefined?!target.spawned:!target.view?.root.visible)return Infinity
  this.candidate.copy(target.position);this.candidate.y+=(target.height||0)*.55
  const distance=camera.position.distanceTo(this.candidate);if(distance>GALLANT_AIM_LOCK.maxDistance||distance<.01)return Infinity
  this.projection.copy(this.candidate).project(camera)
  if(this.projection.z< -1||this.projection.z>1||Math.abs(this.projection.x)>1.1||Math.abs(this.projection.y)>1.1)return Infinity
  const error=Math.hypot((this.projection.x-pointer.x)*camera.aspect,this.projection.y-pointer.y)
  if(error>(retained?GALLANT_AIM_LOCK.retainRadius:GALLANT_AIM_LOCK.acquireRadius))return Infinity
  this.ray.set(camera.position,this.direction.subVectors(this.candidate,camera.position).normalize())
  if(hitscan.castWorld(this.ray,Math.max(0,distance-.15)).solid)return Infinity
  return error+distance*.0001
 }
 update(aiming,camera,pointer,targets,hitscan,state,delta=0){
  if(this.state!==state){this.clear();this.state=state}
  if(!GALLANT_AIM_LOCK.enabled||!aiming){this.clear();return null}
  if(!targets.includes(this.target)||!Number.isFinite(this.inspect(this.target,camera,pointer,hitscan,true))){
   this.clear();let best=Infinity
   for(const target of targets){const score=this.inspect(target,camera,pointer,hitscan);if(score<best){best=score;this.target=target}}
  }
  if(this.target){if(Number.isFinite(delta))this.lockAge=Math.min(GALLANT_AIM_LOCK.missileLockSeconds,this.lockAge+Math.max(0,delta));this.point.copy(this.target.position);this.point.y+=(this.target.height||0)*.55;this.projection.copy(this.point).project(camera);this.screen.set(this.projection.x,this.projection.y)}
  return this.target
 }
}

export function cuffMissileLockReady(lock,aiming,target=lock?.target){return !!(aiming&&lock?.ready&&target===lock.target&&typeof target?.receiveMissileHit==='function'&&!target.dead&&target.meleeEnabled!==false)}
