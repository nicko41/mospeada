import test from 'node:test'
import assert from 'node:assert/strict'
import {Quaternion,Raycaster,Vector3} from 'three'
import {ridingFixture,measureRiding} from '../../scripts/scott-v2-riding-fixture.mjs'
import {scottV2RidingConfig as config} from './scottV2RidingConfig.js'
import {scottRidingHandAnchors} from './scottRidingContactAnchors.js'

test('Independent Air Squat riding moves the seat back, preserves anatomy and reaches the original grips without stretching',async()=>{
 const f=await ridingFixture({ridingVariant:'air-squat-seated'}),previous=await ridingFixture({ridingVariant:'previous'})
 for(const q of[f,previous]){Object.assign(q.s,{speed:18,idleBlend:0,parked:false});q.step(60)}
 const actual=measureRiding(f),old=measureRiding(previous),pose=f.instance.v2RidingPose,mesh=f.skins[0].mesh,skin=mesh.geometry.attributes.skinWeight,weights=Array.from(skin.array)
 assert.ok(Math.abs(actual.hips[2]-old.hips[2]+config.seated.rearShift)<1e-8);assert.ok(Math.abs(actual.hips[1]-old.hips[1]-(config.seated.pelvisLift||0))<1e-8)
 for(const side of['Left','Right']){
  const shape=pose.shapes[side],palm=new Vector3(),p=new Vector3();shape.palmIds.forEach(id=>palm.add(mesh.localToWorld(mesh.getVertexPosition(id,p))));palm.divideScalar(shape.palmIds.length)
  const grip=f.rig.body.localToWorld(new Vector3(...f.authored.data.measuredTargets.grips[side]));assert.ok(palm.distanceTo(grip)<.002,'Visible hand misses grip: '+side)
  const arm=pose.diagnostics.arms[side];assert.ok(arm.elbowFlex<=config.seated.maxElbowFlex+1e-9);assert.ok(arm.clavicleSwing<=config.seated.maxClavicleSwing+1e-8);assert.equal(arm.wristAdjustment,0)
  assert.ok(new Vector3(...actual.diagnostics.feet[side].sole).distanceTo(new Vector3(...old.diagnostics.feet[side].sole))<1e-6,'Foot contact changed')
 }
 // Sampled chest joints remain exact; no spine compression or bone scaling.
 for(const name of['Spine1','Spine2'])assert.deepEqual(pose.bones.get(name).quaternion.toArray(),pose.upperBody.bones.get(name).q.toArray())
 for(const b of f.bones.values())assert.deepEqual(b.scale.toArray(),[1,1,1])
 const snapshot=[...f.bones].map(([n,b])=>[n,b.position.toArray(),b.quaternion.toArray()]);f.step(90)
 for(const[n,p,q]of snapshot){const b=f.bones.get(n);p.forEach((v,i)=>assert.ok(Math.abs(v-b.position.toArray()[i])<1e-8));q.forEach((v,i)=>assert.ok(Math.abs(v-b.quaternion.toArray()[i])<1e-8,'Accumulated rotations: '+n))}
 assert.deepEqual(Array.from(skin.array),weights)
})

