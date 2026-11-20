import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import {returnProgress,sampleReturnPhases} from './returnChoreography.js'

const clamp=n=>Math.max(0,Math.min(1,n))
const ramp=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x)}
const curve=(keys,t)=>{
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return keys[i-1][1]+(keys[i][1]-keys[i-1][1])*ramp(keys[i-1][0],keys[i][0],t)
  return keys.at(-1)[1]
}

// Body-only score over the EXISTING .24 s boost, 1 s assembly and .18 s
// handoff. Different clocks overlap; none changes the mechanical director.
export function sampleScottReturnMotion(entry){
  if(!entry?.returnFlight||entry.poseBlend<=0)return null
  const phases=sampleReturnPhases(entry.returnProgress??returnProgress(entry)),t=phases.seconds
  const left=curve([[0,.15],[.24,.54],[.48,.71],[.78,.57],[1.24,.27]],t)
  const right=curve([[0,.12],[.24,.46],[.56,.64],[.86,.52],[1.24,.30]],t)
  return{time:t,progress:phases.progress,cross:phases.chestCross,weight:ramp(0,.12,t),
    left,right,legLeft:ramp(.64,1.20,t),legRight:ramp(.74,1.24,t),
    feetLeft:ramp(.91,1.22,t),feetRight:ramp(.99,1.24,t),
    torso:curve([[0,.1],[.24,.22],[.68,.34],[.94,.28],[1.24,.38]],t),torsoFit:ramp(.86,1.24,t),pelvisFit:ramp(.72,1.24,t),
    reachLeft:ramp(1,1.22,t),reachRight:ramp(1.04,1.24,t),
    shoulderLeft:.5+.10*Math.sin(t*2.3),shoulderRight:.02+.10*Math.sin(Math.max(0,t-.06)*2.3),
    hip:curve([[0,0],[.10,.025],[.24,.01],[.55,.045],[.88,-.10],[1.24,-.055],[1.33,.008],[1.42,0]],t)}
}

