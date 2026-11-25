import fs from 'node:fs'
import assert from 'node:assert/strict'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {readGlb,accessorData} from './glb-data.mjs'
import {createRelaxedScottHands} from '../src/vehicle/relaxedScottHands.js'
import {createDrivingCyclone} from '../src/vehicle/createDrivingCyclone.js'
import {createBikeState} from '../src/vehicle/bikePhysics.js'
import {bikeConfig} from '../src/vehicle/bikeConfig.js'
import {updateScottGameplay} from '../src/vehicle/scottGameplay.js'
import {parseCycloneScottActions} from '../src/vehicle/cycloneScottActions.js'
import {ArmorController} from '../src/vehicle/ArmorController.js'
import {ArmorGallantPose} from '../src/vehicle/ArmorGallantPose.js'
import {ArmorArticulation} from '../src/vehicle/ArmorArticulation.js'
import {FrontBattloidTransform} from '../src/vehicle/FrontBattloidTransform.js'
import {RearBattloidTransform} from '../src/vehicle/RearBattloidTransform.js'
import {GuardBattloidTransform} from '../src/vehicle/GuardBattloidTransform.js'
import {readKneeSocket,kneeSocketPoint} from '../src/vehicle/scottKneeSockets.js'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const dir='artifacts/scott-gear-v2',read=p=>JSON.parse(fs.readFileSync(p)),build=read(dir+'/build.json'),original=readGlb('public/models/mospeada/scott-bernard-animated-original.glb'),derived=readGlb(build.output),donor=readGlb('assets/01-SCOTT/scott-bernard-gear-v2.glb'),primitive=derived.doc.meshes[0].primitives[0],legacy=15429
assert.ok(derived.bin.subarray(0,original.bin.length).equals(original.bin),'Original rig and animation binary changed')
assert.deepEqual(derived.doc.skins,original.doc.skins);assert.deepEqual(derived.doc.animations,original.doc.animations)
for(const i of original.doc.skins[0].joints)assert.deepEqual(derived.doc.nodes[i],original.doc.nodes[i])
for(const semantic of ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']){
 const a=accessorData(derived,primitive.attributes[semantic]).values.slice(0,legacy),b=accessorData(original,original.doc.meshes[0].primitives[0].attributes[semantic]).values;assert.deepEqual(a,b,`Reference ${semantic} changed`)
}
const idx=accessorData(derived,primitive.indices).values.flat(),p=accessorData(derived,primitive.attributes.POSITION).values,j=accessorData(derived,primitive.attributes.JOINTS_0).values,w=accessorData(derived,primitive.attributes.WEIGHTS_0).values,rigid=accessorData(derived,primitive.attributes._RIGID_OWNER).values.flat()
assert.ok(idx.every(i=>i>=legacy&&i<p.length),'Reference geometry must never be drawn')
for(let i=legacy;i<p.length;i++){
 assert.ok(p[i].every(Number.isFinite));assert.ok(j[i].every(k=>k>=0&&k<24));assert.ok(Math.abs(w[i].reduce((s,v)=>s+v,0)-1)<1e-5)
 if(rigid[i]!==255){assert.equal(j[i][0],rigid[i]);assert.ok(Math.abs(w[i][0]-1)<1e-6)}
}
for(let i=0;i<donor.doc.images.length;i++){
 const a=donor.doc.bufferViews[donor.doc.images[i].bufferView],b=derived.doc.bufferViews[derived.doc.images[original.doc.images.length+i].bufferView]
 assert.ok(donor.bin.subarray(a.byteOffset,a.byteOffset+a.byteLength).equals(derived.bin.subarray(b.byteOffset,b.byteOffset+b.byteLength)),'Donor atlas was reencoded')
}
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const [source,newAsset,bike,rearParts]=await Promise.all(['public/models/mospeada/scott-bernard-animated-original.glb',build.output,'public/models/mospeada/cyclone-vr052f.glb','public/transformations/cyclone-rear-pieces.glb'].map(load))
source.scene.updateMatrixWorld(true);const rest={};source.scene.traverse(n=>{if(n.isBone)rest[n.name]=n.matrixWorld.toArray()})
const authored=read('public/animations/scott-cyclone-actions.json'),clips=[...newAsset.animations,...parseCycloneScottActions(authored)],flat=()=>0
function fixture(asset){
 const model=clone(asset.scene),wrapper=new T.Group(),bones=new Map(),skins=[],hands=[],rig=createDrivingCyclone(clone(bike.scene));wrapper.add(model)
 model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh){skins.push({mesh:n});const hand=createRelaxedScottHands(n);if(hand)hands.push(hand)}})
 const instance={model,sourceScene:source.scene,sourceClips:source.animations,bones,skins,hands,mixer:new T.AnimationMixer(model),clip:null},s=createBikeState({x:0,z:0,yaw:0},rig.metrics,flat),runtime={state:s,vehicleRig:rig,scottBikeBody:rig.body,paused:false,keys:{},scottInstance:instance}
 const step=()=>{rig.update(s,flat,bikeConfig);updateScottGameplay(instance,{data:authored},clips,runtime,wrapper,1/60);wrapper.updateMatrixWorld(true);skins.forEach(({mesh})=>mesh.skeleton.update())}
 return{model,wrapper,bones,skins,hands,rig,instance,s,runtime,step}
}
const f=fixture(newAsset),old=fixture(source),poses=[];let maxRigidError=0
function capture(name){
 f.wrapper.updateMatrixWorld(true);f.skins[0].mesh.skeleton.update();const bones=[...f.bones].map(([name,bone])=>({name,world:bone.matrixWorld.toArray()}));poses.push({name,bones})
 const mesh=f.skins[0].mesh,indices=mesh.geometry.index.array
 for(let i=0;i<indices.length;i+=Math.max(3,Math.floor(indices.length/1200/3)*3)){
  for(const id of [indices[i],indices[i+1]]){
   const actual=mesh.getVertexPosition(id,new T.Vector3()).applyMatrix4(mesh.matrixWorld);assert.ok(actual.toArray().every(Number.isFinite))
   if(rigid[id]!==255&&!/Hand/.test(mesh.skeleton.bones[rigid[id]].name)){
    const bone=mesh.skeleton.bones[rigid[id]],delta=bone.matrixWorld.clone().multiply(new T.Matrix4().fromArray(rest[bone.name]).invert()),expected=new T.Vector3(...p[id]).applyMatrix4(delta),error=expected.distanceTo(actual);maxRigidError=Math.max(maxRigidError,error);assert.ok(error<2e-5,`Rigid armor deformed ${bone.name}`)
   }
  }
 }
}
capture('rest')
for(const q of[f,old]){q.s.speed=18;q.s.idleBlend=0}
for(let i=0;i<60;i++){f.step();old.step()}capture('driving')
const palmErrors=f.instance.mountedMotion.limbs.filter(l=>!l.leg).map(l=>({side:l.side,IKError:l.c.getWorldPosition(new T.Vector3()).distanceTo(f.rig.body.localToWorld(l.target.clone()))}))
for(const q of[f,old])q.runtime.transformEntry={phase:'complete',poseBlend:.55,returnFlight:false,actorOffset:new T.Vector3(),actorPose:{arms:.55,legs:.55}}
for(let i=0;i<30;i++){f.step();old.step()}capture('transform')
for(const q of[f,old]){Object.assign(q.runtime.transformEntry,{poseBlend:1,actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}});q.step();q.runtime.armorController=new ArmorController(q.runtime,q.rig,flat,()=>true);assert.ok(q.runtime.armorController.activate());q.instance.armorGallantPose=new ArmorGallantPose(q.instance)}
for(let i=0;i<60;i++)for(const q of[f,old]){q.step();const s=q.runtime.armorController.state;q.instance.armorGallantPose.applyArmor(new T.Vector3(s.x+2,s.height+1.3,s.z+8),true,s,1/60);q.wrapper.updateMatrixWorld(true)}
capture('combat')
// Exercise the actual armor attachments with the preserved reference IDs.
const front=new FrontBattloidTransform(f.rig,f.instance,read('public/transformations/cyclone-front-battloid.json')),rear=new RearBattloidTransform(f.rig,front,read('public/transformations/cyclone-rear-battloid.json'),clone(rearParts.scene)),guards=new GuardBattloidTransform(f.rig,f.instance,read('public/transformations/cyclone-guard-battloid.json'))
Object.assign(f.runtime,{frontTransformation:front,rearTransformation:rear,guardTransformation:guards});front.apply(1);rear.apply(1);guards.apply(1)
const articulation=new ArmorArticulation(f.runtime);articulation.prepare(f.runtime.armorController);articulation.apply(f.runtime.armorController,f.runtime.transformEntry,1/60)
let maxSocketError=0
for(const binding of articulation.bindings){const error=binding.bottom.clone().applyMatrix4(binding.mesh.matrixWorld).distanceTo(kneeSocketPoint(binding.skin,binding.socket));assert.ok(error<1e-6);maxSocketError=Math.max(maxSocketError,error)}
assert.equal(articulation.bindings.length,2)
const animation=fixture(newAsset),samples=[]
for(const clip of source.animations){animation.instance.mixer.stopAllAction();const action=animation.instance.mixer.clipAction(clip).reset().play();let worst=0
 for(const t of[0,.2,.4,.6,.8]){action.time=clip.duration*t;animation.instance.mixer.update(0);animation.wrapper.updateMatrixWorld(true);const mesh=animation.skins[0].mesh;mesh.skeleton.update();for(let i=legacy;i<p.length;i+=173){const v=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));worst=Math.max(worst,v.length())}}
 samples.push({name:clip.name,samples:5,finite:true,maxDistance:worst})
}
fs.writeFileSync(dir+'/animation-poses.json',JSON.stringify({rest,poses},null,2)+'\n')
const result={passed:true,bones:24,clips:16,originalBinaryPreserved:true,donorImageBytesPreserved:true,referenceVerticesNeverDrawn:true,referenceVerticesUnchanged:legacy,rigidWorldErrorMeters:maxRigidError,kneeSocketErrorMeters:maxSocketError,palmIK:palmErrors,animationSamples:samples,gameplayPoses:poses.map(p=>p.name),rigidAndClothWeightsNormalized:true}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
