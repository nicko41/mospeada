import fs from 'node:fs'
import crypto from 'node:crypto'
import {Box3,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {readGlb} from './glb-data.mjs'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const directory='artifacts/scott-hd-hybrid-v1';fs.mkdirSync(directory,{recursive:true})
const inputs={receiver:'public/models/mospeada/scott-bernard-animated-original.glb',donor:'assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'},report={}
for(const [key,file] of Object.entries(inputs)){
 const g=readGlb(file),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'');asset.scene.updateMatrixWorld(true)
 const meshes=[],bones=[]
 asset.scene.traverse(n=>{
  if(n.isBone)bones.push({name:n.name,parent:n.parent.name,position:n.getWorldPosition(new Vector3()).toArray()})
  if(!n.isMesh)return
  n.skeleton?.update();const box=new Box3(),rawBox=new Box3().setFromBufferAttribute(n.geometry.attributes.position)
  for(let i=0;i<n.geometry.attributes.position.count;i++)box.expandByPoint(n.localToWorld(n.getVertexPosition(i,new Vector3())))
  meshes.push({name:n.name,vertices:n.geometry.attributes.position.count,triangles:(n.geometry.index?.count||n.geometry.attributes.position.count)/3,skinned:!!n.isSkinnedMesh,bounds:{min:box.min.toArray(),max:box.max.toArray()},rawBounds:{min:rawBox.min.toArray(),max:rawBox.max.toArray()},matrix:n.matrixWorld.toArray()})
 })
 report[key]={file,sha256:crypto.createHash('sha256').update(g.bytes).digest('hex'),bytes:g.bytes.length,meshes,bones,animations:asset.animations.map(a=>({name:a.name,duration:a.duration})),materials:g.doc.materials,images:g.doc.images.map(i=>({mimeType:i.mimeType,bytes:g.doc.bufferViews[i.bufferView].byteLength})),nodes:g.doc.nodes}
}
fs.writeFileSync(directory+'/inspection.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([key,r])=>[key,{meshes:r.meshes,bones:r.bones}]))))
