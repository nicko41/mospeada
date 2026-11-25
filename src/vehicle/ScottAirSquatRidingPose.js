import {Quaternion,Vector3} from 'three'
import {ScottV2RidingPose,v2RidingAllowed} from './ScottV2RidingPose.js'
import {scottV2RidingConfig as config} from './scottV2RidingConfig.js'
import {scottRidingHandAnchors} from './scottRidingContactAnchors.js'

const upperNames=['Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand']
const point=b=>b.getWorldPosition(new Vector3())
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))

// An independent pose, rebuilt from the sampled local transforms each frame.
// There is no arm IK from the preceding riding pose: only a swing of the
// sampled arm as a unit and a small hinge bend in the sample's elbow plane.
export class ScottAirSquatRidingPose extends ScottV2RidingPose{
 apply(motion,runtime,wrapper){
  if(!v2RidingAllowed(runtime))return false
  this.records=['Hips',...upperNames].map(name=>{const b=this.bones.get(name);return{b,q:b.quaternion.clone(),p:b.position.clone()}})
  this.applied=true;this.motion=motion;this.runtime=runtime;this.wrapper=wrapper
  this.contacts=motion.limbs.map(l=>({l,target:l.target.clone(),pole:l.pole.clone(),orientation:l.orientation.clone(),upper:l.upper.clone(),lower:l.lower.clone(),...(l.leg?{sole:l.sole.clone(),soleOffset:l.soleOffset.clone(),soleIds:l.soleIds}:{})}))
  this.previousFlexWeights=motion.torsoFlexWeights;this.previousPreserveArms=motion.preserveMountedArms;motion.torsoFlexWeights=[0,0,0];motion.preserveMountedArms=true
  const body=motion.body,hip=this.bones.get('Hips'),pelvis=body.worldToLocal(point(hip)).add(new Vector3(...config.pelvisOffset));pelvis.z-=config.seated.rearShift
  const lift=config.seated.pelvisLift||0;pelvis.y+=lift;this.lockHandAnchors=lift>0
  this.previousMinimumHipY=motion.minimumSeatedHipY;motion.minimumSeatedHipY=lift>0?pelvis.y:undefined
  hip.position.copy(hip.parent.worldToLocal(body.localToWorld(pelvis)));wrapper.updateMatrixWorld(true)
  // Reuse only the functional foot contacts. The native leg solver accommodates
  // the rearward seat placement without changing the bike or ankle supports.
  for(const side of['Left','Right']){
   const leg=motion.limbs.find(l=>l.leg&&l.side===side),shape=this.shapes[side]
   leg.orientation.setFromAxisAngle(new Vector3(1,0,0),config.footPitch).multiply(this.reference.get(side+'Foot').world)
   leg.soleOffset.copy(shape.sole).multiplyScalar(this.data.actorScale).applyAxisAngle(new Vector3(1,0,0),config.footPitch);leg.sole.y+=config.soleLift;leg.target.copy(leg.sole).sub(leg.soleOffset);leg.soleIds=shape.soleIds
   // The knee bend plane follows the raised hip; the ankle target stays put.
   leg.pole.y+=lift;leg.pole.z+=config.seated.kneePoleForward||0
  }
  this.pendingPlacement=true
  return true
 }
 setUpperBody(lean){
  // Exact sampled shoulder/arm/forearm relationships; no blend with riding.
  for(const name of upperNames){const b=this.bones.get(name),sample=this.upperBody.bones.get(name);b.quaternion.copy(sample.q);b.position.copy(sample.localPosition)}
  const q=this.motion.body.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),lean-this.upperBody.pitch)).multiply(this.upperBody.bones.get('Spine').world)
  this.motion.worldRotation(this.bones.get('Spine'),q);this.wrapper.updateMatrixWorld(true)
 }
 palm(side){
  const hand=this.bones.get(side+'Hand'),delta=hand.getWorldQuaternion(new Quaternion()).multiply(this.reference.get(side+'Hand').world.clone().invert())
  return point(hand).add(this.shapes[side].palm.clone().multiplyScalar(this.data.actorScale).applyQuaternion(delta))
 }
 arm(side){
  const a=this.bones.get(side+'Arm'),b=this.bones.get(side+'ForeArm'),c=this.bones.get(side+'Hand'),A=point(a),B=point(b),P=this.lockHandAnchors?point(c):this.palm(side),ab=B.clone().sub(A),bp=P.clone().sub(B)
  return{a,b,c,A,B,P,ab,bp,l1:ab.length(),l2:bp.length(),angle:ab.angleTo(bp),normal:ab.clone().cross(bp).normalize()}
 }
 finish(){
  if(!this.contacts)return
  if(this.pendingPlacement){
   this.pendingPlacement=false
   const {body}=this.motion,targets=Object.fromEntries(['Left','Right'].map(s=>[s,body.localToWorld(new Vector3(...(this.lockHandAnchors?scottRidingHandAnchors[s].position:this.data.measuredTargets.grips[s])))])),range=config.seated
   const reachError=lean=>{this.setUpperBody(lean);return['Left','Right'].reduce((sum,s)=>{const a=this.arm(s),reach=Math.sqrt(a.l1*a.l1+a.l2*a.l2+2*a.l1*a.l2*Math.cos(range.elbowFlex));return sum+a.A.distanceTo(targets[s])-reach},0)/2}
   let low=range.minLean,high=range.maxLean;const lowError=reachError(low),highError=reachError(high)
   if(lowError*highError<=0){for(let i=0;i<13;i++){const mid=(low+high)/2;if(reachError(mid)>0)low=mid;else high=mid}}else{low=high=Math.abs(lowError)<Math.abs(highError)?low:high}
   const lean=(low+high)/2;this.setUpperBody(lean);const arms={}
   for(const side of['Left','Right']){
    // Tiny, bounded clavicle swing accommodates the source rig's unequal arm
    // lengths. This moves the shoulder endpoint without rolling the arm axis.
    const clavicle=this.bones.get(side+'Shoulder'),clavicleQ=clavicle.getWorldQuaternion(new Quaternion())
    for(let i=0;i<(this.lockHandAnchors?8:4);i++){
     const a=this.arm(side),distance=a.A.distanceTo(targets[side]),minimum=Math.sqrt(a.l1*a.l1+a.l2*a.l2+2*a.l1*a.l2*Math.cos(range.maxElbowFlex)),maximum=Math.sqrt(a.l1*a.l1+a.l2*a.l2+2*a.l1*a.l2*Math.cos(3*Math.PI/180)),gap=distance-clamp(distance,minimum,maximum)
     if(Math.abs(gap)<(this.lockHandAnchors?1e-9:.00001))break
     const S=point(clavicle),from=a.A.clone().sub(S).normalize(),to=a.A.clone().addScaledVector(targets[side].clone().sub(a.A).normalize(),gap).sub(S).normalize(),q=new Quaternion().setFromUnitVectors(from,to).multiply(clavicle.getWorldQuaternion(new Quaternion())),angle=clavicleQ.angleTo(q)
     if(angle>range.maxClavicleSwing)q.copy(clavicleQ.clone().slerp(q,range.maxClavicleSwing/angle))
     this.motion.worldRotation(clavicle,q)
    }
    let a=this.arm(side);const distance=a.A.distanceTo(targets[side]),cosine=(distance*distance-a.l1*a.l1-a.l2*a.l2)/(2*a.l1*a.l2),bend=clamp(Math.acos(clamp(cosine,-1,1)),3*Math.PI/180,range.maxElbowFlex)
    // Only flex in the existing elbow plane. No axial forearm twist.
    this.motion.worldRotation(a.b,new Quaternion().setFromAxisAngle(a.normal,bend-a.angle).multiply(a.b.getWorldQuaternion(new Quaternion())))
    a=this.arm(side);const swing=new Quaternion().setFromUnitVectors(a.P.clone().sub(a.A).normalize(),targets[side].clone().sub(a.A).normalize())
    this.motion.worldRotation(a.a,swing.multiply(a.a.getWorldQuaternion(new Quaternion())))
    if(this.lockHandAnchors)this.motion.worldRotation(a.c,body.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().fromArray(scottRidingHandAnchors[side].orientation)))
    const palmTarget=this.lockHandAnchors?body.localToWorld(new Vector3(...scottRidingHandAnchors[side].palm)):targets[side]
    arms[side]={palmError:this.palm(side).distanceTo(palmTarget),handAnchorError:this.lockHandAnchors?point(a.c).distanceTo(targets[side]):undefined,elbowFlex:bend,clavicleSwing:clavicleQ.angleTo(clavicle.getWorldQuaternion(new Quaternion())),armSwingOnly:true,wristAdjustment:0}
   }
   const head=this.bones.get('Head'),neck=this.bones.get('Neck'),headQ=head.getWorldQuaternion(new Quaternion()),neckQ=neck.getWorldQuaternion(new Quaternion()),bodyQ=body.getWorldQuaternion(new Quaternion()),forward=new Vector3(0,0,1).applyQuaternion(headQ.clone().multiply(this.reference.get('Head').world.clone().invert())),pitch=config.headPitch+Math.min(.7,(this.runtime.state.wheelieAngle||0)*.85),desired=new Vector3(0,-Math.sin(pitch),Math.cos(pitch)).applyQuaternion(bodyQ),look=new Quaternion().setFromUnitVectors(forward,desired)
   this.motion.worldRotation(neck,new Quaternion().slerp(look,.4).multiply(neckQ));this.motion.worldRotation(head,look.multiply(headQ))
   this.diagnostics={variant:'air-squat-seated',reference:{clip:this.upperBody.clip,time:this.upperBody.time},rearShift:range.rearShift,pelvisLift:range.pelvisLift||0,torsoLean:lean,pelvis:body.worldToLocal(point(this.bones.get('Hips'))).toArray(),arms}
   this.motion.diagnostics.handError=Math.max(...Object.values(arms).map(a=>a.palmError))
  }
  this.motion.minimumSeatedHipY=this.previousMinimumHipY;this.motion.preserveMountedArms=this.previousPreserveArms;super.finish()
 }
}

export function createScottRidingPose(instance,data,variant=config.variant){
 if(variant==='previous')return new ScottV2RidingPose(instance,data)
 if(variant==='air-squat-seated')return new ScottAirSquatRidingPose(instance,data)
 throw Error('Unknown Scott riding variant: '+variant)
}
