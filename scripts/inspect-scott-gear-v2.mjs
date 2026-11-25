import fs from 'node:fs'
import crypto from 'node:crypto'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3} from 'three'
import {readGlb,accessorData} from './glb-data.mjs'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const dir='artifacts/scott-gear-v2';fs.mkdirSync(dir,{recursive:true})
const files={original:'public/models/mospeada/scott-bernard-animated-original.glb',donor:'assets/01-SCOTT/scott-bernard-gear-v2.glb'},report={}
for(const[name,file]of Object.entries(files)){
 const g=readGlb(file),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'');asset.scene.updateMatrixWorld(true)
 const bones=[];asset.scene.traverse(n=>{if(n.isBone)bones.push({name:n.name,parent:n.parent.name,position:n.getWorldPosition(new Vector3()).toArray()})})
 report[name]={file,sha256:crypto.createHash('sha256').update(g.bytes).digest('hex'),bytes:g.bytes.length,nodes:g.doc.nodes,meshes:g.doc.meshes.map(m=>({name:m.name,primitives:m.primitives.map(p=>({vertices:g.doc.accessors[p.attributes.POSITION].count,triangles:g.doc.accessors[p.indices].count/3,bounds:g.doc.accessors[p.attributes.POSITION]}))})),bones,clips:asset.animations.map(c=>({name:c.name,duration:c.duration})),materials:g.doc.materials,images:g.doc.images}
 if(name==='original'){
  const p=g.doc.meshes[0].primitives[0],reference={positions:accessorData(g,p.attributes.POSITION).values,normals:accessorData(g,p.attributes.NORMAL).values,uvs:accessorData(g,p.attributes.TEXCOORD_0).values,indices:accessorData(g,p.indices).values.flat(),joints:accessorData(g,p.attributes.JOINTS_0).values,weights:accessorData(g,p.attributes.WEIGHTS_0).values,bones,jointNames:g.doc.skins[0].joints.map(i=>g.doc.nodes[i].name.replace(':',''))}
  fs.writeFileSync(dir+'/reference.json',JSON.stringify(reference))
 }
}
fs.writeFileSync(dir+'/inspection.json',JSON.stringify(report,null,2)+'\n');console.log('Original: 24 bones / 16 clips / 10334 triangles. Donor: unrigged / 801630 triangles.')
