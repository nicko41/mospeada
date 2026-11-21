import {Box3,Raycaster,Vector3} from 'three'
import {combatTargets} from '../player/meleeWorld.js'
import {queryColliders,rayColliderDistance} from '../player/collisionWorld.js'
import {MELEE_DAMAGE,ENTITY_STATE} from '../player/meleeConfig.js'
import {emitEntityImpact} from '../world/entityImpactState.js'
import {raycastRideSurfaces} from './rideSurface.js'

export const GALLANT_FIRE=Object.freeze({interval:.24,range:55,damage:MELEE_DAMAGE,recoilTime:.14})

// Shared nearest-target query. Plano 3 retains its approved generous drone
// boxes; Armor uses the compatible enemies' existing logical body bounds.
export class GallantTargeting{
  constructor(){this.box=new Box3();this.hit=new Vector3()}
  target(ray,targets,point,bounds,eligible,range=Infinity){
    let selected=null,distance=range
    for(const target of targets){
      if(!eligible(target))continue
      bounds(target,this.box)
      if(ray.intersectBox(this.box,this.hit)){
        const at=ray.origin.distanceTo(this.hit)
        if(at<distance){distance=at;selected=target;point.copy(this.hit)}
      }
    }
    if(!selected)ray.at(Math.min(range,GALLANT_FIRE.range),point)
    return selected
  }
}
const enemyBounds=(target,box)=>{
  target.syncPosition?.()
  const p=target.position,r=target.radius
  box.min.set(p.x-r,p.y,p.z-r);box.max.set(p.x+r,p.y+target.height,p.z+r)
}
const enemyEligible=t=>typeof t.receiveHit==='function'&&t.meleeEnabled!==false&&t.state!==ENTITY_STATE.DEAD&&!t.dead&&(t.health===undefined||t.health>0)

export class GallantHitscan{
  constructor(){
    this.targeting=new GallantTargeting();this.point=new Vector3();this.end=new Vector3();this.direction=new Vector3();this.normal=new Vector3()
    this.raycaster=new Raycaster();this.blockers=[]
  }
  cast(ray,range=GALLANT_FIRE.range){
    let target=this.targeting.target(ray,combatTargets(),this.point,enemyBounds,enemyEligible,range)
    const distance=target?ray.origin.distanceTo(this.point):range
    const world=this.castWorld(ray,distance)
    if(world.solid)target=null
    return {target,solid:world.solid,point:world.point}
  }
  castWorld(ray,range=GALLANT_FIRE.range){
    let distance=range,solid=false
    ray.at(distance,this.end)
    queryColliders(Math.min(ray.origin.x,this.end.x),Math.min(ray.origin.z,this.end.z),Math.max(ray.origin.x,this.end.x),Math.max(ray.origin.z,this.end.z),this.blockers)
    for(const collider of this.blockers){
      const at=rayColliderDistance(ray,collider)
      if(at<=distance){distance=at;solid=true}
    }
    this.raycaster.ray.copy(ray);this.raycaster.near=.001;this.raycaster.far=distance
    const terrain=raycastRideSurfaces(this.raycaster)
    if(terrain&&terrain.distance<=distance){distance=terrain.distance;solid=true}
    ray.at(distance,this.point)
    return {solid,point:this.point,distance}
  }
  fire(ray,range=GALLANT_FIRE.range){
    const result=this.cast(ray,range),target=result.target
    let accepted=false
    if(target){
      this.direction.copy(ray.direction);this.direction.y=0
      if(this.direction.lengthSq()<1e-6)this.direction.set(0,0,1)
      this.direction.normalize()
      accepted=target.receiveHit(GALLANT_FIRE.damage,this.direction,this.direction)!==false
      if(accepted){this.normal.copy(ray.direction).negate();emitEntityImpact(result.point,this.normal,target)}
    }
    // Snapshot the endpoint: later aim queries reuse the temporary vectors.
    return {hit:accepted?target:null,point:result.point.clone(),solid:result.solid,destroyed:accepted&&(target.health<=0||target.state===ENTITY_STATE.DEAD||!!target.dead)}
  }
}
