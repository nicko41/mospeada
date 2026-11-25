import {Quaternion,Vector3} from 'three'

export const canonicalScottBone=name=>name.replace(/^mixamorig[:_]?/,'')
const position=bone=>bone.getWorldPosition(new Vector3())

// Read the actual inverse bind matrices, never infer rest axes from an action.
export function scottBindFrames(scene){
 scene.updateWorldMatrix(true,true)
 const frames=new Map(),inverse=scene.matrixWorld.clone().invert()
 scene.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.skeleton.bones.forEach((bone,i)=>{
  const matrix=inverse.clone().multiply(mesh.skeleton.boneInverses[i].clone().invert())
  const p=new Vector3(),q=new Quaternion(),s=new Vector3();matrix.decompose(p,q,s)
  frames.set(canonicalScottBone(bone.name),{position:p,rotation:q})
 })})
 return frames
}

// The receiver keeps its own hierarchy, joint translations, scales and weights.
// Only rotations and the root trajectory cross the skeleton boundary.
export class ScottNativeRetarget{
 constructor(source,target,reference=source){
  this.source=source;this.target=target
  this.sourceBind=scottBindFrames(reference);this.targetBind=scottBindFrames(target)
  this.sourceBones=new Map();source.traverse(b=>{if(b.isBone)this.sourceBones.set(canonicalScottBone(b.name),b)})
  this.bones=new Map();target.traverse(b=>{if(b.isBone)this.bones.set(canonicalScottBone(b.name),b)})
  this.records=[]
  target.traverse(b=>{const name=canonicalScottBone(b.name);if(b.isBone&&this.sourceBones.has(name))this.records.push({name,b,source:this.sourceBones.get(name),bind:this.targetBind.get(name),sourceBind:this.sourceBind.get(name),p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})})
  if(!this.records.find(r=>r.name==='Hips')||this.records.length<20)throw Error('Scott V3: correspondencia de huesos incompleta')
  this.q=new Quaternion();this.parentQ=new Quaternion();this.sourceQ=new Quaternion();this.targetQ=new Quaternion();this.p=new Vector3()
 }
 worldRotation(bone,q){
  bone.parent.getWorldQuaternion(this.parentQ).invert()
  bone.quaternion.copy(this.parentQ).multiply(q).normalize();bone.updateWorldMatrix(false,true)
 }
 apply(){
  this.source.updateWorldMatrix(true,true);this.target.updateWorldMatrix(true,true)
  this.source.getWorldQuaternion(this.sourceQ).invert();this.target.getWorldQuaternion(this.targetQ)
  for(const r of this.records){
   r.b.position.copy(r.p);r.b.scale.copy(r.s)
   r.source.getWorldQuaternion(this.q).premultiply(this.sourceQ)
   this.q.multiply(r.sourceBind.rotation.clone().invert()).multiply(r.bind.rotation).premultiply(this.targetQ)
   if(r.name==='Hips'){
    this.p.copy(position(r.source));this.source.worldToLocal(this.p).sub(r.sourceBind.position).add(r.bind.position)
    this.target.localToWorld(this.p);r.b.position.copy(r.b.parent.worldToLocal(this.p))
   }
   this.worldRotation(r.b,this.q)
  }
 }
 // Analytic two-bone IK: swing existing joints without changing limb lengths.
 solveLimb(side,leg,target,pole,orientation){
  const a=this.bones.get(side+(leg?'UpLeg':'Arm')),b=this.bones.get(side+(leg?'Leg':'ForeArm')),c=this.bones.get(side+(leg?'Foot':'Hand'))
  const A=position(a),B=position(b),C=position(c),l1=A.distanceTo(B),l2=B.distanceTo(C),axis=target.clone().sub(A),distance=Math.min(axis.length(),l1+l2-1e-6)
  axis.normalize()
  const bend=pole.clone().sub(A).addScaledVector(axis,-pole.clone().sub(A).dot(axis)).normalize()
  const along=(l1*l1-l2*l2+distance*distance)/(2*Math.max(distance,1e-6)),height=Math.sqrt(Math.max(0,l1*l1-along*along)),elbow=A.clone().addScaledVector(axis,along).addScaledVector(bend,height)
  const q=new Quaternion().setFromUnitVectors(B.sub(A).normalize(),elbow.clone().sub(A).normalize()).multiply(a.getWorldQuaternion(new Quaternion()))
  this.worldRotation(a,q)
  this.worldRotation(b,new Quaternion().setFromUnitVectors(position(c).sub(position(b)).normalize(),target.clone().sub(position(b)).normalize()).multiply(b.getWorldQuaternion(new Quaternion())))
  if(orientation)this.worldRotation(c,orientation)
  return position(c).distanceTo(target)
 }
}
