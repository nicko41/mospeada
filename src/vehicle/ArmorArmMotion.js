import {Quaternion,Vector3} from 'three'
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt))

// Secondary gestures AFTER the complete native gait. Original T-pose arms
// and source Running elbows; no new clips, bones, IK or attachment changes.
export class ArmorArmMotion{
  constructor(instance){
    this.instance=instance;this.applied=false;this.lift=0;this.sway=0;this.records=[];this.axis=new Vector3();this.parent=new Quaternion();this.delta=new Quaternion();this.local=new Quaternion()
    const run=instance.sourceClips.find(c=>c.name==='Running')
    for(const side of ['Left','Right'])for(const suffix of ['Arm','ForeArm','Hand']){
      const name=`mixamorig${side}${suffix}`,bone=instance.bones.get(name),original=instance.sourceScene.getObjectByName(name)
      if(!bone||!original)continue
      const target=original.quaternion.clone(),track=run?.tracks.find(t=>t.name===name+'.quaternion')
      if(suffix==='ForeArm'&&track)target.fromArray(track.createInterpolant().evaluate(run.duration*(side==='Left'?.5:0))).normalize()
      this.records.push({bone,suffix,target,q:new Quaternion()})
    }
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.applied=false}
  apply(armor,body,dt,paused){
    if(!armor?.active){this.lift=this.sway=0;return}
    const a=armor.state,flight=a.jump?Math.min(.65,.35+Math.abs(a.vy)/13*.25):0
    const target=Math.max(flight,(a.diveBlend||0)*.95,a.mode==='ARMOR_GROUND'?a.settle*.85:0)
    const sway=a.mode==='ARMOR_HOVER'||a.jump?-(body?.bank||0)*a.boostBlend*.55:0
    if(!paused){this.lift=damp(this.lift,target,10,dt);this.sway=damp(this.sway,sway,9,dt)}
    if(this.lift<1e-5&&Math.abs(this.sway)<1e-5)return
    this.instance.model.updateWorldMatrix(true,true)
    this.axis.set(0,0,1).transformDirection(this.instance.model.matrixWorld)
    for(const r of this.records){
      r.q.copy(r.bone.quaternion)
      r.bone.quaternion.slerp(r.target,this.lift*(r.suffix==='Arm'?1:r.suffix==='ForeArm'?.4:.2))
      if(r.suffix==='Arm'&&Math.abs(this.sway)>1e-5){
        r.bone.parent.updateWorldMatrix(true,false);r.bone.parent.getWorldQuaternion(this.parent)
        this.delta.setFromAxisAngle(this.axis,this.sway)
        this.local.copy(this.parent).invert().multiply(this.delta).multiply(this.parent)
        r.bone.quaternion.premultiply(this.local)
      }
    }
    this.diagnostics={lift:this.lift,sway:this.sway};this.applied=true
  }
}
