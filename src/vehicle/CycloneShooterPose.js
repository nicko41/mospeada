import {Vector3,Quaternion,MathUtils} from 'three'

// A temporary layer above the existing mounted IK. The source clips, left
// grip, legs and all transformation poses remain owned by their controllers.
export class CycloneShooterPose{
  constructor(instance){
    this.instance=instance;this.blend=0;this.saved=null
    this.shoulder=new Vector3();this.direction=new Vector3();this.target=new Vector3();this.pole=new Vector3();this.forearm=new Vector3();this.hand=new Vector3();this.orientation=new Quaternion();this.turn=new Quaternion()
    const mesh=instance.skins[0].mesh,joint=mesh.skeleton.bones.findIndex(b=>b.name.endsWith('RightHand'))
    this.fingerAxis=new Vector3(-1,0,0).transformDirection(mesh.bindMatrix).transformDirection(mesh.skeleton.boneInverses[joint])
    this.thumbAxis=new Vector3(0,0,1).transformDirection(mesh.bindMatrix).transformDirection(mesh.skeleton.boneInverses[joint])
    this.neutralHand=instance.sourceScene.getObjectByName(mesh.skeleton.bones[joint].name).quaternion.clone()
    this.twistAxis=new Vector3();this.thumb=new Vector3();this.up=new Vector3();this.cross=new Vector3()
  }
  restore(){
    if(this.saved){this.saved.forEach(({bone,q})=>bone.quaternion.copy(q));this.saved=null}
    for(const {mesh} of this.instance.skins)if(mesh.morphTargetInfluences?.length===3)mesh.morphTargetInfluences[2]=0
  }
  apply(point,enabled,dt,gripping=false,options=null){
    const motion=this.instance.mountedMotion,limb=motion?.limbs.find(l=>!l.leg&&l.side==='Right')
    if(!limb)return
    this.blend=MathUtils.damp(this.blend,enabled?1:0,enabled?12:22,dt)
    if(this.blend<.001)return
    this.saved=[limb.a,limb.b,limb.c].map(bone=>({bone,q:bone.quaternion.clone()}))
    limb.a.getWorldPosition(this.shoulder);this.direction.copy(point).sub(this.shoulder).normalize()
    this.target.copy(this.shoulder).addScaledVector(this.direction,(limb.l1+limb.l2)*(options?.reach??1)-.025)
    if(options?.pole)this.pole.copy(options.pole)
    else this.pole.copy(motion.body.localToWorld(this.pole.set(-.7,.5,.6)))
    limb.c.getWorldQuaternion(this.orientation)
    this.forearm.copy(this.fingerAxis).applyQuaternion(this.orientation).normalize()
    this.turn.setFromUnitVectors(this.forearm,this.direction)
    limb.c.getWorldQuaternion(this.orientation).premultiply(this.turn)
    motion.solve(limb,this.target,this.pole,this.orientation)
    if(gripping){
      // Supinate the forearm as a unit. The wrist itself stays in its original
      // neutral frame rather than twisting the glove independently inwards.
      limb.c.quaternion.copy(this.neutralHand);motion.wrapper.updateMatrixWorld(true)
      limb.c.getWorldPosition(this.hand);limb.b.getWorldPosition(this.forearm);this.twistAxis.subVectors(this.hand,this.forearm).normalize()
      this.thumb.copy(this.thumbAxis).applyQuaternion(limb.c.getWorldQuaternion(this.orientation));this.thumb.addScaledVector(this.twistAxis,-this.thumb.dot(this.twistAxis)).normalize()
      this.up.set(0,1,0).addScaledVector(this.twistAxis,-this.twistAxis.y).normalize()
      const angle=Math.atan2(this.twistAxis.dot(this.cross.crossVectors(this.thumb,this.up)),this.thumb.dot(this.up))
      this.turn.setFromAxisAngle(this.twistAxis,angle);limb.b.getWorldQuaternion(this.orientation).premultiply(this.turn);motion.worldRotation(limb.b,this.orientation)
      if(options?.alignGrip>0){
        // Armor keeps the weapon rigidly attached to the glove. Aim with the
        // forearm itself, instead of turning the gun independently in its palm.
        limb.c.getWorldPosition(this.hand)
        this.direction.subVectors(point,this.hand).normalize()
        this.forearm.copy(this.fingerAxis).applyQuaternion(limb.c.getWorldQuaternion(this.orientation)).normalize()
        this.turn.setFromUnitVectors(this.forearm,this.direction)
        this.orientation.identity().slerp(this.turn,options.alignGrip);this.turn.copy(this.orientation)
        limb.b.getWorldQuaternion(this.orientation).premultiply(this.turn);motion.worldRotation(limb.b,this.orientation)
      }
    }
    for(const {bone,q}of this.saved){this.orientation.copy(bone.quaternion);bone.quaternion.copy(q).slerp(this.orientation,this.blend)}
    for(const {mesh} of this.instance.skins)if(mesh.morphTargetInfluences?.length===3)mesh.morphTargetInfluences[2]=gripping?0:this.blend
    motion.wrapper.updateMatrixWorld(true)
  }
}
