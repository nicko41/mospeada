import {MathUtils,Quaternion,Vector3} from 'three'
import {CycloneShooterPose} from './CycloneShooterPose.js'

// Native Armor animation owns the arm unless the player explicitly aims.
// The arm can aim over walk/run and every vertical-strafe phase. Explicit
// ground landings/dives keep their own full-body impact choreography.
export const armorWeaponAvailable=state=>!state.knockedDown&&!state.groundLanding&&(!(state.diveBlend>.001)||!!state.jump)
export class ArmorGallantPose extends CycloneShooterPose{
  constructor(instance){
    super(instance);this.aimBlend=0;this.point=new Vector3();this.elbow=new Vector3();this.torso=[]
    this.axis=new Vector3(0,1,0);this.bodyTurn=new Quaternion();this.options={reach:.98,pole:this.elbow,alignGrip:1}
    this.spines=['Spine','Spine1','Spine2'].map(n=>instance.bones.get('mixamorig'+n)).filter(Boolean)
  }
  restore(){super.restore();for(const {bone,q} of this.torso)bone.quaternion.copy(q);this.torso.length=0}
  applyArmor(aimPoint,aiming,state,dt,recoil=0,hurt=0){
    const motion=this.instance.mountedMotion,limb=motion?.limbs.find(l=>!l.leg&&l.side==='Right')
    if(!limb)return
    if(!armorWeaponAvailable(state)){this.blend=this.aimBlend=0;return}
    this.aimBlend=MathUtils.damp(this.blend,aiming?1:0,aiming?12:22,dt)
    if(this.aimBlend<.001){this.blend=this.aimBlend=0;return}
    const aimYaw=Math.atan2(aimPoint.x-state.x,aimPoint.z-state.z)
    const yaw=MathUtils.clamp(Math.atan2(Math.sin(aimYaw-state.yaw),Math.cos(aimYaw-state.yaw)),-1.45,1.45)*this.aimBlend
    for(const bone of this.spines){
      this.torso.push({bone,q:bone.quaternion.clone()})
      bone.getWorldQuaternion(this.orientation)
      this.bodyTurn.setFromAxisAngle(this.axis,yaw/this.spines.length)
      motion.worldRotation(bone,this.orientation.premultiply(this.bodyTurn))
      // Brief additive flinch; neither health nor recoil takes locomotion away.
      bone.rotateX(-hurt*.018)
    }
    motion.wrapper.updateMatrixWorld(true)
    limb.a.getWorldPosition(this.shoulder)
    const fx=Math.sin(state.yaw),fz=Math.cos(state.yaw)
    this.point.copy(aimPoint)
    this.direction.subVectors(this.point,this.shoulder).normalize()
    this.point.addScaledVector(this.direction,-recoil*.025);this.point.y+=recoil*.035
    this.elbow.copy(this.shoulder).add(this.direction.set(fx*.35-Math.cos(state.yaw)*.6,-.45,fz*.35+Math.sin(state.yaw)*.6))
    this.options.reach=.98-recoil*.045
    // Blending out uses the native pose evaluated this frame, never a custom
    // lowered/resting IK pose or a forced forearm/wrist orientation.
    super.apply(this.point,aiming,dt,true,this.options)
  }
  reset(){this.restore();this.blend=this.aimBlend=0}
}
