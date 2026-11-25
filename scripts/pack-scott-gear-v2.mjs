import fs from 'node:fs'
import crypto from 'node:crypto'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
const dir='artifacts/scott-gear-v2',originalPath='public/models/mospeada/scott-bernard-animated-original.glb',donorPath='assets/01-SCOTT/scott-bernard-gear-v2.glb',original=readGlb(originalPath),donor=readGlb(donorPath),aligned=readGlb(dir+'/aligned-optimized.glb'),skin=JSON.parse(fs.readFileSync(dir+'/skin.json')),skinBytes=fs.readFileSync(dir+'/skin.bin'),doc=structuredClone(original.doc)
const chunks=[original.bin];let length=original.bin.length
function append(bytes){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const off=length;chunks.push(bytes);length+=bytes.length;return off}
function view(bytes,target){const i=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:append(bytes),byteLength:bytes.length,...(target?{target}:{})});return i}
function attribute(array,type,componentType,target){const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],min=Array(dim).fill(Infinity),max=Array(dim).fill(-Infinity);for(let i=0;i<array.length;i++) {min[i%dim]=Math.min(min[i%dim],array[i]);max[i%dim]=Math.max(max[i%dim],array[i])}const i=doc.accessors.length;doc.accessors.push({bufferView:view(Buffer.from(array.buffer,array.byteOffset,array.byteLength),target),componentType,count:array.length/dim,type,...(type==='VEC3'?{min,max}:{})});return i}
const base=doc.meshes[0].primitives[0],source=aligned.doc.meshes[0].primitives[0],legacyCount=original.doc.accessors[base.attributes.POSITION].count,newCount=skin.vertices,total=legacyCount+newCount,attributes={}
for(const [semantic,type,componentType]of [['POSITION','VEC3',5126],['NORMAL','VEC3',5126],['TEXCOORD_0','VEC2',5126],['JOINTS_0','VEC4',5121],['WEIGHTS_0','VEC4',5126]]){
 const old=accessorData(original,base.attributes[semantic]).values.flat(),Ctor=componentType===5121?Uint8Array:Float32Array,dim=type==='VEC2'?2:type==='VEC3'?3:4,data=new Ctor(total*dim);data.set(old)
 if(semantic==='JOINTS_0')data.set(skinBytes.subarray(0,newCount*4),old.length)
 else if(semantic==='WEIGHTS_0'){const b=skinBytes.subarray(skin.weightsOffset,skin.weightsOffset+newCount*16);data.set(new Float32Array(b.buffer,b.byteOffset,b.length/4),old.length)}
 else data.set(accessorData(aligned,source.attributes[semantic]).values.flat(),old.length)
 attributes[semantic]=attribute(data,type,componentType,34962)
}
const rigid=new Uint8Array(total).fill(255);rigid.set(skinBytes.subarray(skin.rigidLabelsOffset),legacyCount);attributes._RIGID_OWNER=attribute(rigid,'SCALAR',5121,34962)
const indexBytes=fs.readFileSync(dir+'/render-indices.bin'),renderIndices=new Uint32Array(indexBytes.buffer,indexBytes.byteOffset,indexBytes.length/4)
const indices=new Uint32Array(Array.from(renderIndices,i=>i+legacyCount))
const imageOffset=doc.images.length,textureOffset=doc.textures.length,materialOffset=doc.materials.length,samplerOffset=(doc.samplers||=[]).length
for(const image of donor.doc.images){const v=donor.doc.bufferViews[image.bufferView];doc.images.push({...image,bufferView:view(donor.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))})}
doc.samplers.push(...structuredClone(donor.doc.samplers||[]));doc.textures.push(...donor.doc.textures.map(t=>({...t,source:t.source+imageOffset,...(t.sampler!==undefined?{sampler:t.sampler+samplerOffset}:{})})))
function remapTextures(v){if(!v||typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(k.endsWith('Texture')&&x?.index!==undefined)x.index+=textureOffset;else remapTextures(x)}}
for(const source of donor.doc.materials){const m=structuredClone(source);remapTextures(m);doc.materials.push(m)}
doc.meshes[0].primitives=[{attributes,indices:attribute(indices,'SCALAR',5125,34963),material:materialOffset,mode:4}]
doc.buffers=[{byteLength:length}];doc.asset.generator='MOSPEADA Scott Gear V2 / original 24-bone rig and 16 animations retained'
doc.extras={...doc.extras,scottGearV2:{version:1,referenceVertices:legacyCount,renderedVertices:newCount,referenceVerticesRendered:false,referenceModel:'/models/mospeada/scott-bernard-animated-original.glb',sourceTexturesUnchanged:true}}
const output='public/models/mospeada/scott-bernard-gear-v2-animated.glb';writeGlb(output,doc,Buffer.concat(chunks));const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const report={output,bytes:fs.statSync(output).size,sourceTriangles:801630,triangles:indices.length/3,renderedVertices:newCount,referenceVertices:legacyCount,rigBones:24,animations:doc.animations.map(a=>a.name),sha256:{original:sha(originalPath),donor:sha(donorPath),output:sha(output)}}
fs.writeFileSync(dir+'/build.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
