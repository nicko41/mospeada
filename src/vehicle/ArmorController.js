import {Vector3} from 'three'
import {advanceArmor,armorConfig,createArmorState} from './armorPhysics.js'

export class ArmorController{
  constructor(runtime,rig,sample,canMove){Object.assign(this,{runtime,rig,sample,canMove,active:false,state:null});this.point=new Vector3()}
  activate(){
    const s=this.runtime.state,e=this.runtime.transformEntry,instance=this.runtime.scottInstance
    if(this.active||e?.phase!=='complete'||!instance)return false
    // Absorb the already-visible cinematic offset exactly once. No change to
    // assembly-local poses, actor origin, scale or bone anchors.
    const offset=e.actorOffset
    s.x+=offset.x;s.z+=offset.z;s.height+=offset.y;s.frontSpring+=offset.y;s.rearSpring+=offset.y;offset.set(0,0,0)
    instance.model.updateWorldMatrix(true,true)
    instance.armorBaseHipPosition=instance.bones.get('mixamorigHips').position.clone()
    instance.armorReferencePose=[...instance.bones.values()].map(bone=>({bone,position:bone.position.clone(),scale:bone.scale.clone()}))
    if(instance.armorReaction)instance.armorReaction.boost=instance.armorReaction.reverse=instance.armorReaction.side=instance.armorReaction.forward=instance.armorReaction.vertical=0
    let sole=Infinity
    for(const limb of instance.mountedMotion?.limbs.filter(l=>l.leg)||[]){
      const mesh=instance.skins[0].mesh
      for(const id of limb.soleIds)sole=Math.min(sole,mesh.localToWorld(mesh.getVertexPosition(id,this.point)).y)
    }
    const a=this.state=createArmorState(s,Number.isFinite(sole)?sole-s.height:0)
    const contact={},height=this.sample(a.x,a.z,contact);a.ground=Number.isFinite(height)?height:0;a.surface=contact.surface||'dirt'
    this.frontOffset=s.frontSpring-s.height;this.rearOffset=s.rearSpring-s.height
    this.active=true;this.runtime.boostQueued=false
    this.camera?.activate(a);return true
  }
  toggle(){if(this.active){this.state.mode=this.state.mode==='ARMOR_HOVER'?'ARMOR_GROUND':'ARMOR_HOVER';this.state.groundTurn=null}}
  update(input,dt){
    if(!this.active)return
    const a=this.state,instance=this.runtime.scottInstance
    if(instance?.armorBaseHipPosition&&!a.groundTurn){
      instance.bones.get('mixamorigHips').parent.localToWorld(this.point.copy(instance.armorBaseHipPosition))
      const x=this.point.x-a.x,z=this.point.z-a.z
      a.pelvisOffsetX=Math.cos(a.yaw)*x-Math.sin(a.yaw)*z;a.pelvisOffsetZ=Math.sin(a.yaw)*x+Math.cos(a.yaw)*z
    }
    advanceArmor(a,input,dt,this.sample,this.canMove,armorConfig,instance?.armorLocomotion?.turns)
    this.sync()
  }
  sync(){
    const a=this.state,s=this.runtime.state
    s.x=a.x;s.z=a.z;s.height=a.y;s.yaw=a.yaw;s.travelYaw=Math.atan2(a.vx,a.vz);s.speed=a.speed
    s.pitch=a.pitch;s.lean=0;s.bank=a.bank;s.wheelieAngle=0;s.boostTime=0;s.boostBlend=a.boostBlend;s.boostKick=0;s.boostCooldown=0;s.brakeBlend=0;s.idleBlend=0;s.riderStand=0
    s.frontSpring=a.y+this.frontOffset;s.rearSpring=a.y+this.rearOffset;s.frontVelocity=s.rearVelocity=s.verticalVelocity=a.vy
    s.frontGrounded=s.rearGrounded=false;s.airborne=true;s.parked=false;s.reverseIntent=false;s.reverseBlend=0;s.handbrake=0
  }
  deactivate(){
    if(!this.active)return
    this.sync();this.active=false;this.camera?.deactivate()
    const s=this.runtime.state,a=this.state
    s.speed=a.speed;s.travelYaw=Math.atan2(a.vx,a.vz);s.boostBlend=0;this.runtime.boostQueued=false
    if(this.runtime.scottInstance){delete this.runtime.scottInstance.armorBaseHipPosition;delete this.runtime.scottInstance.armorReferencePose}
  }
  reset(){this.active=false;this.state=null;this.camera?.deactivate()}
  guardFloor(instance,wrapper){
    if(!this.active||this.state.height>.65)return
    let correction=0
    for(const limb of instance.mountedMotion?.limbs.filter(l=>l.leg)||[]){
      const mesh=instance.skins[0].mesh
      for(const id of limb.soleIds){mesh.localToWorld(mesh.getVertexPosition(id,this.point));const ground=this.sample(this.point.x,this.point.z);if(Number.isFinite(ground))correction=Math.max(correction,ground+.008-this.point.y)}
    }
    if(correction>0){
      this.state.y+=correction;this.state.vy=Math.max(0,this.state.vy);this.sync()
      this.rig.root.position.y+=correction;wrapper.position.y+=correction;this.rig.root.updateMatrixWorld(true);wrapper.updateMatrixWorld(true)
    }
  }
}
