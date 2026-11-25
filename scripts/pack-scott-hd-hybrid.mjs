import fs from 'node:fs'
import crypto from 'node:crypto'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
const dir='artifacts/scott-hd-hybrid-v1',receiverPath='public/models/mospeada/scott-bernard-animated-original.glb',donorPath='assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'
const receiver=readGlb(receiverPath),donor=readGlb(donorPath),aligned=readGlb(dir+'/aligned-parts.glb'),ref=JSON.parse(fs.readFileSync(dir+'/receiver-reference.json')),skin=JSON.parse(fs.readFileSync(dir+'/skin-report.json')),weights=fs.readFileSync(dir+'/skin-weights.bin')
const doc=structuredClone(receiver.doc),chunks=[receiver.bin];let length=receiver.bin.length
function append(bytes){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const offset=length;chunks.push(bytes);length+=bytes.length;return offset}
function view(bytes,target){const i=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:append(bytes),byteLength:bytes.length,...(target?{target}:{})});return i}
function attribute(bytes,type,componentType,count,target,min,max){const i=doc.accessors.length;doc.accessors.push({bufferView:view(bytes,target),componentType,count,type,...(min?{min,max}:{})});return i}
const base=doc.meshes[0].primitives[0],sourceIndices=accessorData(receiver,base.indices).values.flat(),kept=[]
for(let i=0;i<sourceIndices.length;i+=3){
 const ids=sourceIndices.slice(i,i+3),center=ids.reduce((a,j)=>a.map((v,k)=>v+ref.positions[j][k]/3),[0,0,0])
 // Keep the complete original pelvis/lower body and original hands; the last
 // section of the original forearm supports the extended HD wrist shell.
 const side=center[0]>0?'Left':'Right',elbow=ref.bones.find(b=>b.name===`mixamorig${side}ForeArm`).position,wrist=ref.bones.find(b=>b.name===`mixamorig${side}Hand`).position
 const axis=wrist.map((v,k)=>v-elbow[k]),along=center.reduce((s,v,k)=>s+(v-elbow[k])*axis[k],0)/axis.reduce((s,v)=>s+v*v,0)
 if(center[1]<=1.065||(Math.abs(center[0])>.52&&along>.79))kept.push(...ids)
}
base.indices=attribute(Buffer.from(new Uint16Array(kept).buffer),'SCALAR',5123,kept.length,34963,[Math.min(...kept)],[Math.max(...kept)])
const imageOffset=doc.images.length,textureOffset=doc.textures.length,materialOffset=doc.materials.length,samplerOffset=(doc.samplers||=[]).length
for(const image of donor.doc.images){const v=donor.doc.bufferViews[image.bufferView];doc.images.push({...image,bufferView:view(donor.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))})}
doc.samplers.push(...structuredClone(donor.doc.samplers||[]))
doc.textures.push(...donor.doc.textures.map(t=>({...t,source:t.source+imageOffset,...(t.sampler!==undefined?{sampler:t.sampler+samplerOffset}:{})})))
function remapTextures(value){if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){if(k.endsWith('Texture')&&v?.index!==undefined)v.index+=textureOffset;else remapTextures(v)}}
for(const source of donor.doc.materials){const m=structuredClone(source);remapTextures(m);m.name='Scott HD V1 / '+(m.name||'original donor');doc.materials.push(m)}
const views=new Map(),accessors=new Map()
function copyAccessor(i){if(accessors.has(i))return accessors.get(i);const a=structuredClone(aligned.doc.accessors[i]),v=aligned.doc.bufferViews[a.bufferView];if(!views.has(a.bufferView)){const j=doc.bufferViews.length;doc.bufferViews.push({...v,buffer:0,byteOffset:append(aligned.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))});views.set(a.bufferView,j)}a.bufferView=views.get(a.bufferView);const j=doc.accessors.length;doc.accessors.push(a);accessors.set(i,j);return j}
const originalNode=doc.nodes.findIndex(n=>n.mesh===0&&n.skin===0),parent=doc.nodes.findIndex(n=>n.children?.includes(originalNode)),parts=[]
for(const item of skin.parts){
 const source=aligned.doc.meshes[item.mesh].primitives[item.primitive],attributes=Object.fromEntries(Object.entries(source.attributes).map(([k,i])=>[k,copyAccessor(i)]))
 attributes.JOINTS_0=attribute(weights.subarray(item.jointsOffset,item.jointsOffset+item.vertices*4),'VEC4',5121,item.vertices,34962)
 attributes.WEIGHTS_0=attribute(weights.subarray(item.weightsOffset,item.weightsOffset+item.vertices*16),'VEC4',5126,item.vertices,34962)
 const mesh=doc.meshes.length;doc.meshes.push({name:item.name,primitives:[{attributes,indices:copyAccessor(source.indices),material:materialOffset,mode:4}]})
 const node=doc.nodes.length;doc.nodes.push({name:item.name,mesh,skin:0});doc.nodes[parent].children.push(node)
 parts.push({name:item.name,vertices:item.vertices,triangles:aligned.doc.accessors[source.indices].count/3})
}
doc.buffers=[{byteLength:length}];doc.asset.generator='MOSPEADA Scott HD Hybrid V1; original rig and animation payload preserved'
doc.extras={...doc.extras,scottHybrid:{version:1,originalMesh:doc.nodes[originalNode].name,parts:parts.map(p=>p.name),receiverTriangles:kept.length/3,originalVertexStreamsPreserved:true}}
const output='public/models/mospeada/scott-bernard-hd-hybrid-v1.glb';writeGlb(output,doc,Buffer.concat(chunks))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={output,bytes:fs.statSync(output).size,triangles:parts.reduce((s,p)=>s+p.triangles,kept.length/3),originalRetainedTriangles:kept.length/3,parts,bones:doc.skins[0].joints.length,animations:doc.animations.map(a=>a.name),sha256:{receiver:sha(receiverPath),donor:sha(donorPath),hybrid:sha(output)}}
fs.writeFileSync(dir+'/build-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
