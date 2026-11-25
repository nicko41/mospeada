import {AnimationMixer,Matrix4,Quaternion,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {scottV2RidingConfig as config} from './scottV2RidingConfig.js'

// Match the IK bend frame to the native extended-arm pose, rather than carrying
// the axial twist of the old authored riding arms into the V2 armor.
function frame(axis,normal){
 const y=axis.clone().normalize(),x=normal.clone().addScaledVector(y,-normal.dot(y)).normalize(),z=x.clone().cross(y).normalize()
 x.copy(y).cross(z);return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z))
}

function upperBodySample(instance,reference){
 const model=clone(instance.sourceScene),mixer=new AnimationMixer(model),clip=instance.sourceClips.find(c=>c.name===config.upperBodyReference.clip)
 if(!clip)throw Error('Missing Scott upper-body reference: '+config.upperBodyReference.clip)
 const action=mixer.clipAction(clip).reset().play();action.time=config.upperBodyReference.time;mixer.update(0);model.updateMatrixWorld(true)
 const bones=new Map();model.traverse(b=>{if(b.isBone)bones.set(b.name.replace(/^mixamorig[:_]?/,''),{q:b.quaternion.clone(),localPosition:b.position.clone(),world:b.getWorldQuaternion(new Quaternion()),position:b.getWorldPosition(new Vector3())})})
 const forward=new Vector3(0,0,1).applyQuaternion(bones.get('Spine2').world.clone().multiply(reference.get('Spine2').world.clone().invert())),pitch=Math.atan2(-forward.y,forward.z),arms={}
 for(const side of['Left','Right']){
  const a=bones.get(side+'Arm'),b=bones.get(side+'ForeArm'),c=bones.get(side+'Hand'),ab=b.position.clone().sub(a.position),bc=c.position.clone().sub(b.position),normal=ab.clone().cross(bc).normalize(),direction=c.position.clone().sub(a.position).normalize(),bend=ab.clone().addScaledVector(direction,-ab.dot(direction)).normalize()
  arms[side]={upper:frame(ab,normal).invert().multiply(a.world),lower:frame(bc,normal).invert().multiply(b.world),direction,bend}
 }
 mixer.stopAllAction();mixer.uncacheRoot(model)
 return{bones,pitch,arms,clip:clip.name,time:config.upperBodyReference.time}
}

export function v2RidingAllowed(runtime){
 const entry=runtime.transformEntry,mode=runtime.state?.riderMode
 return config.enabled&&(mode==='mounted'||mode==='stopping')&&!runtime.armorController?.active&&(!entry||entry.phase==='idle')&&!(entry?.poseBlend>0)&&!entry?.returnFlight&&!runtime.opening?.active&&!runtime.ending?.holding&&!runtime.gallant?.aiming&&!runtime.gallant?.aimInput?.held&&!runtime.gallant?.firing
}

