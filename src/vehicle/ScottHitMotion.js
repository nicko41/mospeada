import {Matrix4,Quaternion,Vector3} from 'three'
import {playerCombat} from '../player/playerCombat.js'
import {bodyProbes,SCOTT_DEFEAT,supportScottArmorOnGround} from './ScottDefeatMotion.js'
import {landingArmSamples} from './ArmorLandingMotion.js'

export const SCOTT_HIT=Object.freeze({flinch:.42,fall:.45,downHold:.22,getUp:1.2,release:.22,knockdownCooldown:4,directFallChance:.22})
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)}
const total=SCOTT_HIT.fall+SCOTT_HIT.downHold+SCOTT_HIT.getUp+SCOTT_HIT.release

// Reversible source-rig poses. No copied mesh, changed clip, or modified bone
// lengths. This layer runs after weapon IK and before Armor attachments.
export class ScottHitMotion{
  constructor(instance,wrapper,runtime,random=Math.random){
    Object.assign(this,{instance,wrapper,runtime,random,applied:false,age:Infinity,cooldown:0,knockedDown:false,actor:null})
    this.version=playerCombat.hitVersion;this.resetVersion=playerCombat.resetVersion
    this.collisionVersion=runtime.invidContact?.version||0
    this.point=new Vector3();this.before=new Vector3();this.hipOffset=new Vector3();this.delta=new Quaternion();this.identity=new Quaternion()
    this.matrix=new Matrix4();this.inverse=new Matrix4();this.floor=NaN;this.armorProbes=null
    const stand=instance.sourceClips.find(c=>c.name===SCOTT_DEFEAT.source),squat=instance.sourceClips.find(c=>c.name==='air_squat'),dodge=instance.sourceClips.find(c=>c.name==='Roll_Dodge_4'),arms=landingArmSamples(instance)
    this.records=[...instance.bones.values()].map(bone=>{
      const leg=/(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(bone.name),body=/Spine|Shoulder/.test(bone.name)
      const track=(leg?squat:body?dodge:null)?.tracks.find(t=>t.name===bone.name+'.quaternion'),sample=track?.createInterpolant()
      const impulse=sample?new Quaternion().fromArray(sample.evaluate(0)).normalize().invert().multiply(new Quaternion().fromArray(sample.evaluate(leg?.32:.23)).normalize()):null
      return{bone,p:new Vector3(),q:new Quaternion(),native:new Quaternion(),nativeP:new Vector3(),impulse,leg,arm:arms.get(bone.name),
        quaternion:stand?.tracks.find(t=>t.name===bone.name+'.quaternion')?.createInterpolant(),position:stand?.tracks.find(t=>t.name===bone.name+'.position')?.createInterpolant()}
    })
    this.hip=this.records.find(r=>r.bone.name==='mixamorigHips')
    this.skins=instance.skins.map(({mesh})=>({mesh,ids:bodyProbes(mesh.geometry)}))
  }
  restore(){
    if(!this.applied)return
    for(const r of this.records){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q)}
    this.wrapper.position.copy(this.before);this.applied=false
  }
  reset(){
    this.restore();this.knockedDown=false;this.age=Infinity;this.cooldown=0
    if(this.runtime.armorController?.state)this.runtime.armorController.state.knockedDown=false
    this.actor=this.runtime.state;this.version=playerCombat.hitVersion;this.resetVersion=playerCombat.resetVersion
    this.collisionVersion=this.runtime.invidContact?.version||0
  }
  startHit(kind=playerCombat.hitKind,sample){
    this.version=playerCombat.hitVersion
    if(this.knockedDown)return
    const armor=this.runtime.armorController,a=armor?.state
    const collision=kind==='scout-body',direct=kind==='scout-projectile',claw=kind==='scout-claw'
    const canFall=this.hip?.position&&this.cooldown===0&&(collision||armor?.active&&a.height<1.25&&!a.jump&&!a.groundLanding)
    this.age=0;this.variant=this.version%2
    this.kind=kind
    if(canFall&&(collision||claw||direct&&this.random()<SCOTT_HIT.directFallChance)){
      this.knockedDown=true;this.cooldown=SCOTT_HIT.knockdownCooldown
      if(armor?.active){
        this.returnMode=a.mode
        a.knockedDown=true;a.mode='ARMOR_GROUND';a.groundTurn=null;a.boosting=false;a.boostBlend=0
        if(collision)a.vx=a.vz=0;else{a.vx*=.25;a.vz*=.25}
        if(collision){a.jump=null;a.groundLanding=null}
        a.vy=Math.min(a.vy,-3)
      }else{
        const s=this.runtime.state
        // Nonfatal body contact uses the existing on-foot control frame. No
        // defeat/health event, bike crash, or edits to source clips are needed.
        if(s.riderMode!=='onFoot'){
          const x=this.wrapper.position.x,z=this.wrapper.position.z,ground=sample(x,z)
          s.pedestrian={x,z,ground:Number.isFinite(ground)?ground:s.height,yaw:s.yaw,phase:0,moving:false,motionBlend:0,runBlend:0,crouchBlend:0,feet:{Left:null,Right:null}}
          s.riderMode='onFoot';s.dismountBlend=1
        }
        s.pedestrian.moving=false;s.speed=0;s.boostTime=s.boostBlend=s.boostKick=0
        this.runtime.boostQueued=false
      }
      this.hipOffset.copy(this.hip.bone.position).sub(this.point.fromArray(this.hip.position.evaluate(SCOTT_DEFEAT.sourceStandingTime)))
      this.instance.missilePose?.cancel();this.runtime.gallant?.aimLock.clear()
    }
  }
  apply(dt,sample){
    const r=this.runtime
    if(this.actor!==r.state||this.resetVersion!==playerCombat.resetVersion)this.reset()
    if(playerCombat.dead||r.ending?.holding||r.transformEntry?.phase&&!['idle','complete'].includes(r.transformEntry.phase)){
      this.reset();return
    }
    if(!r.paused){
      this.cooldown=Math.max(0,this.cooldown-dt)
      const contact=r.invidContact
      if(contact&&contact.version!==this.collisionVersion){this.collisionVersion=contact.version;this.startHit('scout-body',sample)}
      if(this.version!==playerCombat.hitVersion)this.startHit(playerCombat.hitKind,sample)
      this.age+=dt
    }
    if(this.knockedDown&&this.age>=total){
      this.knockedDown=false
      if(r.armorController?.active){r.armorController.state.knockedDown=false;r.armorController.state.mode=this.returnMode}
    }
    if(!this.knockedDown&&this.age>=SCOTT_HIT.flinch)return
    this.before.copy(this.wrapper.position)
    const weight=this.knockedDown?smooth(this.age/.1)*(1-smooth((this.age-(total-SCOTT_HIT.release))/SCOTT_HIT.release)):Math.sin(Math.PI*Math.min(1,this.age/SCOTT_HIT.flinch))*.55
    const nativeTime=this.age<SCOTT_HIT.fall?SCOTT_DEFEAT.sourceStandingTime*(1-smooth(this.age/SCOTT_HIT.fall)):
      this.age<SCOTT_HIT.fall+SCOTT_HIT.downHold?0:SCOTT_DEFEAT.sourceStandingTime*smooth((this.age-SCOTT_HIT.fall-SCOTT_HIT.downHold)/SCOTT_HIT.getUp)
    for(const b of this.records){
      b.p.copy(b.bone.position);b.q.copy(b.bone.quaternion)
      if(this.knockedDown){
        if(b.quaternion)b.bone.quaternion.slerp(b.native.fromArray(b.quaternion.evaluate(nativeTime)).normalize(),weight)
        if(b===this.hip&&b.position)b.bone.position.lerp(b.nativeP.fromArray(b.position.evaluate(nativeTime)).add(this.hipOffset),weight)
      }else{
        if(b.impulse)b.bone.quaternion.multiply(this.delta.copy(this.identity).slerp(b.impulse,weight*(b.leg?.3:.35)))
        if(b.arm)b.bone.quaternion.slerp(this.variant?b.arm.back:b.arm.front,weight*.75)
      }
    }
    this.wrapper.updateMatrixWorld(true)
    // A bounded set of cached source-mesh support points. Sample terrain once
    // at the stationary actor, instead of rescanning the mesh on every hit.
    if(this.knockedDown){
      const a=r.armorController?.active?r.armorController.state:r.state.pedestrian,floor=this.floor=sample(a.x,a.z);let lowest=Infinity
      for(const {mesh,ids} of this.skins)for(const id of ids){mesh.getVertexPosition(id,this.point);mesh.localToWorld(this.point);lowest=Math.min(lowest,this.point.y)}
      if(Number.isFinite(floor)&&lowest<floor+.015){this.wrapper.position.y+=floor+.015-lowest;this.wrapper.updateMatrixWorld(true)}
    }
    this.applied=true
    this.diagnostics={kind:this.kind,phase:this.knockedDown?this.age<SCOTT_HIT.fall?'fall':this.age<SCOTT_HIT.fall+SCOTT_HIT.downHold?'down':'get-up':'flinch',age:this.age}
  }
  groundArmor(articulation){if(this.knockedDown&&this.runtime.armorController?.active)supportScottArmorOnGround(articulation,this.floor,this.wrapper,this)}
}
