import {Vector3,MathUtils} from 'three'
import {setCameraFov} from './cameraFraming.js'
import {FOREST_STAGE3 as S} from '../world/forest/forestStage3Config.js'

export class CycloneShooterCamera{
  constructor(camera,runtime){Object.assign(this,{camera,runtime});this.position=new Vector3();this.target=new Vector3();this.entryPosition=new Vector3();this.entryTarget=new Vector3();this.anchor=new Vector3();this.scratch=new Vector3();this.started=false;this.lastTarget=new Vector3()}
  update(encounter,s,dt){
    const orbit=this.runtime.orbit,c=this.runtime.cameraController
    if(!encounter.active){if(this.started)this.finish(s);return false}
    if(!this.started){this.started=true;this.previous={enabled:orbit.enabled,damping:orbit.enableDamping,fov:this.camera.fov};this.anchor.set(s.x,s.height,s.z);this.entryPosition.copy(this.camera.position).sub(this.anchor);this.entryTarget.copy(orbit.target).sub(this.anchor);orbit.enableDamping=false;orbit.update();orbit.enabled=false;this.lastTarget.copy(orbit.target)}
    this.scratch.set(s.x,s.height,s.z).sub(this.anchor);this.camera.position.add(this.scratch);this.lastTarget.add(this.scratch);this.anchor.set(s.x,s.height,s.z)
    const yaw=s.travelYaw??s.yaw,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=-fz,rz=fx
    this.position.set(s.x-fx*3.15+rx*1.25,s.height+1.95,s.z-fz*3.15+rz*1.25)
    this.target.set(s.x+fx*9+rx*1.8,s.height+1.55,s.z+fz*9+rz*1.8)
    const entry=MathUtils.smoothstep(encounter.time/S.entryTime,0,1)
    this.position.lerpVectors(this.scratch.copy(this.entryPosition).add(this.anchor),this.position,entry);this.target.lerpVectors(this.scratch.copy(this.entryTarget).add(this.anchor),this.target,entry)
    let fov=MathUtils.lerp(this.previous.fov,58,entry)
    if(encounter.phase==='exiting'){
      const t=MathUtils.smoothstep(encounter.phaseTime/S.exitTime,0,1),config=c.config
      this.position.lerp(this.scratch.set(s.x-fx*config.cameraDistance,s.height+config.cameraHeight,s.z-fz*config.cameraDistance),t)
      this.target.lerp(this.scratch.set(s.x,s.height+1.05,s.z),t);fov=MathUtils.lerp(58,70,t)
    }
    const blend=1-Math.exp(-Math.min(dt,.1)*12);this.camera.position.lerp(this.position,blend);this.lastTarget.lerp(this.target,blend);this.camera.lookAt(this.lastTarget);orbit.target.copy(this.lastTarget);setCameraFov(this.camera,fov)
    return true
  }
  finish(s){
    if(!this.started)return
    const orbit=this.runtime.orbit,c=this.runtime.cameraController
    if(!orbit||!c){this.started=false;return}
    orbit.enableDamping=false;orbit.update();orbit.enableDamping=this.previous.damping;orbit.enabled=this.previous.enabled;this.runtime.cameraMode=0
    c.anchor.copy(c.center(s));c.radius=Math.hypot(c.config.cameraDistance,c.config.cameraHeight-1.05);c.collisionRadius=c.radius;c.lastInput=c.time;this.started=false;setCameraFov(this.camera,70)
  }
}
