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
    return {target,solid:world.solid,point:world.point,normal:world.normal,object:world.object,collider:world.collider}
  }
  castWorld(ray,range=GALLANT_FIRE.range){
    let distance=range,solid=false,colliderHit=null,object=null
    ray.at(distance,this.end)
    queryColliders(Math.min(ray.origin.x,this.end.x),Math.min(ray.origin.z,this.end.z),Math.max(ray.origin.x,this.end.x),Math.max(ray.origin.z,this.end.z),this.blockers)
    for(const collider of this.blockers){
      const at=rayColliderDistance(ray,collider)
      if(at<=distance){distance=at;solid=true;colliderHit=collider}
    }
    this.raycaster.ray.copy(ray);this.raycaster.near=.001;this.raycaster.far=distance
    const terrain=raycastRideSurfaces(this.raycaster)
    if(terrain&&terrain.distance<=distance){distance=terrain.distance;solid=true;colliderHit=null;object=terrain.object}
    ray.at(distance,this.point)
    this.normal.copy(ray.direction).negate()
    if(object)this.normal.copy(terrain.normal)
    else if(colliderHit){
      const c=colliderHit,p=this.point
      if(c.type==='cylinder'){
        if(Math.abs(p.y-c.minY)<1e-5)this.normal.set(0,-1,0)
        else if(Math.abs(p.y-c.maxY)<1e-5)this.normal.set(0,1,0)
        else this.normal.set(p.x-c.x,0,p.z-c.z).normalize()
      }else{
        const gaps=[Math.abs(p.x-c.minX),Math.abs(p.x-c.maxX),Math.abs(p.y-c.minY),Math.abs(p.y-c.maxY),Math.abs(p.z-c.minZ),Math.abs(p.z-c.maxZ)],face=gaps.indexOf(Math.min(...gaps))
        this.normal.set(0,0,0).setComponent(Math.floor(face/2),face%2?1:-1)
      }
    }
    return {solid,point:this.point,distance,normal:this.normal,object,collider:colliderHit}
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
    return {hit:accepted?target:null,point:result.point.clone(),normal:result.normal.clone(),object:result.object,collider:result.collider,solid:result.solid,destroyed:accepted&&(target.health<=0||target.state===ENTITY_STATE.DEAD||!!target.dead)}
  }
}
