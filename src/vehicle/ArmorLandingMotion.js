import {Quaternion,Vector3} from 'three'
import {groundFootOrientation} from './riderFootSupport.js'

// Ground contact/landing response from the EXISTING air_squat. No gait cycle,
// foot IK or changes to the rig/attachments; restore before next evaluation.
export class ArmorLandingMotion{
  constructor(instance){
    this.instance=instance;this.records=[];this.applied=false;this.weight=0;this.velocity=0;this.flatWeight=0;this.delta=new Quaternion();this.identity=new Quaternion();this.hipDelta=new Vector3()
    instance.sourceScene.updateWorldMatrix(true,true)
    const inverse=instance.sourceScene.getWorldQuaternion(new Quaternion()).invert()
    this.feet=['Left','Right'].map(side=>({bone:instance.bones.get(`mixamorig${side}Foot`),toe:instance.bones.get(`mixamorig${side}ToeBase`),reference:inverse.clone().multiply(instance.sourceScene.getObjectByName(`mixamorig${side}Foot`).getWorldQuaternion(new Quaternion())),toeRest:instance.sourceScene.getObjectByName(`mixamorig${side}ToeBase`).quaternion.clone()}))
    const clip=instance.sourceClips.find(c=>c.name==='air_squat')
    if(!clip)return
    for(const [name,bone] of instance.bones){
      if(!/(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/.test(name))continue
      const track=clip.tracks.find(t=>t.name===name+'.quaternion')
      if(!track)continue
      const sample=track.createInterpolant(),neutral=new Quaternion().fromArray(sample.evaluate(0)).normalize(),bend=new Quaternion().fromArray(sample.evaluate(.6)).normalize()
      this.records.push({bone,q:new Quaternion(),p:new Vector3(),delta:neutral.invert().multiply(bend)})
    }
    const position=clip.tracks.find(t=>t.name==='mixamorigHips.position').createInterpolant(),start=new Vector3().fromArray(position.evaluate(0))
    this.hipDelta.fromArray(position.evaluate(.6)).sub(start);this.hipDelta.x=this.hipDelta.z=0
  }
  restore(){if(!this.applied)return;for(const r of this.records){r.bone.quaternion.copy(r.q);r.bone.position.copy(r.p)}this.applied=false}
  apply(armor,dt,paused){
    if(!armor?.active){this.weight=this.velocity=this.flatWeight=0;return}
    const a=armor.state,ground=a.mode==='ARMOR_GROUND'&&!a.jump&&a.grounded
    const idle=ground?.10*(1-(this.instance.armorLocomotion?.weight||0)):0,target=ground?idle+.65*a.settle:0
    if(!paused){
      const count=Math.max(1,Math.ceil(dt*120)),h=dt/count
      for(let i=0;i<count;i++){
        this.velocity+=((target-this.weight)*220-this.velocity*18)*h;this.weight=Math.max(0,Math.min(.65,this.weight+this.velocity*h))
        if(this.weight===0&&this.velocity<0)this.velocity=0
      }
      const flat=ground&&a.speed<.08&&!a.groundTurn?1:0
      this.flatWeight+=(flat-this.flatWeight)*(1-Math.exp(-dt*15))
    }
    const flat=this.flatWeight*(1-(this.instance.armorLocomotion?.weight||0))
    if(this.weight<1e-5&&flat<1e-5)return
    for(const r of this.records){
      r.q.copy(r.bone.quaternion);r.p.copy(r.bone.position)
      r.bone.quaternion.multiply(this.delta.copy(this.identity).slerp(r.delta,this.weight))
      if(r.bone.name==='mixamorigHips')r.bone.position.addScaledVector(this.hipDelta,this.weight)
    }
    this.instance.model.updateWorldMatrix(true,true)
    if(flat>1e-5)for(const foot of this.feet){
      foot.bone.parent.updateWorldMatrix(true,false)
      const desired=groundFootOrientation(this.instance.model,foot.bone.getWorldPosition(new Vector3()),armor.sample||(()=>0),foot.reference).orientation
      const local=foot.bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired)
      foot.bone.quaternion.slerp(local,flat);foot.toe.quaternion.slerp(foot.toeRest,flat)
    }
    this.applied=true
  }
}
