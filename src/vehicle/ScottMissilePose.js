import {Matrix4,Quaternion,Vector3} from 'three'
import {createBoostLegPoses} from './ScottArmorBoostMotion.js'

export const MISSILE_POSE=Object.freeze({windup:.35,recovery:.85})
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)}

// Reversible pose after the Gallant hands and before cuff/leg attachment.
// Gameplay position, source animation tracks and the rig stay unchanged.
export class ScottMissilePose{
 constructor(instance){
  this.instance=instance;this.motion=instance.mountedMotion;this.wrapper=this.motion.wrapper;this.hips=instance.bones.get('mixamorigHips');this.spines=['Spine','Spine1','Spine2'].map(n=>instance.bones.get('mixamorig'+n)).filter(Boolean)
  this.legPoses=createBoostLegPoses(instance);this.modelQ=new Quaternion();this.parentQ=new Quaternion();this.openAxis=new Vector3()
  this.records=[...new Set([this.hips,...this.spines,...this.motion.limbs.flatMap(l=>[l.a,l.b,l.c]),...this.legPoses.map(r=>r.bone)])].map(bone=>({bone,q:new Quaternion()}));this.nativePosition=new Vector3();this.active=false;this.applied=false;this.age=0;this.fired=false;this.firedAt=0;this.target=null;this.launcher=null
  this.goal=new Vector3();this.forward=new Vector3();this.right=new Vector3();this.center=new Vector3();this.start=new Vector3();this.end=new Vector3();this.pole=new Vector3();this.direction=new Vector3();this.normal=new Vector3();this.out=new Vector3();this.worldQ=new Quaternion();this.turn=new Quaternion();this.resultQ=new Quaternion();this.matrix=new Matrix4();this.diagnostics={weight:0,opening:0,barrelAlignment:0,side:null}
 }
 request(target,launcher,mounted=false){if(this.active||!target||target.dead||!launcher)return false;this.active=true;this.age=0;this.fired=false;this.firedAt=0;this.target=target;this.launcher=launcher;this.mounted=mounted;return true}
 get ready(){return this.active&&!this.fired&&this.age>=MISSILE_POSE.windup-1e-6&&this.diagnostics.barrelAlignment>.94}
 commit(){this.fired=true;this.firedAt=this.age}
 restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.wrapper.position.copy(this.nativePosition);this.wrapper.updateMatrixWorld(true);this.applied=false}
 cancel(){this.restore();this.active=false;this.target=null;this.launcher=null;this.diagnostics.weight=this.diagnostics.opening=0}
 frame(){const l=this.launcher,g=l.group;this.matrix.copy(g.bone.matrixWorld).multiply(g.targetInBone).multiply(g.inversePivot);return this.matrix}
 blendLimb(limb,weight){for(const bone of [limb.a,limb.b,limb.c]){const r=this.records.find(r=>r.bone===bone);this.resultQ.copy(bone.quaternion);bone.quaternion.copy(r.q).slerp(this.resultQ,weight)}this.wrapper.updateMatrixWorld(true)}
 apply(dt,enabled,sampleGround){
  if(!this.active)return
  if(!enabled||!this.target||(!this.fired&&this.target.dead)){this.cancel();return}
  dt=Math.max(0,Math.min(.1,dt));this.age=this.fired?this.age+dt:Math.min(MISSILE_POSE.windup,this.age+dt)
  const since=this.fired?this.age-this.firedAt:0;if(this.fired&&since>=MISSILE_POSE.recovery){this.active=false;this.diagnostics.weight=0;return}
  const weight=smooth(this.age/MISSILE_POSE.windup)*(1-smooth((since-.48)/.37)),opening=this.fired?smooth((since-.015)/.20):0,recoil=this.fired?Math.sin(Math.min(1,since/.32)*Math.PI):0
  for(const r of this.records)r.q.copy(r.bone.quaternion);this.nativePosition.copy(this.wrapper.position)
  this.goal.copy(this.target.position);this.goal.y+=this.target.height*.55;this.hips.getWorldPosition(this.center);this.forward.subVectors(this.goal,this.center);this.forward.y=0;this.forward.normalize();this.right.set(this.forward.z,0,-this.forward.x)
  if(!this.mounted){
   this.wrapper.position.addScaledVector(this.forward,-(.10+recoil*.06)*weight)
   const torso=[this.hips,...this.spines];for(let i=0;i<torso.length;i++){const bone=torso[i];this.turn.setFromAxisAngle(this.right,-(i===0?.075:.035)*(1+recoil*.35)*weight);bone.getWorldQuaternion(this.worldQ);this.motion.worldRotation(bone,this.worldQ.premultiply(this.turn))}
   this.wrapper.updateMatrixWorld(true);this.hips.getWorldPosition(this.center)
   // Reuse the approved reverse-boost chain, including ankles and toes.
   // No foot target in world space fights the existing forward-boost pose.
   const legWeight=weight*(.2+.8*opening)
   for(const r of this.legPoses)r.bone.quaternion.slerp(r.reverse,legWeight)
   this.instance.model.getWorldQuaternion(this.modelQ)
   for(const r of this.legPoses)if(r.thigh){r.bone.parent.getWorldQuaternion(this.parentQ);this.openAxis.set(0,0,1).applyQuaternion(this.modelQ).applyQuaternion(this.parentQ.invert());this.turn.setFromAxisAngle(this.openAxis,(r.side==='Left'?1:-1)*.6*opening*weight);r.bone.quaternion.premultiply(this.turn)}
   this.wrapper.updateMatrixWorld(true)
  }
  const arm=this.motion.limbs.find(l=>!l.leg&&l.side===this.launcher.side)
  arm.a.getWorldPosition(this.start);this.direction.subVectors(this.goal,this.start).normalize();this.end.copy(this.start).addScaledVector(this.direction,(arm.l1+arm.l2)*.9);this.pole.copy(this.start).addScaledVector(this.forward,.18).addScaledVector(this.right,this.launcher.side==='Left'?.55:-.55);this.pole.y-=.32;arm.c.getWorldQuaternion(this.worldQ);this.motion.solve(arm,this.end,this.pole,this.worldQ)
  // Aim the cuff itself, rather than faking an upward rocket direction while
  // the forearm still points down. Both launchers use their real bind frame.
  for(let i=0;i<2;i++){this.frame();this.normal.copy(this.launcher.normal).transformDirection(this.matrix);this.end.copy(this.launcher.local).applyMatrix4(this.matrix);this.direction.subVectors(this.goal,this.end).normalize();this.turn.setFromUnitVectors(this.normal,this.direction);arm.b.getWorldQuaternion(this.worldQ);this.motion.worldRotation(arm.b,this.worldQ.premultiply(this.turn))}
  this.blendLimb(arm,weight);this.frame();this.normal.copy(this.launcher.normal).transformDirection(this.matrix);this.end.copy(this.launcher.local).applyMatrix4(this.matrix);this.direction.subVectors(this.goal,this.end).normalize()
  this.diagnostics={weight,opening,side:this.launcher.side,barrelAlignment:this.normal.dot(this.direction),cuffHeight:this.end.y,shoulderHeight:this.start.y};this.applied=true
 }
}
