import {FOREST_STAGE2 as S,inForestStage2,stage2Void,stage2Checkpoint} from './forestStage2Config.js'
import {Raycaster,Vector3} from 'three'
import {raycastRideBarriers} from '../../vehicle/rideSurface.js'
import {canyonFloor} from './forestCanyon.js'
export class ForestStage2Progress{
  constructor(){this.ray=new Raycaster();this.end=new Vector3();this.reset()}
  reset(){this.checkpoint=null;this.recoveries=0}
  observe(s){
    // The checkpoint is a fixed tested ground pose, not the current bike pose.
    // Arm it even if a fast first jump is still airborne over the trigger.
    if(!this.checkpoint&&s.z<S.checkpointTriggerZ&&s.z>S.canyon.lipZ&&Number.isFinite(s.height))this.checkpoint=stage2Checkpoint()
  }
  airEnabled(s,phase='idle'){return phase==='idle'&&inForestStage2(s.x,s.z)}
  allowsVoid(x,z){return stage2Void(x,z)}
  sweepWall(s,x,z,yaw){
    if(!s.airborne||s.riderMode!=='mounted'||s.z>S.canyon.lipZ+24||s.z<S.canyon.landingZ-40||Math.abs(s.x)>S.halfWidth)return null
    this.ray.ray.origin.set(s.x,s.height+.85,s.z)
    this.end.set(x+Math.sin(yaw)*1.35,s.height+.85,z+Math.cos(yaw)*1.35)
    this.ray.ray.direction.subVectors(this.end,this.ray.ray.origin);this.ray.far=this.ray.ray.direction.length();if(this.ray.far<1e-5)return null
    this.ray.ray.direction.normalize();const hit=raycastRideBarriers(this.ray)
    // Only the cliff is registered as a barrier; upper terrain is separate.
    if(!hit)return null
    return {point:hit.point,normal:hit.normal,yaw,height:s.height,floorAt:canyonFloor,wallOffset:p=>this.wallOffset(p,hit.normal),constrainBike:s=>this.constrainBike(s,hit.normal)}
  }
  wallOffset(point,normal){
    this.ray.ray.origin.copy(point).addScaledVector(normal,3);this.ray.ray.direction.copy(normal).negate();this.ray.far=6
    const hit=raycastRideBarriers(this.ray)
    return hit?3-hit.distance+.015:-Infinity
  }
  constrainBike(s,normal){
    // The rock widens toward its foot. Let the falling bike slide outward
    // over the rendered strata instead of disappearing inside that overhang.
    this.end.copy(normal).setY(0).normalize();this.ray.ray.origin.set(s.x,s.height+.65,s.z).addScaledVector(this.end,26)
    this.ray.ray.direction.copy(this.end).negate();this.ray.far=27.35
    const hit=raycastRideBarriers(this.ray)
    if(hit){s.x=hit.point.x+this.end.x*1.35;s.z=hit.point.z+this.end.z*1.35}
  }
  needsRecovery(s){return !!this.checkpoint&&(s.height<S.fallY||!Number.isFinite(s.height))}
  recover(resetAt){if(!this.checkpoint)return false;this.recoveries++;resetAt(this.checkpoint);return true}
}
