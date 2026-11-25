import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {readGlb,accessorData} from './glb-data.mjs'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),dir='artifacts/scott-rear-refinement',files=['public/models/mospeada/scott-bernard-gear-v2-classic-palette.glb',process.argv[2]||dir+'/candidate.glb'],models=files.map(readGlb)
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const before=JSON.parse(fs.readFileSync(dir+'/before-inspection.json')),after=JSON.parse(fs.readFileSync(dir+'/after-inspection.json'));assert.deepEqual(after.pose,before.pose)
const attributes=models.map(g=>{const a=g.doc.meshes[0].primitives[0].attributes;return Object.fromEntries(Object.entries(a).map(([k,id])=>[k,accessorData(g,id).values]))}),changed=[]
for(let id=0;id<attributes[0].POSITION.length;id++){
 const p=attributes[0].POSITION[id],q=attributes[1].POSITION[id],different=p.some((v,k)=>v!==q[k]);if(different)changed.push(id)
 assert.ok(q.every(Number.isFinite));assert.ok(attributes[1].NORMAL[id].every(Number.isFinite))
 if(id<15429||p[2]>=.012||p[1]<.90||p[1]>1.13&&p[1]<1.415||Math.abs(p[0])>.20)assert.deepEqual(q,p)
 for(const key of['TEXCOORD_0','JOINTS_0','WEIGHTS_0','_RIGID_OWNER'])assert.deepEqual(attributes[1][key][id],attributes[0][key][id])
}
const decode=async(g,index)=>{const image=g.doc.images[g.doc.textures[index].source],v=g.doc.bufferViews[image.bufferView];return sharp(g.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true})}
const materials=models.map(g=>g.doc.materials[g.doc.meshes[0].primitives[0].material]),textures=await Promise.all(models.map((g,i)=>Promise.all([materials[i].pbrMetallicRoughness.baseColorTexture.index,materials[i].normalTexture.index,materials[i].pbrMetallicRoughness.metallicRoughnessTexture.index].map(index=>decode(g,index)))))
let protectedTexelSamples=0
for(let id=15429;id<attributes[0].POSITION.length;id++){
 const p=attributes[0].POSITION[id];if(!(p[1]>1.13||p[1]<.90||p[2]>.012||Math.abs(p[0])>.20))continue
 const[u,v]=attributes[0].TEXCOORD_0[id]
 for(let t=0;t<3;t++){const a=textures[0][t],b=textures[1][t],x=Math.max(0,Math.min(a.info.width-1,Math.floor(u*a.info.width))),y=Math.max(0,Math.min(a.info.height-1,Math.floor(v*a.info.height))),offset=(y*a.info.width+x)*4;assert.ok(a.data.subarray(offset,offset+4).equals(b.data.subarray(offset,offset+4)),'Unrelated UV texel changed at vertex '+id);protectedTexelSamples++}
}
const assets=await Promise.all(models.map(g=>new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.byteLength),''))),scenes=assets.map(a=>clone(a.scene)),meshes=scenes.map(scene=>{let mesh;scene.traverse(n=>{if(n.isSkinnedMesh)mesh=n});return mesh}),mixers=scenes.map(scene=>new T.AnimationMixer(scene)),samples=[...new Set([...changed.filter((_,i)=>i%13===0),...Array.from({length:200},(_,i)=>Math.floor(i*(attributes[0].POSITION.length-1)/199))])],changedSet=new Set(changed)
let frames=0,maximumAnimatedDifference=0
for(let c=0;c<assets[0].animations.length;c++){
 const actions=mixers.map((m,i)=>{m.stopAllAction();return m.clipAction(assets[i].animations[c]).reset().play()})
 for(const fraction of[0,.35,.75]){
  mixers.forEach((m,i)=>{m.setTime(assets[i].animations[c].duration*fraction);scenes[i].updateMatrixWorld(true);meshes[i].skeleton.update()})
  for(const id of samples){const ps=meshes.map(mesh=>mesh.localToWorld(mesh.getVertexPosition(id,new T.Vector3())));assert.ok(ps.every(p=>p.toArray().every(Number.isFinite)));const distance=ps[0].distanceTo(ps[1]);maximumAnimatedDifference=Math.max(maximumAnimatedDifference,distance);if(!changedSet.has(id))assert.ok(distance<1e-7,'Unedited vertex moved during '+assets[0].animations[c].name);assert.ok(distance<.04,'Local edit must remain local through animation')}
  frames++
 }
}
for(const key of['nodes','skins','animations','meshes'])assert.deepEqual(models[1].doc[key],models[0].doc[key])
const report={passed:true,source:files[0],result:files[1],bones:models[1].doc.skins[0].joints.length,clips:assets[1].animations.length,animatedFramesChecked:frames,changedVertices:changed.length,totalVertices:attributes[0].POSITION.length,maximumAnimatedDifference,protectedTexelSamples,approvedRidingMeasurementsIdentical:true,frontTorsoArmsLegsAndReferenceAnchorsProtected:true,weightsUVTopologyAndRigUnchanged:true}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
