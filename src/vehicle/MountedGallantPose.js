import {MathUtils,Matrix4,Quaternion,Vector3} from 'three'
import {CycloneShooterPose} from './CycloneShooterPose.js'

// Pick once per RMB hold. Both variants use the existing mounted arm solver;
// the motorcycle controller, torso, legs and Armor pose remain independent.
export class MountedGallantPose extends CycloneShooterPose{
  constructor(instance,random=Math.random){
    super(instance);this.random=random;this.aimHeld=false;this.twoHanded=false;this.supportBlend=0
    this.supportPoint=new Vector3();this.supportWrist=new Vector3();this.supportPole=new Vector3();this.supportScale=new Vector3();this.supportPalm=new Vector3()
    this.supportQ=new Quaternion();this.supportFrame=new Matrix4();this.supportLocalFrame=new Quaternion();this.supportUp=new Vector3();this.supportSide=new Vector3();this.supportAim=new Vector3();this.options={target:this.supportAim,targetBlend:0}
    const mesh=instance.skins[0].mesh,left=instance.mountedMotion.limbs.find(l=>!l.leg&&l.side==='Left'),hand=instance.hands[0],shape=hand?.sides.find(h=>h.sign>0)
    const joint=mesh.skeleton.bones.indexOf(left.c),bind=new Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[joint],mesh.bindMatrix)
    const finger=new Vector3(1,0,0).transformDirection(bind),thumb=new Vector3(0,0,1).transformDirection(bind);thumb.addScaledVector(finger,-thumb.dot(finger)).normalize()
    this.supportLocalFrame.setFromRotationMatrix(new Matrix4().makeBasis(finger,thumb,new Vector3().crossVectors(finger,thumb))).invert()
    let count=0
    if(shape)for(const id of hand.affected){
      const p=mesh.geometry.attributes.position,u=(p.getX(id)-shape.wrist.x)/shape.length,z=(p.getZ(id)-shape.wrist.z)/shape.length
      if(u>.48&&u<.65&&z>-.1&&z<.22){mesh.getVertexPosition(id,this.supportPoint);mesh.localToWorld(this.supportPoint);left.c.worldToLocal(this.supportPoint);this.supportPalm.add(this.supportPoint);count++}
    }
    if(count)this.supportPalm.divideScalar(count)
  }
  applyMounted(point,aiming,dt,weapon){
    if(aiming&&!this.aimHeld)this.twoHanded=this.random()<.5
    this.aimHeld=aiming
    this.supportBlend=MathUtils.damp(this.supportBlend,aiming&&this.twoHanded?1:0,aiming?12:22,dt)
    const motion=this.instance.mountedMotion,left=motion.limbs.find(l=>!l.leg&&l.side==='Left'),right=motion.limbs.find(l=>!l.leg&&l.side==='Right')
    left.a.getWorldPosition(this.supportAim);right.a.getWorldPosition(this.supportPoint);this.supportAim.add(this.supportPoint).multiplyScalar(.5)
    this.direction.subVectors(point,this.supportAim).normalize();this.supportAim.addScaledVector(this.direction,Math.min(left.l1+left.l2,right.l1+right.l2)*.64)
    this.options.targetBlend=this.supportBlend
    super.apply(point,aiming,dt,true,this.options)
    if(this.supportBlend<.001||!this.saved)return
    weapon.present(this.instance,true,point,this.blend)
    if(!weapon.instance)return
    const records=[left.a,left.b,left.c].map(bone=>({bone,q:bone.quaternion.clone()}));this.saved.push(...records)
    weapon.hand.localToWorld(this.supportPoint.copy(weapon.palm))
    this.direction.subVectors(point,this.supportPoint).normalize()
    this.supportUp.set(0,1,0).addScaledVector(this.direction,-this.direction.y).normalize();this.supportSide.crossVectors(this.direction,this.supportUp).normalize()
    // The left glove cups the shooting hand beside/below the same grip.
    this.supportPoint.addScaledVector(this.supportSide,-.055).addScaledVector(this.supportUp,-.025).addScaledVector(this.direction,.012)
    this.supportQ.setFromRotationMatrix(this.supportFrame.makeBasis(this.direction,this.supportUp,this.supportSide)).multiply(this.supportLocalFrame)
    left.c.getWorldScale(this.supportScale)
    this.supportWrist.copy(this.supportPalm).multiply(this.supportScale).applyQuaternion(this.supportQ).negate().add(this.supportPoint)
    motion.body.localToWorld(this.supportPole.set(.7,.5,.6))
    motion.solve(left,this.supportWrist,this.supportPole,this.supportQ)
    for(const {bone,q}of records){this.orientation.copy(bone.quaternion);bone.quaternion.copy(q).slerp(this.orientation,this.supportBlend)}
    motion.wrapper.updateMatrixWorld(true)
  }
}
