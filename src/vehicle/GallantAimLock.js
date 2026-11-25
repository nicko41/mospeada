import {Ray,Vector2,Vector3} from 'three'
import {GALLANT_FIRE} from './GallantShot.js'

export const GALLANT_AIM_LOCK=Object.freeze({enabled:true,acquireRadius:.32,retainRadius:1.1})

// A held aim keeps one visible Scout or prototype drone. The real muzzle ray still resolves
// damage and cover; locking never creates a hit or extends weapon range.
export class GallantAimLock{
 constructor(){this.target=null;this.point=new Vector3();this.screen=new Vector2();this.projection=new Vector3();this.candidate=new Vector3();this.direction=new Vector3();this.ray=new Ray();this.state=null}
 clear(){this.target=null}
 inspect(target,camera,pointer,hitscan,retained=false){
  if(!target||target.dead||target.evading||target.health<=0||target.hp<=0||target.meleeEnabled===false)return Infinity
  if(target.spawned!==undefined?!target.spawned:!target.view?.root.visible)return Infinity
  this.candidate.copy(target.position);this.candidate.y+=(target.height||0)*.55
  const distance=camera.position.distanceTo(this.candidate);if(distance>GALLANT_FIRE.range||distance<.01)return Infinity
  this.projection.copy(this.candidate).project(camera)
  if(this.projection.z< -1||this.projection.z>1||Math.abs(this.projection.x)>1.1||Math.abs(this.projection.y)>1.1)return Infinity
  const error=Math.hypot((this.projection.x-pointer.x)*camera.aspect,this.projection.y-pointer.y)
  if(error>(retained?GALLANT_AIM_LOCK.retainRadius:GALLANT_AIM_LOCK.acquireRadius))return Infinity
  this.ray.set(camera.position,this.direction.subVectors(this.candidate,camera.position).normalize())
  if(hitscan.castWorld(this.ray,Math.max(0,distance-.15)).solid)return Infinity
  return error+distance*.0001
 }
 update(aiming,camera,pointer,targets,hitscan,state){
  if(this.state!==state){this.clear();this.state=state}
  if(!GALLANT_AIM_LOCK.enabled||!aiming){this.clear();return null}
  if(!targets.includes(this.target)||!Number.isFinite(this.inspect(this.target,camera,pointer,hitscan,true))){
   this.clear();let best=Infinity
   for(const target of targets){const score=this.inspect(target,camera,pointer,hitscan);if(score<best){best=score;this.target=target}}
  }
  if(this.target){this.point.copy(this.target.position);this.point.y+=(this.target.height||0)*.55;this.projection.copy(this.point).project(camera);this.screen.set(this.projection.x,this.projection.y)}
  return this.target
 }
}
