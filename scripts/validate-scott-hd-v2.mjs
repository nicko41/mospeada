import fs from 'node:fs'
import assert from 'node:assert/strict'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {readGlb,accessorData} from './glb-data.mjs'
import {attachScottHDVisual} from '../src/vehicle/scottHDVisualAdapter.js'
import {createRelaxedScottHands} from '../src/vehicle/relaxedScottHands.js'
import {createDrivingCyclone} from '../src/vehicle/createDrivingCyclone.js'
import {createBikeState} from '../src/vehicle/bikePhysics.js'
import {bikeConfig} from '../src/vehicle/bikeConfig.js'
import {updateScottGameplay} from '../src/vehicle/scottGameplay.js'
import {parseCycloneScottActions} from '../src/vehicle/cycloneScottActions.js'
import {ArmorController} from '../src/vehicle/ArmorController.js'
import {ArmorGallantPose} from '../src/vehicle/ArmorGallantPose.js'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const dir='artifacts/scott-hd-hybrid-v2',report=JSON.parse(fs.readFileSync(dir+'/build-report.json'))
const original=readGlb('public/models/mospeada/scott-bernard-animated-original.glb'),hybrid=readGlb(report.output),donor=readGlb('assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb')
assert.ok(hybrid.bin.subarray(0,original.bin.length).equals(original.bin),'Original rig/animation/vertex binary must be untouched')
assert.deepEqual(hybrid.doc.animations,original.doc.animations);assert.deepEqual(hybrid.doc.skins,original.doc.skins)
for(const i of original.doc.skins[0].joints)assert.deepEqual(hybrid.doc.nodes[i],original.doc.nodes[i])
const originalPrim=original.doc.meshes[0].primitives[0],basePrim=hybrid.doc.meshes[0].primitives[0]
assert.deepEqual(basePrim.attributes,originalPrim.attributes,'Original arm/hand/leg skin streams must be unchanged')
const kept=new Set(accessorData(hybrid,basePrim.indices).values.flatMap((v,i,a)=>i%3===0?[a.slice(i,i+3).flat().join(',')]:[])),sourceP=accessorData(original,originalPrim.attributes.POSITION).values,sourceJ=accessorData(original,originalPrim.attributes.JOINTS_0).values,sourceW=accessorData(original,originalPrim.attributes.WEIGHTS_0).values,originalIndices=accessorData(original,originalPrim.indices).values.flat()
let protectedTriangles=0
for(let i=0;i<originalIndices.length;i+=3){const ids=originalIndices.slice(i,i+3),protectedBody=ids.some(id=>sourceJ[id].some((j,k)=>(j>=8||j===0)&&sourceW[id][k]>.5));if(protectedBody){assert.ok(kept.has(ids.join(',')),'Original arms/hands/pelvis/legs triangle removed');protectedTriangles++}}
const donorP=accessorData(donor,donor.doc.meshes[0].primitives[0].attributes.POSITION).values
const geometry=[]
for(const part of report.parts){
 const primitive=hybrid.doc.meshes.find(m=>m.name===part.name).primitives[0],pos=accessorData(hybrid,primitive.attributes.POSITION).values,norm=accessorData(hybrid,primitive.attributes.NORMAL).values,joints=accessorData(hybrid,primitive.attributes.JOINTS_0).values,weights=accessorData(hybrid,primitive.attributes.WEIGHTS_0).values,ids=accessorData(hybrid,primitive.indices).values.flat(),provenanceBytes=fs.readFileSync(`${dir}/${part.name}-source-vertices.bin`),provenance=new Uint32Array(provenanceBytes.buffer,provenanceBytes.byteOffset,provenanceBytes.length/4)
 let positionError=0,maxEdge=0
 for(let i=0;i<pos.length;i++){
  assert.equal(joints[i][0],part.joint);assert.deepEqual(weights[i],[1,0,0,0]);assert.ok(Math.abs(Math.hypot(...norm[i])-1)<1e-5)
  for(let k=0;k<3;k++)positionError=Math.max(positionError,Math.abs(pos[i][k]-(donorP[provenance[i]][k]*part.scale[k]+part.offset[k])))
 }
 for(let i=0;i<ids.length;i+=3)for(let k=0;k<3;k++){assert.ok(ids[i+k]<pos.length);maxEdge=Math.max(maxEdge,Math.hypot(...pos[ids[i+k]].map((v,j)=>v-pos[ids[i+(k+1)%3]][j])))}
 assert.ok(positionError<1e-6);assert.ok(maxEdge<.035,'Source triangles must not be stretched into spikes')
 geometry.push({name:part.name,vertices:pos.length,triangles:ids.length/3,maxAlignmentError:positionError,maxEdgeMeters:maxEdge,rigidJoint:part.jointName})
}
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const [source,hd,bike]=await Promise.all([load('public/models/mospeada/scott-bernard-animated-original.glb'),load(report.output),load('public/models/mospeada/cyclone-vr052f.glb')])
source.scene.updateMatrixWorld(true);const rest={};source.scene.traverse(n=>{if(n.isBone)rest[n.name]=n.matrixWorld.toArray()})
const authored=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')),clips=[...source.animations,...parseCycloneScottActions(authored)],flat=(x,z,out)=>{if(out)out.surface='asphalt';return 0}
function fixture(withHD){
 const model=clone(source.scene),wrapper=new T.Group(),bones=new Map(),skins=[],hands=[],rig=createDrivingCyclone(clone(bike.scene));wrapper.add(model)
 model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh){skins.push({mesh:n});const hand=createRelaxedScottHands(n);if(hand){hand.attach();hands.push(hand)}}})
 const instance={model,sourceScene:source.scene,sourceClips:source.animations,bones,skins,hands,mixer:new T.AnimationMixer(model),clip:null},s=createBikeState({x:0,z:0,yaw:0},rig.metrics,flat)
 const runtime={state:s,vehicleRig:rig,scottBikeBody:rig.body,paused:false,keys:{},scottInstance:instance}
 const previousGeometry=skins[0].mesh.geometry,originalIndex=previousGeometry.index,visual=withHD?attachScottHDVisual(instance,hd.scene):null
 const step=()=>{rig.update(s,flat,bikeConfig);updateScottGameplay(instance,{data:authored},clips,runtime,wrapper,1/60);wrapper.updateMatrixWorld(true)}
 return{model,wrapper,bones,skins,hands,rig,instance,s,runtime,visual,step,previousGeometry,originalIndex}
}
const a=fixture(false),b=fixture(true),poses=[];let worstRigidError=0
function compare(){for(const [name,bone]of a.bones){const other=b.bones.get(name);bone.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-other.matrixWorld.elements[i])<1e-7,`Variant altered gameplay bone ${name}`))}}
function capture(name){
 b.wrapper.updateMatrixWorld(true);compare();const bones=[...b.bones].map(([name,bone])=>({name,world:bone.matrixWorld.toArray(),position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()}));poses.push({name,wrapper:{position:b.wrapper.position.toArray(),quaternion:b.wrapper.quaternion.toArray(),scale:b.wrapper.scale.toArray()},bones})
 for(const mesh of b.visual.meshes){
  mesh.updateWorldMatrix(true,false);mesh.skeleton.update();const joint=mesh.geometry.attributes.skinIndex.getX(0),bone=mesh.skeleton.bones[joint],delta=bone.matrixWorld.clone().multiply(new T.Matrix4().fromArray(rest[bone.name]).invert()),position=mesh.geometry.attributes.position
  for(let i=0;i<position.count;i+=Math.max(1,Math.floor(position.count/512))){const expected=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(delta),actual=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld),error=expected.distanceTo(actual);assert.ok(error<2e-5,`Rigid piece drift ${mesh.name} ${error}`);worstRigidError=Math.max(worstRigidError,error)}
 }
}
capture('rest')
for(const f of [a,b]){f.s.speed=18;f.s.idleBlend=0}
for(let i=0;i<60;i++){a.step();b.step()}capture('driving')
for(const f of [a,b])f.runtime.transformEntry={phase:'complete',poseBlend:.55,returnFlight:false,actorOffset:new T.Vector3(),actorPose:{arms:.55,legs:.55}}
for(let i=0;i<30;i++){a.step();b.step()}capture('transform')
for(const f of [a,b]){
 Object.assign(f.runtime.transformEntry,{poseBlend:1,actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}});f.step()
 f.runtime.armorController=new ArmorController(f.runtime,f.rig,flat,()=>true);assert.ok(f.runtime.armorController.activate());f.instance.armorGallantPose=new ArmorGallantPose(f.instance)
}
for(let i=0;i<60;i++)for(const f of [a,b]){f.step();const state=f.runtime.armorController.state;f.instance.armorGallantPose.applyArmor(new T.Vector3(state.x+2,state.height+1.3,state.z+8),true,state,1/60);f.wrapper.updateMatrixWorld(true)}
capture('combat')
// Exercise all source clips with each rigid piece attached to the real skeleton.
const playback=fixture(true)
for(const clip of source.animations){playback.instance.mixer.stopAllAction();const action=playback.instance.mixer.clipAction(clip).reset().play();for(const t of [0,.25,.5,.75]){action.time=clip.duration*t;playback.instance.mixer.update(0);playback.wrapper.updateMatrixWorld(true);for(const mesh of playback.visual.meshes){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i+=401){const v=mesh.getVertexPosition(i,new T.Vector3());assert.ok(v.toArray().every(Number.isFinite))}}}}
playback.visual.dispose();assert.equal(playback.skins[0].mesh.geometry,playback.previousGeometry);assert.equal(playback.previousGeometry.index,playback.originalIndex)
b.visual.dispose();assert.equal(b.previousGeometry.index,b.originalIndex)
fs.writeFileSync(dir+'/animation-poses.json',JSON.stringify({rest,poses},null,2)+'\n')
fs.writeFileSync('public/models/mospeada/scott-hd-v2-proof.json',JSON.stringify({poses})+'\n')
const result={passed:true,geometry,protectedOriginalTriangles:protectedTriangles,originalBinaryPreserved:true,originalJointsPreserved:24,originalClipsPreserved:16,nativeGameplayABPoses:poses.map(p=>p.name),sampledClips:source.animations.map(c=>c.name),worstRigidWorldErrorMeters:worstRigidError,reversibleVariant:true}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
