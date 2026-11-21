import {AnimationMixer,Quaternion,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {groundFootOrientation} from './riderFootSupport.js'
import {sampleGroundLanding} from './armorGroundLanding.js'
import {sampleArmorJump} from './armorJumpMotion.js'

export function landingArmSamples(instance){
  if(instance.armorArmSamples)return instance.armorArmSamples
  const clip=instance.sourceClips.find(c=>c.name==='Running'),targets=new Map()
  if(!clip)return targets
  const model=clone(instance.sourceScene),mixer=new AnimationMixer(model),action=mixer.clipAction(clip).play(),hand=new Vector3(),shoulder=new Vector3()
  const extremes={Left:{back:Infinity,front:-Infinity},Right:{back:Infinity,front:-Infinity}}
  for(let i=0;i<60;i++){
    action.time=clip.duration*i/60;mixer.update(0);model.updateMatrixWorld(true)
    for(const side of ['Left','Right']){
      const z=model.getObjectByName(`mixamorig${side}ForeArm`).getWorldPosition(hand).z-model.getObjectByName(`mixamorig${side}Shoulder`).getWorldPosition(shoulder).z
      for(const direction of ['back','front'])if(direction==='back'?z<extremes[side].back:z>extremes[side].front){
        extremes[side][direction]=z
        for(const suffix of ['Shoulder','Arm','ForeArm','Hand']){
          const name=`mixamorig${side}${suffix}`,target=targets.get(name)||{}
          target[direction]=model.getObjectByName(name).quaternion.clone()
          // Keep the source backward shoulder swing, but open its running
          // elbow toward the original relaxed extension for the falling pose.
          if(direction==='back'&&suffix==='ForeArm')target[direction].slerp(instance.sourceScene.getObjectByName(name).quaternion,.55)
          targets.set(name,target)
        }
      }
    }
  }
  instance.sourceScene.updateWorldMatrix(true,true)
  const modelQ=instance.sourceScene.getWorldQuaternion(new Quaternion())
  for(const side of ['Left','Right'])for(const suffix of ['Shoulder','Arm','ForeArm','Hand']){
    const name=`mixamorig${side}${suffix}`,target=targets.get(name),bone=instance.sourceScene.getObjectByName(name)
    if(!target||!bone)continue
    target.raised=bone.quaternion.clone()
    if(suffix==='Arm'){
      const axis=new Vector3(0,0,1).applyQuaternion(modelQ).applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert())
      target.raised.premultiply(new Quaternion().setFromAxisAngle(axis,(side==='Left'?1:-1)*.61))
    }
    if(suffix==='ForeArm')target.raised.slerp(target.front,.25)
  }
  mixer.stopAllAction();mixer.uncacheRoot(model);instance.armorArmSamples=targets;return targets
}

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
      this.records.push({bone,q:new Quaternion(),p:new Vector3(),squat:bend.clone(),delta:neutral.invert().multiply(bend)})
    }
    const position=clip.tracks.find(t=>t.name==='mixamorigHips.position').createInterpolant(),start=new Vector3().fromArray(position.evaluate(0))
    this.hipDelta.fromArray(position.evaluate(.6)).sub(start);this.hipDelta.x=this.hipDelta.z=0
    const arms=landingArmSamples(instance)
    this.cinematicRecords=[...instance.bones.values()].map(bone=>{
      const track=clip.tracks.find(t=>t.name===bone.name+'.quaternion'),sample=track?.createInterpolant()
      const delta=sample?new Quaternion().fromArray(sample.evaluate(0)).normalize().invert().multiply(new Quaternion().fromArray(sample.evaluate(.6)).normalize()):null
      return{bone,q:new Quaternion(),p:new Vector3(),delta,squat:sample?new Quaternion().fromArray(sample.evaluate(.6)).normalize():null,arm:arms.get(bone.name)}
    })
  }
  restore(){if(!this.applied)return;for(const r of this.activeRecords||this.records){r.bone.quaternion.copy(r.q);r.bone.position.copy(r.p)}this.applied=false}
  applyCinematic(armor){
    const score=sampleGroundLanding(armor.state.groundLanding)
    this.activeRecords=this.cinematicRecords;this.weight=score.bend;this.velocity=0;this.flatWeight=score.enter
    for(const r of this.cinematicRecords){
      r.q.copy(r.bone.quaternion);r.p.copy(r.bone.position)
      const lower=/(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/.test(r.bone.name)
      if(r.delta&&(lower||/Spine/.test(r.bone.name)))r.bone.quaternion.multiply(this.delta.copy(this.identity).slerp(r.delta,lower?score.bend:score.lean))
      if(r.arm){r.bone.quaternion.slerp(r.arm.back,score.back);r.bone.quaternion.slerp(r.arm.raised,score.raised);r.bone.quaternion.slerp(r.arm.front,score.forward)}
      if(r.bone.name==='mixamorigHips')r.bone.position.addScaledVector(this.hipDelta,score.bend)
      const start=armor.landingStartPose?.get(r.bone.name)
      if(start&&score.enter<1){r.bone.quaternion.slerpQuaternions(start.q,r.bone.quaternion.clone(),score.enter);r.bone.position.lerpVectors(start.p,r.bone.position.clone(),score.enter)}
    }
    this.instance.model.updateWorldMatrix(true,true)
    this.flattenFeet(armor,score.enter)
    this.diagnostics={phase:armor.state.groundLanding.phase,...score};this.applied=true
  }
  applyJump(armor){
    const score=sampleArmorJump(armor.state)
    this.activeRecords=score.supported?this.cinematicRecords:this.records
    this.weight=this.velocity=this.flatWeight=0
    for(const r of this.activeRecords){
      r.q.copy(r.bone.quaternion);r.p.copy(r.bone.position)
      const lower=/(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/.test(r.bone.name)
      if(lower&&r.squat&&r.bone.name!=='mixamorigHips')r.bone.quaternion.slerp(r.squat,score.bend)
      else if(r.delta&&(lower||score.supported&&/Spine/.test(r.bone.name)))r.bone.quaternion.multiply(this.delta.copy(this.identity).slerp(r.delta,lower?score.bend:score.lean))
      if(score.supported){
        if(r.arm)r.bone.quaternion.slerp(r.arm.back,score.back)
        if(r.bone.name==='mixamorigHips')r.bone.position.addScaledVector(this.hipDelta,score.bend)
      }
    }
    this.instance.model.updateWorldMatrix(true,true)
    if(score.supported)this.flattenFeet(armor,1)
    this.diagnostics={phase:armor.state.jump.phase,...score};this.applied=true
  }
  flattenFeet(armor,weight){
    if(weight<=1e-5)return
    for(const foot of this.feet){
      foot.bone.parent.updateWorldMatrix(true,false)
      const desired=groundFootOrientation(this.instance.model,foot.bone.getWorldPosition(new Vector3()),armor.sample||(()=>0),foot.reference).orientation
      const local=foot.bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired)
      foot.bone.quaternion.slerp(local,weight);foot.toe.quaternion.slerp(foot.toeRest,weight)
    }
  }
  apply(armor,dt,paused){
    if(!armor?.active){this.weight=this.velocity=this.flatWeight=0;return}
    if(armor.state.groundLanding){this.applyCinematic(armor);return}
    if(armor.state.jump){this.applyJump(armor);return}
    this.activeRecords=this.records
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
    this.flattenFeet(armor,flat)
    this.applied=true
  }
}
