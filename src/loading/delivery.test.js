import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {readGlb} from '../../scripts/glb-data.mjs'
globalThis.self=globalThis
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const load=async path=>{const b=fs.readFileSync(path);return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const meshes=a=>{const result=[];a.scene.traverse(m=>{if(m.isMesh)result.push(m)});return result}
for(const [source,delivery,functional]of [['scott-bernard-gear-v2-rear-refined','scott-controller-v2',true],['scott-bernard-animated-original','scott-reference-v1',true],['scott-gear-v3-helmet-boundary','scott-v3',false],['invid-scout-rigged','invid-scout',false],['rand-casual-rigged','rand-rider',false],['mars-gallant','mars-gallant',false],['horizon-t-desert-landmark','horizon-t',false]]){
 test(delivery+' preserves every vertex attribute, index, bind matrix, hierarchy and animation key exactly',async()=>{
  const sourcePath=`public/models/mospeada/${source}.glb`,output=`public/delivery/${delivery}.glb`,[a,b]=await Promise.all([load(sourcePath),load(output)])
  const original=meshes(a),derived=meshes(b);assert.equal(original.length,derived.length)
  original.forEach((mesh,i)=>{
   const result=derived[i];assert.equal(mesh.name,result.name)
   assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(),Object.keys(result.geometry.attributes).sort())
   for(const key of Object.keys(mesh.geometry.attributes)){const x=mesh.geometry.attributes[key],y=result.geometry.attributes[key];assert.equal(x.itemSize,y.itemSize,key);assert.equal(x.normalized,y.normalized,key);assert.deepEqual(y.array,x.array,key)}
   assert.deepEqual(result.geometry.index?.array,mesh.geometry.index?.array)
   assert.equal(result.geometry.morphTargetsRelative,mesh.geometry.morphTargetsRelative)
   for(const [key,attributes]of Object.entries(mesh.geometry.morphAttributes))attributes.forEach((attribute,j)=>assert.deepEqual(result.geometry.morphAttributes[key][j].array,attribute.array))
   if(!mesh.isSkinnedMesh)return
   assert.deepEqual(result.bindMatrix.elements,mesh.bindMatrix.elements)
   assert.deepEqual(result.skeleton.boneInverses.map(m=>m.elements),mesh.skeleton.boneInverses.map(m=>m.elements))
   assert.deepEqual(result.skeleton.bones.map(x=>({name:x.name,p:x.position.toArray(),q:x.quaternion.toArray(),s:x.scale.toArray(),parent:x.parent.name})),mesh.skeleton.bones.map(x=>({name:x.name,p:x.position.toArray(),q:x.quaternion.toArray(),s:x.scale.toArray(),parent:x.parent.name})))
  })
  assert.equal(a.animations.length,b.animations.length)
  a.animations.forEach((clip,i)=>{const next=b.animations[i];assert.equal(clip.name,next.name);assert.equal(clip.duration,next.duration);assert.equal(clip.tracks.length,next.tracks.length);clip.tracks.forEach((track,j)=>{const t=next.tracks[j];assert.equal(t.name,track.name);assert.equal(t.getInterpolation(),track.getInterpolation());assert.deepEqual(t.times,track.times);assert.deepEqual(t.values,track.values)})})
  const input=readGlb(sourcePath),result=readGlb(output);assert.deepEqual(result.doc.nodes,input.doc.nodes)
  if(functional){assert.equal(result.doc.images,undefined);assert.equal(result.doc.textures,undefined)}
  else{assert.deepEqual(result.doc.materials,input.doc.materials);for(const [i,image]of (input.doc.images||[]).entries()){const v=input.doc.bufferViews[image.bufferView],w=result.doc.bufferViews[result.doc.images[i].bufferView];assert.ok(input.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength).equals(result.bin.subarray(w.byteOffset||0,(w.byteOffset||0)+w.byteLength)))}}
  assert.equal(result.doc.asset.extras.delivery.sourceSha256,crypto.createHash('sha256').update(input.bytes).digest('hex'))
 })
}
