import fs from 'node:fs'
import assert from 'node:assert/strict'
import {Matrix4,Vector3} from 'three'
import {readGlb,accessorData} from './glb-data.mjs'
import {ridingFixture} from './scott-v2-riding-fixture.mjs'
const dir='artifacts/scott-rigid-chest',patch=JSON.parse(fs.readFileSync(dir+'/patch.json')),selection=JSON.parse(fs.readFileSync(dir+'/selection.json')),old=readGlb(patch.source),next=readGlb(patch.output),p=old.doc.meshes[0].primitives[0],selected=new Set(selection.vertexIds),allowed=new Uint8Array(old.bin.length)
assert.deepEqual(next.doc.nodes,old.doc.nodes);assert.deepEqual(next.doc.skins,old.doc.skins);assert.deepEqual(next.doc.animations,old.doc.animations);for(const key of['materials','textures','images','samplers','accessors','bufferViews','meshes'])assert.deepEqual(next.doc[key],old.doc[key],key+' changed')
for(const name of['JOINTS_0','WEIGHTS_0','_RIGID_OWNER']){const a=accessorData(old,p.attributes[name]);for(const id of selected)allowed.fill(1,a.offset+id*a.stride,a.offset+id*a.stride+a.components*a.size)}
let changedBytes=0;for(let i=0;i<old.bin.length;i++)if(old.bin[i]!==next.bin[i]){assert.ok(allowed[i],'Changed an unrelated binary byte at '+i);changedBytes++}
const labels=accessorData(old,p.attributes._RIGID_OWNER).values.flat();for(const id of selected){assert.ok(id>=15429);assert.ok(![0,5,9,10,13,14,16,17,18,20,21,22].includes(labels[id]),'Changed an existing rigid part outside the chest: '+id)}
assert.equal(selection.redClothSelected,0)
const before=await ridingFixture({modelPath:patch.source}),after=await ridingFixture({modelPath:patch.output});for(const f of[before,after]){Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60)}
for(const[name,b]of before.bones)assert.deepEqual(after.bones.get(name).matrixWorld.toArray(),b.matrixWorld.toArray(),'Riding pose changed: '+name)
const results={};for(const[key,f]of[['before',before],['after',after]]){
 const mesh=f.skins[0].mesh,s=mesh.skeleton,owner=3,rigid=new Matrix4().copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(s.bones[owner].matrixWorld).multiply(s.boneInverses[owner]).multiply(mesh.bindMatrix),position=mesh.geometry.attributes.position;let worst=0
 for(const id of selected){const actual=mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())),expected=new Vector3().fromBufferAttribute(position,id).applyMatrix4(rigid);worst=Math.max(worst,actual.distanceTo(expected))}
 results[key]={maxRigidSurfaceErrorMeters:worst};if(key==='after')assert.ok(worst<2e-6,'Front armor is still deforming')
}
// The upper fastener/disc regions must preserve all local distances, including
// thickness: a single rigid transform guarantees the original shape/volume.
const mesh=after.skins[0].mesh,position=mesh.geometry.attributes.position,discs={}
for(const[side,sign]of[['Left',1],['Right',-1]]){
 const ids=[...selected].filter(i=>position.getY(i)>1.39&&position.getY(i)<1.45&&position.getX(i)*sign>.07&&position.getX(i)*sign<.145&&position.getZ(i)>.05);assert.ok(ids.length>100)
 let error=0;const first=ids[0],rest=new Vector3().fromBufferAttribute(position,first),posed=mesh.localToWorld(mesh.getVertexPosition(first,new Vector3()))
 for(const id of ids){const restLength=rest.distanceTo(new Vector3().fromBufferAttribute(position,id))*after.authored.data.actorScale,posedLength=posed.distanceTo(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())));error=Math.max(error,Math.abs(restLength-posedLength))}
 assert.ok(error<2e-6);discs[side]={vertices:ids.length,maxDistanceChangeMeters:error}
}
const report={passed:true,scope:'Front chest only',selectedVertices:selected.size,changedWeights:patch.changedWeights,changedBinaryBytes:changedBytes,unselectedWeightsUnchanged:true,existingRigidShoulderPadsUnchanged:true,redClothUnchanged:true,geometryAndMaterialsUnchanged:true,original24BoneRigAnd16ClipsUnchanged:true,ridingPoseMatricesIdentical:true,rigidSurface:results,upperDiscRegions:discs}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