// This layer owns only the normal mounted pose. Native motion/IK still solves
// the same skeleton. Its contact overrides are restored before leaving apply.
export class ScottV2RidingPose{
 constructor(instance,data){
  this.instance=instance;this.data=data;this.applied=false;this.contacts=null
  const source=instance.sourceScene;source.updateWorldMatrix(true,true)
  this.reference=new Map();source.traverse(n=>{if(n.isBone)this.reference.set(n.name.replace(/^mixamorig[:_]?/,''),{q:n.quaternion.clone(),world:n.getWorldQuaternion(new Quaternion()),position:n.getWorldPosition(new Vector3())})})
  this.bones=new Map([...instance.bones].map(([name,b])=>[name.replace(/^mixamorig[:_]?/,''),b]));this.records=[];this.shapes=null;this.diagnostics={}
  this.upperBody=upperBodySample(instance,this.reference)
  this.measure()
 }
 restore(){
  this.finish()
  if(!this.applied)return
  for(const r of this.records){r.b.quaternion.copy(r.q);r.b.position.copy(r.p)}this.applied=false
 }
 finish(){if(!this.contacts)return;for(const r of this.contacts){r.l.target.copy(r.target);r.l.pole.copy(r.pole);r.l.orientation.copy(r.orientation);r.l.upper.copy(r.upper);r.l.lower.copy(r.lower);if(r.sole){r.l.sole.copy(r.sole);r.l.soleOffset.copy(r.soleOffset);r.l.soleIds=r.soleIds}}this.motion.torsoFlexWeights=this.previousFlexWeights;this.contacts=null}
 measure(){
  const mesh=this.instance.skins[0].mesh,g=mesh.geometry,p=g.attributes.position,j=g.attributes.skinIndex,w=g.attributes.skinWeight,rendered=new Set(g.index.array),shapes={}
  const weight=(i,names)=>{let sum=0;for(let k=0;k<4;k++)if(names.some(n=>mesh.skeleton.bones[j.getComponent(i,k)].name.endsWith(n)))sum+=w.getComponent(i,k);return sum}
  for(const side of ['Left','Right']){
   const sign=side==='Left'?1:-1,wrist=this.reference.get(side+'Hand').position,ids=[...rendered].filter(i=>weight(i,[side+'Hand'])>.65),length=Math.max(...ids.map(i=>sign*(p.getX(i)-wrist.x)))
   const palmIds=ids.filter(i=>{const u=sign*(p.getX(i)-wrist.x)/length,z=(p.getZ(i)-wrist.z)/length;return u>.38&&u<.56&&z>-.20&&z<.22})
   const palm=new Vector3();for(const i of palmIds){const v=new Vector3().fromBufferAttribute(p,i);if(g.morphAttributes.position?.[1])v.add(new Vector3().fromBufferAttribute(g.morphAttributes.position[1],i));palm.add(v)}palm.divideScalar(Math.max(1,palmIds.length)).sub(wrist)
   const feet=[...rendered].filter(i=>weight(i,[side+'Foot',side+'ToeBase'])>.65),minimum=Math.min(...feet.map(i=>p.getY(i))),soleIds=feet.filter(i=>p.getY(i)<minimum+.008),sole=new Vector3()
   soleIds.forEach(i=>sole.add(new Vector3().fromBufferAttribute(p,i)));sole.divideScalar(soleIds.length).sub(this.reference.get(side+'Foot').position)
   shapes[side]={palm,palmIds,sole,soleIds,length}
  }
  this.shapes=shapes
 }
 apply(motion,runtime,wrapper){
  if(!v2RidingAllowed(runtime))return false
  if(!this.shapes)this.measure()
  this.records=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder'].map(name=>{const b=this.bones.get(name);return{b,q:b.quaternion.clone(),p:b.position.clone()}})
  this.applied=true;this.contacts=motion.limbs.map(l=>({l,target:l.target.clone(),pole:l.pole.clone(),orientation:l.orientation.clone(),upper:l.upper.clone(),lower:l.lower.clone(),...(l.leg?{sole:l.sole.clone(),soleOffset:l.soleOffset.clone(),soleIds:l.soleIds}:{})}))
  this.motion=motion;this.previousFlexWeights=motion.torsoFlexWeights;motion.torsoFlexWeights=[1,0,0]
  const body=motion.body,bodyQ=body.getWorldQuaternion(new Quaternion()),hip=this.bones.get('Hips'),pelvis=body.worldToLocal(hip.getWorldPosition(new Vector3())).add(new Vector3(...config.pelvisOffset)),scale=this.data.actorScale
  hip.position.copy(hip.parent.worldToLocal(body.localToWorld(pelvis.clone())));wrapper.updateMatrixWorld(true)
  const xAxis=new Vector3(1,0,0),turn=new Quaternion()
  for(const side of ['Left','Right']){
   const shape=this.shapes[side],arm=motion.limbs.find(l=>!l.leg&&l.side===side),leg=motion.limbs.find(l=>l.leg&&l.side===side)
   const handDelta=arm.orientation.clone().multiply(this.reference.get(side+'Hand').world.clone().invert())
   arm.target.fromArray(this.data.measuredTargets.grips[side]).sub(shape.palm.clone().multiplyScalar(scale).applyQuaternion(handDelta))
   arm.upper.copy(this.upperBody.arms[side].upper);arm.lower.copy(this.upperBody.arms[side].lower)
   leg.orientation.copy(turn.setFromAxisAngle(xAxis,config.footPitch)).multiply(this.reference.get(side+'Foot').world)
   leg.soleOffset.copy(shape.sole).multiplyScalar(scale).applyAxisAngle(xAxis,config.footPitch);leg.sole.y+=config.soleLift;leg.target.copy(leg.sole).sub(leg.soleOffset);leg.soleIds=shape.soleIds
   // Relax the squat's raised clavicles for the lower grips. The upper/lower
   // arm axes still come from that sample, not from the old riding pose.
   this.bones.get(side+'Shoulder').quaternion.copy(this.upperBody.bones.get(side+'Shoulder').q).slerp(this.reference.get(side+'Shoulder').q,.8)
  }
  const spine=this.bones.get('Spine'),setTorso=angle=>{
   // Preserve the sampled relationship between the chest bones. Tilt that
   // entire upper body toward the grips without folding the chest plates.
   for(const name of ['Spine1','Spine2'])this.bones.get(name).quaternion.copy(this.upperBody.bones.get(name).q)
   motion.worldRotation(spine,bodyQ.clone().multiply(new Quaternion().setFromAxisAngle(xAxis,angle-this.upperBody.pitch)).multiply(this.upperBody.bones.get('Spine').world))
  },reachable=()=>motion.limbs.filter(l=>!l.leg).every(l=>l.a.getWorldPosition(new Vector3()).distanceTo(body.localToWorld(l.target.clone()))<l.l1+l.l2-config.armReachReserve)
  let lean=config.torsoLean;setTorso(lean)
  if(!reachable()){
   let low=lean,high=config.torsoLeanLimit;setTorso(high)
   if(reachable()){for(let i=0;i<10;i++){const mid=(low+high)/2;setTorso(mid);if(reachable())high=mid;else low=mid}lean=high}else lean=config.torsoLeanLimit
   setTorso(lean)
  }
  for(const side of['Left','Right']){
   const arm=motion.limbs.find(l=>!l.leg&&l.side===side),sample=this.upperBody.arms[side],origin=body.worldToLocal(arm.a.getWorldPosition(new Vector3())),direction=arm.target.clone().sub(origin).normalize(),swing=new Quaternion().setFromUnitVectors(sample.direction,direction)
   const bend=sample.bend.clone().applyQuaternion(swing).lerp(new Vector3(side==='Left'?.08:-.08,-1,0),.8).normalize()
   arm.pole.copy(origin).add(bend)
  }
  const neck=this.bones.get('Neck'),head=this.bones.get('Head');neck.quaternion.copy(this.upperBody.bones.get('Neck').q);head.quaternion.copy(this.upperBody.bones.get('Head').q);wrapper.updateMatrixWorld(true)
  const neckQ=neck.getWorldQuaternion(new Quaternion()),headQ=head.getWorldQuaternion(new Quaternion()),currentLook=new Vector3(0,0,1).applyQuaternion(headQ.clone().multiply(this.reference.get('Head').world.clone().invert())),desiredLook=new Vector3(0,-Math.sin(config.headPitch),Math.cos(config.headPitch)).applyQuaternion(bodyQ),lookCorrection=new Quaternion().setFromUnitVectors(currentLook,desiredLook)
  motion.worldRotation(neck,new Quaternion().slerp(lookCorrection,.4).multiply(neckQ));motion.worldRotation(head,lookCorrection.clone().multiply(headQ))
  wrapper.updateMatrixWorld(true)
  this.diagnostics={upperBodyReference:{clip:this.upperBody.clip,time:this.upperBody.time},torsoLean:lean,preferredLean:config.torsoLean,pelvis:pelvis.toArray(),hands:Object.fromEntries(['Left','Right'].map(s=>[s,{palmVertices:this.shapes[s].palmIds.length,visibleHandLength:this.shapes[s].length}])),targets:Object.fromEntries(motion.limbs.map(l=>[(l.leg?'foot':'hand')+l.side,l.target.toArray()]))}
  return true
 }
}