// Runs AFTER the mechanical transformation. The existing reference pose still
// drives CHEST/cuffs/tank/wheels; this visible performance cannot move their
// anchors or alter their paths. Restore it before the next gameplay/rig step.
export class ScottReturnMotion{
  constructor(instance,wrapper){
    this.instance=instance;this.wrapper=wrapper;this.applied=false
    this.records=[...instance.bones.values()].map(b=>({bone:b,q:new Quaternion(),jump:new Quaternion()}))
    this.hips=instance.bones.get('mixamorigHips');this.hipPosition=new Vector3()
    this.tracks=new Map()
    for(const clip of instance.sourceClips||[])if(['air_squat','Running'].includes(clip.name)){
      this.tracks.set(clip.name,new Map(clip.tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>[t.name.replace('.quaternion',''),t.createInterpolant()])))
    }
    this.q=new Quaternion();this.goal=new Quaternion();this.modelQ=new Quaternion();this.up=new Vector3();this.hipWorld=new Vector3()
    this.frame=new Matrix4();this.inverseFrame=new Matrix4();this.surfaceMatrix=new Matrix4();this.box=new Box3();this.axis=new Vector3();this.turn=new Quaternion();this.parentQ=new Quaternion()
    this.arms=['Left','Right'].map(side=>({side,bone:instance.bones.get(`mixamorig${side}Hand`),to:new Vector3(),target:new Vector3()}))
  }
  restore(){
    if(!this.applied)return
    for(const r of this.records)r.bone.quaternion.copy(r.q)
    this.hips.position.copy(this.hipPosition);this.wrapper.updateMatrixWorld(true);this.applied=false
  }
  sample(clip,name,time,out){const track=this.tracks.get(clip)?.get(name);return track?out.fromArray(track.evaluate(time)).normalize():null}
  apply(entry,front=null){
    const score=sampleScottReturnMotion(entry),reference=this.instance.transformationPose
    if(!score||!reference||!this.tracks.has('air_squat'))return
    const {weight}=score
    if(weight<=0)return
    this.score=score
    this.hipPosition.copy(this.hips.position)
    const jump=new Map([...reference.records,...reference.lower].map(r=>[r.bone,r.quaternion]))
    for(const r of this.records){r.q.copy(r.bone.quaternion);r.jump.copy(jump.get(r.bone)||r.q)}
    this.wrapper.updateMatrixWorld(true)
    // Read the already solved jump posture (real grips/pegs, current suspension)
    // without running another mixer or keeping another skeleton.
    for(const r of this.records)r.bone.quaternion.copy(r.jump)
    this.wrapper.updateMatrixWorld(true)
    for(const arm of this.arms)arm.bone.getWorldPosition(arm.to)
    const hip=this.instance.bones.get('mixamorigLeftUpLeg').getWorldPosition(new Vector3()),knee=this.instance.bones.get('mixamorigLeftLeg').getWorldPosition(new Vector3()),foot=this.instance.bones.get('mixamorigLeftFoot').getWorldPosition(new Vector3())
    const legLength=hip.distanceTo(knee)+knee.distanceTo(foot)
    for(const r of this.records)r.bone.quaternion.copy(r.q)
    for(const r of this.records){
      const name=r.bone.name,side=name.includes('Left')?'Left':'Right'
      let time,fit,clip='air_squat',strength=weight
      if(/(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(name)){
        time=score[side==='Left'?'left':'right'];fit=score[/(Foot|ToeBase)$/.test(name)?`feet${side}`:`leg${side}`]
      }else if(name==='mixamorigHips'){time=(score.left+score.right)/2;fit=score.pelvisFit}
      else if(/mixamorig(Spine\d*|Neck|Head|HeadTop_End)$/.test(name)){time=score.torso;fit=score.torsoFit}
      else if(/(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(name)){
        clip='Running';const duration=this.instance.sourceClips.find(c=>c.name==='Running')?.duration||.6333
        time=score[`shoulder${side}`]*duration;fit=score[`reach${side}`]
        // Guided local samples only. No free IK in the transformation layer.
        strength*=.22+.78*fit
      }else continue
      if(!this.sample(clip,name,time,this.q))continue
      this.goal.copy(this.q).slerp(r.jump,fit)
      r.bone.quaternion.slerp(this.goal,strength)
    }
    // Translate only the root pelvis. The scale comes from Scott's measured
    // leg length; limb translations, bone lengths and all mesh data stay intact.
    this.instance.model.getWorldQuaternion(this.modelQ);this.up.set(0,1,0).applyQuaternion(this.modelQ)
    this.hips.getWorldPosition(this.hipWorld).addScaledVector(this.up,score.hip*legLength*weight)
    this.hips.position.copy(this.hips.parent.worldToLocal(this.hipWorld));this.wrapper.updateMatrixWorld(true)
    this.constrainCrossing(score,front,legLength)
    for(const arm of this.arms)arm.target.copy(arm.to)
    this.applied=true
  }
  constrainCrossing(score,front,legLength){
    this.safety={active:score.cross,lean:0,limit:0,retreat:0,volumes:0}
    if(score.cross<=0)return
    const bone=n=>this.instance.bones.get('mixamorig'+n),point=n=>bone(n).getWorldPosition(new Vector3())
    // The approved upright Armor torso is the prescribed clearance posture.
    // Keep pelvis rotation and waist/head relationships together while the
    // modules cross, rather than bending the neck back to dodge a panel.
    for(const r of this.records)if(/^mixamorig(Hips|Spine\d*|Neck|Head|HeadTop_End)$/.test(r.bone.name))r.bone.quaternion.slerp(r.q,score.cross)
    this.wrapper.updateMatrixWorld(true)
    const origin=this.instance.model.getWorldPosition(new Vector3())
    this.frame.compose(origin,this.modelQ,new Vector3(1,1,1));this.inverseFrame.copy(this.frame).invert()
    const hip=point('Hips').applyMatrix4(this.inverseFrame),neck=point('Neck').applyMatrix4(this.inverseFrame)
    const lean=Math.atan2(neck.z-hip.z,neck.y-hip.y),limit=(18+62*(1-score.cross))*Math.PI/180
    if(lean>limit){
      this.axis.set(1,0,0).applyQuaternion(this.modelQ)
      // Project onto the same angular limit a few times because the waist is
      // above the pelvis anchor; this is a bounded phase constraint, not IK.
      for(let pass=0;pass<4;pass++){
        const direction=point('Neck').applyMatrix4(this.inverseFrame).sub(hip),excess=Math.atan2(direction.z,direction.y)-limit
        if(excess<.001)break
        for(const [name,share]of [['Spine',.5],['Spine1',.3],['Spine2',.2]]){
          const b=bone(name);b.getWorldQuaternion(this.q);b.parent.getWorldQuaternion(this.parentQ)
          this.turn.setFromAxisAngle(this.axis,-excess*share)
          b.quaternion.copy(this.parentQ.invert().multiply(this.turn.multiply(this.q)));this.wrapper.updateMatrixWorld(true)
        }
      }
    }
    // Conservative front-module boxes and two body spheres, in Scott's
    // metre-based axes. Only the root pelvis may retreat, never the assembly.
    const volumes=[]
    for(const p of front?.parts||[]){
      if(!p.mesh.visible||!p.motionGroup||!(p.motionGroup.role==='carrier'||p.motionGroup.parent?.role==='carrier'))continue
      if(!p.mesh.geometry.boundingBox)p.mesh.geometry.computeBoundingBox()
      this.surfaceMatrix.copy(this.inverseFrame).multiply(p.mesh.matrixWorld)
      volumes.push(p.mesh.geometry.boundingBox.clone().applyMatrix4(this.surfaceMatrix).expandByScalar(.008))
    }
    const head=point('Head').lerp(point('HeadTop_End'),.5).applyMatrix4(this.inverseFrame)
    const torso=point('Spine1').lerp(point('Spine2'),.5).applyMatrix4(this.inverseFrame)
    let headRetreat=0,torsoRetreat=0
    for(const [center,radius,isHead]of [[head,legLength*.13,true],[torso,legLength*.13,false]])for(const box of volumes){
      const dx=Math.max(box.min.x-center.x,0,center.x-box.max.x),dy=Math.max(box.min.y-center.y,0,center.y-box.max.y)
      const remaining=radius*radius-dx*dx-dy*dy
      if(remaining<=0)continue
      const extent=Math.sqrt(remaining)
      if(center.z+extent>box.min.z&&center.z-extent<box.max.z){
        const required=center.z+extent-box.min.z
        if(isHead)headRetreat=Math.max(headRetreat,required)
        else torsoRetreat=Math.max(torsoRetreat,required)
      }
    }
    // The torso may overlap its worn plates. Prioritize head clearance rather
    // than pulling Scott away from every conservative body bounding box.
    const headBudget=legLength*.42
    let retreat=Math.max(Math.min(headBudget,headRetreat),Math.min(legLength*.15,torsoRetreat))*score.cross
    if(retreat>0){
      this.hips.getWorldPosition(this.hipWorld).addScaledVector(this.axis.set(0,0,1).applyQuaternion(this.modelQ),-retreat)
      this.hips.position.copy(this.hips.parent.worldToLocal(this.hipWorld))
      // Small prescribed elbow clearance, with opposite signs on each side.
      for(const [side,sign]of [['Left',1],['Right',-1]])bone(side+'Arm').quaternion.multiply(this.turn.setFromAxisAngle(this.axis.set(0,0,1),sign*.045*score.cross))
      this.wrapper.updateMatrixWorld(true)
    }
    const headAfter=point('Head').lerp(point('HeadTop_End'),.5).applyMatrix4(this.inverseFrame)
    // A backward projection can meet a second overlapping module box. Resolve
    // that same one-axis clearance, still within the shared pelvis budget.
    for(let pass=0;pass<3&&retreat<headBudget;pass++){
      let additional=0;const radius=legLength*.13
      for(const box of volumes){
        const dx=Math.max(box.min.x-headAfter.x,0,headAfter.x-box.max.x),dy=Math.max(box.min.y-headAfter.y,0,headAfter.y-box.max.y),remaining=radius*radius-dx*dx-dy*dy
        if(remaining<=0)continue
        const extent=Math.sqrt(remaining)
        if(headAfter.z+extent>box.min.z&&headAfter.z-extent<box.max.z)additional=Math.max(additional,headAfter.z+extent-box.min.z+.002)
      }
      additional=Math.min(headBudget-retreat,additional)*score.cross
      if(additional<.0001)break
      this.hips.getWorldPosition(this.hipWorld).addScaledVector(this.axis.set(0,0,1).applyQuaternion(this.modelQ),-additional)
      this.hips.position.copy(this.hips.parent.worldToLocal(this.hipWorld));this.wrapper.updateMatrixWorld(true);retreat+=additional
      headAfter.copy(point('Head').lerp(point('HeadTop_End'),.5)).applyMatrix4(this.inverseFrame)
    }
    const corrected=point('Neck').applyMatrix4(this.inverseFrame).sub(point('Hips').applyMatrix4(this.inverseFrame))
    const headClearance=volumes.length?Math.min(...volumes.map(box=>box.distanceToPoint(headAfter)-legLength*.13)):null
    Object.assign(this.safety,{lean:Math.atan2(corrected.z,corrected.y),limit,retreat,volumes:volumes.length,headClearance})
  }
}
