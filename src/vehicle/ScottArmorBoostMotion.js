import {Quaternion} from 'three'
import {returnProgress,sampleReturnPhases} from './returnChoreography.js'

const clamp=n=>Math.max(0,Math.min(1,n))
const ramp=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x)}
export function armorBoostLegWeight(entry,state){
  if(entry?.returnFlight){
    const t=sampleReturnPhases(entry.returnProgress??returnProgress(entry)).seconds
    return ramp(0,.12,t)*(1-ramp(.24,.52,t))
  }
  if(entry?.phase==='armorboost')return ramp(0,.10,entry.time)*(1-ramp(.30,.65,entry.time))
  return entry?.phase==='complete'?clamp(Math.max(state?.boostBlend||0,(state?.boostKick||0)*.85)):0
}

// Source Running's trailing stride bends both knees with heels behind the
// pelvis. Apply only those local chains; torso and Armor anchors stay intact.
export class ScottArmorBoostMotion{
  constructor(instance,wrapper){
    this.wrapper=wrapper;this.applied=false;this.records=[]
    const clip=instance.sourceClips?.find(c=>c.name==='Running')
    if(!clip)return
    for(const side of ['Left','Right'])for(const suffix of ['UpLeg','Leg','Foot','ToeBase']){
      const name=`mixamorig${side}${suffix}`,bone=instance.bones.get(name),track=clip.tracks.find(t=>t.name===name+'.quaternion')
      if(bone&&track)this.records.push({bone,q:new Quaternion(),target:new Quaternion().fromArray(track.createInterpolant().evaluate(clip.duration*(side==='Left'?.70:.20))).normalize(),reverse:new Quaternion().fromArray(track.createInterpolant().evaluate(clip.duration*(side==='Left'?.20:.70))).normalize()})
    }
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.wrapper.updateMatrixWorld(true);this.applied=false}
  apply(entry,state){
    this.weight=armorBoostLegWeight(entry,state)
    const reverse=entry?.phase==='complete'&&!entry.returnFlight?clamp(state?.reverseBlend||0):0
    if(this.weight<=0&&reverse<=0)return
    for(const r of this.records){r.q.copy(r.bone.quaternion);r.bone.quaternion.slerp(r.target,this.weight);r.bone.quaternion.slerp(r.reverse,reverse)}
    this.wrapper.updateMatrixWorld(true);this.applied=true
  }
}