test('New pose keeps hands/feet functional through boost, braking and wheelie and restores native control outside riding',async()=>{
 const f=await ridingFixture({ridingVariant:'air-squat-seated'})
 for(const patch of[{speed:0,idleBlend:1},{speed:18,idleBlend:0},{boostBlend:1},{boostBlend:0,brakeBlend:1},{brakeBlend:0,wheelieAngle:.4}]){
  Object.assign(f.s,patch);f.step(60);const d=f.instance.v2RidingPose.diagnostics
  for(const a of Object.values(d.arms)){assert.ok(a.palmError<.004,'Dynamic riding lost grip: '+JSON.stringify(patch)+' '+a.palmError);if(config.seated.pelvisLift>0)assert.ok(a.handAnchorError<1e-7,'Hand anchor moved: '+JSON.stringify(patch))}
  for(const name of['Spine1','Spine2'])assert.deepEqual(f.bones.get('mixamorig'+name).quaternion.toArray(),f.instance.v2RidingPose.upperBody.bones.get(name).q.toArray())
  assert.equal(f.instance.mountedMotion.preserveMountedArms,undefined)
 }
 const baseline=await ridingFixture({fit:false});for(const q of[f,baseline]){Object.assign(q.s,{speed:18,idleBlend:0,wheelieAngle:0,boostBlend:0,brakeBlend:0});q.runtime.gallant={aiming:true,aimInput:{held:true}};q.step(5)}
 for(const[name,b]of f.bones){const other=baseline.bones.get(name);b.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-other.matrixWorld.elements[i])<2e-7,'Pose leaked into aiming: '+name))}
})

test('Pelvis support clears the actual curved seat and advances both knees with the approved hands and pedal contacts fixed',async()=>{
 const saved={...config.seated};let before
 try{
  Object.assign(config.seated,{rearShift:.20,pelvisLift:0,kneePoleForward:0,elbowFlex:12*Math.PI/180});before=await ridingFixture();Object.assign(before.s,{speed:18,idleBlend:0,parked:false});before.step(60)
 }finally{Object.assign(config.seated,saved)}
 const after=await ridingFixture();Object.assign(after.s,{speed:18,idleBlend:0,parked:false});after.step(60)
 const a=measureRiding(after),b=measureRiding(before),body=after.rig.body,mesh=after.skins[0].mesh,g=mesh.geometry,hip=new Vector3(...a.hips),seats=after.rig.surfaces.filter(m=>/rear_sit/.test(m.userData.sourcePiece||m.name)),down=new Vector3(0,-1,0).applyQuaternion(body.getWorldQuaternion(new Quaternion()));let tested=0,minimum=Infinity
 for(const id of new Set(g.index.array)){
  let weight=0;for(let k=0;k<4;k++)if(g.attributes.skinIndex.getComponent(id,k)===0)weight+=g.attributes.skinWeight.getComponent(id,k)
  if(weight<.65)continue;const p=body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))
  if(Math.abs(p.x)>.13||p.z<hip.z-.12||p.z>hip.z+.04||p.y>hip.y-.05)continue
  const hit=new Raycaster(body.localToWorld(new Vector3(p.x,2,p.z)),down).intersectObjects(seats,false)[0];if(hit){tested++;minimum=Math.min(minimum,p.y-body.worldToLocal(hit.point).y)}
 }
 assert.ok(tested>300);assert.ok(minimum>.002,'Glute/pelvis still penetrates the curved seat: '+minimum)
 for(const side of['Left','Right']){
  assert.ok(a.joints[side].Leg[2]>b.joints[side].Leg[2]+.025,'Knee failed to advance: '+side)
  for(const suffix of['Hand','Foot']){
   const x=after.bones.get('mixamorig'+side+suffix),y=before.bones.get('mixamorig'+side+suffix),position=body.worldToLocal(x.getWorldPosition(new Vector3())),original=before.rig.body.worldToLocal(y.getWorldPosition(new Vector3()))
   assert.ok(position.distanceTo(original)<1e-7,'Approved anchor position changed: '+side+suffix)
   const q=body.getWorldQuaternion(new Quaternion()).invert().multiply(x.getWorldQuaternion(new Quaternion())).toArray(),q0=before.rig.body.getWorldQuaternion(new Quaternion()).invert().multiply(y.getWorldQuaternion(new Quaternion())).toArray();q.forEach((v,i)=>assert.ok(Math.abs(v-q0[i])<1e-8,'Approved anchor orientation changed: '+side+suffix))
  }
 }
 assert.ok(a.joints.Left.Shoulder[1]>b.joints.Left.Shoulder[1]+.04,'Torso failed to rise')
})
