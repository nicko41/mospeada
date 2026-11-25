import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
const dir='artifacts/scott-source-chest',selection=JSON.parse(fs.readFileSync(dir+'/selection.json')),source=readGlb(selection.sourcePath),p=source.doc.meshes[0].primitives[0],ids=selection.source.vertexIds,remap=new Map(ids.map((id,i)=>[id,i])),chunks=[];let length=0
const doc={asset:{version:'2.0',generator:'MOSPEADA original donor chest extraction; no vertex deformation'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Scott_original_rigid_front_chest',mesh:0}],meshes:[{primitives:[{attributes:{},mode:4,material:0}]}],materials:structuredClone(source.doc.materials),textures:structuredClone(source.doc.textures),samplers:structuredClone(source.doc.samplers||[]),images:[],accessors:[],bufferViews:[],buffers:[]}
function view(bytes,target){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const off=length;chunks.push(bytes);length+=bytes.length;const n=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:off,byteLength:bytes.length,...(target?{target}:{})});return n}
function accessor(bytes,componentType,type,count,target,ext={}){const n=doc.accessors.length;doc.accessors.push({bufferView:view(bytes,target),componentType,type,count,...ext});return n}
for(const name of['POSITION','NORMAL','TEXCOORD_0']){
 const a=accessorData(source,p.attributes[name]),size=a.components*a.size,bytes=Buffer.alloc(ids.length*size);ids.forEach((id,i)=>source.bin.copy(bytes,i*size,a.offset+id*a.stride,a.offset+id*a.stride+size));let ext={}
 if(name==='POSITION'){const values=ids.map(i=>a.values[i]);ext={min:[0,1,2].map(k=>Math.min(...values.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...values.map(v=>v[k])))}}
 doc.meshes[0].primitives[0].attributes[name]=accessor(bytes,a.accessor.componentType,a.accessor.type,ids.length,34962,ext)
}
const originalIndices=accessorData(source,p.indices).values.flat(),indices=new Uint32Array(selection.source.faceIds.flatMap(face=>originalIndices.slice(face*3,face*3+3).map(id=>remap.get(id))));doc.meshes[0].primitives[0].indices=accessor(Buffer.from(indices.buffer),5125,'SCALAR',indices.length,34963)
for(const image of source.doc.images){const v=source.doc.bufferViews[image.bufferView];doc.images.push({...image,bufferView:view(source.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))})}
const alignment=JSON.parse(fs.readFileSync('artifacts/scott-gear-v2/alignment.json')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');doc.nodes[0].extras={sourceSha256:sha(selection.sourcePath),sourceVertexIds:ids,sourceScale:alignment.uniformBodyScale,sourceOffset:alignment.offset,replacedFaceIds:selection.replacement.faceIds};doc.buffers=[{byteLength:length}]
const output='public/models/mospeada/scott-original-rigid-chest.glb';writeGlb(output,doc,Buffer.concat(chunks))
const asset=readGlb(output);for(const name of['POSITION','NORMAL','TEXCOORD_0']){const a=accessorData(source,p.attributes[name]),b=accessorData(asset,asset.doc.meshes[0].primitives[0].attributes[name]);ids.forEach((id,i)=>assert.deepEqual(b.values[i],a.values[id],name+' changed'))}
fs.writeFileSync(dir+'/build.json',JSON.stringify({source:selection.sourcePath,sourceSha256:sha(selection.sourcePath),output,outputSha256:sha(output),triangles:indices.length/3,vertices:ids.length,positionsNormalsUVsByteCopied:true,imagesMaterialsUnchanged:true,rigidObjectTransformOnly:true,replacedTriangles:selection.replacement.triangles},null,2)+'\n');console.log(JSON.stringify({output,triangles:indices.length/3,vertices:ids.length,bytes:fs.statSync(output).size,sourceGeometryPreserved:true}))
