import {Vector3} from 'three'
import {armorConfig} from './armorPhysics.js'
import {queryColliders,overlapsFootprint} from '../player/collisionWorld.js'
import {cameraFraming,setCameraFov} from './cameraFraming.js'

export const ARMOR_LOOK_LIMITS=Object.freeze({minPitch:-1.1,maxPitch:1.25})
const AIM_SHOULDER_OFFSET=.85

export class ArmorCamera{
  constructor(camera,orbit,runtime,sample){
    Object.assign(this,{camera,orbit,runtime,sample,active:false,yaw:0,pitch:cameraFraming.armorPitch,distance:armorConfig.cameraDistance});this.anchor=new Vector3();this.target=new Vector3();this.focus=new Vector3();this.offset=new Vector3();this.desired=new Vector3();this.probe=new Vector3();this.colliders=[];this.aimOffset=0
    this.move=e=>{if(!this.active||runtime.cameraController?.middleLook.active)return;this.intro=1;this.yaw-=e.movementX*.0035;this.pitch=Math.max(ARMOR_LOOK_LIMITS.minPitch,Math.min(ARMOR_LOOK_LIMITS.maxPitch,this.pitch+e.movementY*.003))}
    this.zoomOffset=0
    this.wheel=e=>{if(this.active){this.zoomOffset=Math.max(2.4-armorConfig.cameraDistance,Math.min(10-armorConfig.cameraDistance,this.zoomOffset+e.deltaY*.003));e.preventDefault()}}
    this.down=e=>{if(this.active&&!runtime.paused&&(e.button===0||e.button===2)&&!document.pointerLockElement)orbit.domElement.requestPointerLock?.()?.catch?.(()=>{})}
    orbit.domElement.addEventListener('pointermove',this.move);orbit.domElement.addEventListener('wheel',this.wheel,{passive:false});orbit.domElement.addEventListener('mousedown',this.down)
  }
  activate(a){
    this.runtime.cameraController?.middleLook.cancel()
    this.runtime.cameraController?.finishTransformation()
    this.active=true;this.orbit.enabled=false;this.zoomOffset=0;this.aimOffset=0;this.intro=0;this.anchor.set(a.x,a.y+cameraFraming.armorTargetHeight,a.z)
    this.offset.copy(this.camera.position).sub(this.anchor);this.distance=Math.max(2.4,Math.min(8,this.offset.length()));this.yaw=Math.atan2(-this.offset.x,-this.offset.z);this.pitch=Math.asin(Math.max(Math.sin(ARMOR_LOOK_LIMITS.minPitch),Math.min(.9,this.offset.y/this.distance)))
  }
  deactivate(){if(!this.active)return;this.runtime.cameraController?.middleLook.cancel();this.active=false;this.orbit.enabled=true;if(document.pointerLockElement===this.orbit.domElement)document.exitPointerLock();this.runtime.cameraController?.beginArmorReturn(this.runtime.state)}
  update(a,delta){
    if(!this.active)return
    const dt=Math.min(.1,Math.max(0,delta)),target=this.target.set(a.x,a.y+cameraFraming.armorTargetHeight,a.z)
    const middle=this.runtime.cameraController?.middleLook,looking=middle?.active,viewYaw=looking?middle.theta(a.yaw)+Math.PI:this.yaw,viewPitch=looking?Math.PI/2-middle.phi:this.pitch
    this.focus.copy(target)
    const combat=this.runtime.gallant,aimWeight=!looking&&combat?.active?Math.max(combat.aiming||combat.firing?1:0,this.runtime.scottInstance?.armorGallantPose?.aimBlend||0):0
    this.aimOffset+=(AIM_SHOULDER_OFFSET*aimWeight-this.aimOffset)*(1-Math.exp(-dt*12))
    // Move the framing beside Scott only while aiming. The reticle/ray stays
    // centred; Scott's backpack no longer occupies the player's line of sight.
    target.x-=Math.cos(this.yaw)*this.aimOffset;target.z+=Math.sin(this.yaw)*this.aimOffset
    this.camera.position.add(this.desired.copy(target).sub(this.anchor));this.anchor.copy(target)
    this.distance+=(armorConfig.cameraDistance+this.zoomOffset-this.distance)*(1-Math.exp(-dt*5))
    if(this.intro<.7){this.intro+=dt;this.pitch+=(cameraFraming.armorPitch-this.pitch)*(1-Math.exp(-dt*7))}
    setCameraFov(this.camera,this.camera.fov+(cameraFraming.armorFov-this.camera.fov)*(1-Math.exp(-dt*8)))
    const distance=this.distance+a.boostBlend*.45
    this.offset.set(-Math.sin(viewYaw)*Math.cos(viewPitch)*distance,Math.sin(viewPitch)*distance,-Math.cos(viewYaw)*Math.cos(viewPitch)*distance)
    this.desired.copy(target).add(this.offset);this.camera.position.lerp(this.desired,1-Math.exp(-dt*armorConfig.cameraResponse))
    queryColliders(Math.min(this.focus.x,this.camera.position.x)-.2,Math.min(this.focus.z,this.camera.position.z)-.2,Math.max(this.focus.x,this.camera.position.x)+.2,Math.max(this.focus.z,this.camera.position.z)+.2,this.colliders)
    for(let i=1;i<=16;i++){
      this.probe.lerpVectors(this.focus,this.camera.position,i/16)
      if(this.colliders.some(c=>this.probe.y>c.minY-.1&&this.probe.y<c.maxY+.1&&overlapsFootprint(c,this.probe.x,this.probe.z,.18))){this.camera.position.lerpVectors(this.focus,this.camera.position,Math.max(.1,(i-1)/16));break}
    }
    const floor=this.sample(this.camera.position.x,this.camera.position.z);if(Number.isFinite(floor))this.camera.position.y=Math.max(floor+.35,this.camera.position.y)
    this.camera.lookAt(target);this.camera.updateMatrixWorld(true);this.orbit.target.copy(target)
  }
  dispose(){this.deactivate();this.orbit.domElement.removeEventListener('pointermove',this.move);this.orbit.domElement.removeEventListener('wheel',this.wheel);this.orbit.domElement.removeEventListener('mousedown',this.down)}
}
