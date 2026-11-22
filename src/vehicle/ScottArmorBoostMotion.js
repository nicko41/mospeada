import {Quaternion,Vector3} from 'three'
import {returnProgress,sampleReturnPhases} from './returnChoreography.js'

const clamp=n=>Math.max(0,Math.min(1,n))
const ramp=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x)}
const ease=n=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)}
const departureWeight=(time,delay=0,rise=.30)=>ease((time-delay)/rise)*(1-ease((time-.36)/.29))
export function armorBoostLegWeight(entry,state){
  if(entry?.returnFlight){
    const t=sampleReturnPhases(entry.returnProgress??returnProgress(entry)).seconds
    return ramp(0,.12,t)*(1-ramp(.24,.52,t))
  }
  if(entry?.phase==='armorboost')return departureWeight(entry.time)
  return entry?.phase==='complete'?clamp(Math.max(state?.boostBlend||0,(state?.boostKick||0)*.85)):0
}

// Source Running's trailing stride bends both knees with heels behind the
// pelvis. Apply only those local chains; torso and Armor anchors stay intact.
export class ScottArmorBoostMotion{
  constructor(instance,wrapper,random=Math.random){
    this.wrapper=wrapper;this.applied=false;this.records=[]
    this.random=random;this.boostDirection=0;this.forwardOpen=false;this.reverseOpen=false;this.opening=0;this.variant='current'
    this.model=instance.model;this.modelQ=new Quaternion();this.parentQ=new Quaternion();this.open=new Quaternion();this.axis=new Vector3()
    const clip=instance.sourceClips?.find(c=>c.name==='Running')
    if(!clip)return
    for(const side of ['Left','Right'])for(const suffix of ['UpLeg','Leg','Foot','ToeBase']){
      const name=`mixamorig${side}${suffix}`,bone=instance.bones.get(name),track=clip.tracks.find(t=>t.name===name+'.quaternion')
      if(bone&&track)this.records.push({bone,side,thigh:suffix==='UpLeg',lag:(side==='Right'?.03:0)+(suffix==='UpLeg'?0:suffix==='Leg'?.025:.045),q:new Quaternion(),target:new Quaternion().fromArray(track.createInterpolant().evaluate(clip.duration*(side==='Left'?.70:.20))).normalize(),reverse:new Quaternion().fromArray(track.createInterpolant().evaluate(clip.duration*(side==='Left'?.20:.70))).normalize()})
    }
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.wrapper.updateMatrixWorld(true);this.applied=false}
  apply(entry,state,dt=1/60,paused=false){
    const controlled=entry?.phase==='complete'&&!entry.returnFlight
    if(!controlled||state?.disabled){this.boostDirection=0;this.forwardOpen=this.reverseOpen=false;this.opening=0;this.variant='current'}
    if(state?.disabled)return
    this.weight=armorBoostLegWeight(entry,state)
    const reverse=entry?.phase==='complete'&&!entry.returnFlight?clamp(state?.reverseBlend||0):0
    if(controlled&&!paused){
      // Select once per actual thrust, including changing direction without
      // releasing Shift. Keep the selection through braking/coasting tails.
      const direction=typeof state?.boosting==='boolean'
        ?state.boosting&&Math.abs(state.thrustForward)>.25?Math.sign(state.thrustForward):0
        :Math.max(this.weight,reverse)>.06?(reverse>this.weight?-1:1):0
      if(direction&&direction!==this.boostDirection){
        const open=this.random()<.5;this.variant=open?'open':'current'
        if(direction>0)this.forwardOpen=open;else this.reverseOpen=open
      }
      this.boostDirection=direction
      const target=Math.max(this.forwardOpen?this.weight:0,this.reverseOpen?reverse:0)
      this.opening+=(target-this.opening)*(1-Math.exp(-Math.max(0,Math.min(.1,dt))*12))
      if(this.opening<1e-5)this.opening=0
    }
    if(this.weight<=0&&reverse<=0&&this.opening===0)return
    const departure=entry?.phase==='armorboost'&&!entry.returnFlight
    // Let thighs lead, knees and ankles follow, with the right leg slightly
    // behind the left. The whole gesture still settles within the same boost.
    for(const r of this.records){
      r.q.copy(r.bone.quaternion)
      const weight=departure?departureWeight(entry.time,r.lag)*.55:this.weight
      r.bone.quaternion.slerp(r.target,weight);r.bone.quaternion.slerp(r.reverse,reverse)
    }
    // The optional open stance keeps the existing forward/reverse Running
    // chain, adding only a model-space outward rotation at the two thighs.
    // Express the outward turn in the actual model frame, preserving the
    // source Running knee/ankle flexion and the approved hover/return poses.
    if(departure||this.opening>0){
      this.model.getWorldQuaternion(this.modelQ)
      for(const r of this.records)if(r.thigh){
        r.bone.parent.getWorldQuaternion(this.parentQ)
        this.axis.set(0,0,1).applyQuaternion(this.modelQ).applyQuaternion(this.parentQ.invert())
        const opening=departure?departureWeight(entry.time,r.side==='Right'?.03:0,.24):this.opening
        this.open.setFromAxisAngle(this.axis,(r.side==='Left'?1:-1)*.6*opening)
        r.bone.quaternion.premultiply(this.open)
      }
    }
    this.wrapper.updateMatrixWorld(true);this.applied=true
  }
}
