// Lossless delivery containers. Source GLBs are never written.
// No quantization, topology reorder, image conversion or animation edits.
import fs from 'node:fs'
import crypto from 'node:crypto'
import {MeshoptEncoder} from 'meshoptimizer/encoder'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {readGlb,writeGlb} from './glb-data.mjs'
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready])
fs.mkdirSync('public/delivery',{recursive:true})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const generatorSha256=hash(fs.readFileSync(new URL(import.meta.url)))
if(fs.existsSync('public/delivery/manifest.json')){
 const previous=JSON.parse(fs.readFileSync('public/delivery/manifest.json'))
 if(previous.generatorSha256===generatorSha256&&previous.files?.length===7&&previous.files.every(file=>fs.existsSync(file.output)&&hash(fs.readFileSync(file.source))===file.sourceSha256&&hash(fs.readFileSync(file.output))===file.sha256)){
  console.log('Lossless delivery assets verified; up to date.');process.exit(0)
 }
}
const manifest={version:1,generatorSha256,lossless:true,files:[]}
for(const [source,name,functional] of [
 ['scott-bernard-gear-v2-rear-refined','scott-controller-v2',true],
 ['scott-bernard-animated-original','scott-reference-v1',true],
 ['scott-gear-v3-helmet-boundary','scott-v3',false],
 ['invid-scout-rigged','invid-scout',false],
 ['rand-casual-rigged','rand-rider',false],
 ['mars-gallant','mars-gallant',false],
 ['horizon-t-desert-landmark','horizon-t',false],
]){
 const input=`public/models/mospeada/${source}.glb`,g=readGlb(input),doc=structuredClone(g.doc),accessors=new Set(),images=new Set(),views=new Set(),indices=new Set()
 for(const m of doc.meshes)for(const p of m.primitives){Object.values(p.attributes).forEach(a=>accessors.add(a));if(p.indices!==undefined){accessors.add(p.indices);indices.add(p.indices)}for(const t of p.targets||[])Object.values(t).forEach(a=>accessors.add(a));if(functional)p.material=0}
 for(const s of doc.skins||[])if(s.inverseBindMatrices!==undefined)accessors.add(s.inverseBindMatrices)
 for(const a of doc.animations||[])for(const s of a.samplers){accessors.add(s.input);accessors.add(s.output)}
 if(functional){doc.materials=[{name:'Functional data only; never rendered',doubleSided:true,extras:{cpuOnly:true}}];delete doc.textures;delete doc.images;delete doc.samplers}
 else for(let i=0;i<(doc.images||[]).length;i++)images.add(i)
 const ids=[...accessors].sort((a,b)=>a-b),mapping=new Map(ids.map((a,i)=>[a,i]))
 for(const i of ids){const a=doc.accessors[i];if(a.bufferView!==undefined)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView)}}
 for(const i of images)if(doc.images[i].bufferView!==undefined)views.add(doc.images[i].bufferView)
 const viewIds=[...views].sort((a,b)=>a-b),viewMap=new Map(viewIds.map((a,i)=>[a,i])),chunks=[],checks=[];let offset=0,fallbackOffset=0
 const append=b=>{const start=offset;chunks.push(b);offset+=b.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}return start}
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
 doc.bufferViews=viewIds.map(id=>{
  const v=g.doc.bufferViews[id],raw=g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),owner=ids.find(a=>g.doc.accessors[a].bufferView===id)
  const a=g.doc.accessors[owner],stride=a?(v.byteStride||components[a.type]*sizes[a.componentType]):0,isIndex=indices.has(owner),mode=isIndex?'INDICES':'ATTRIBUTES'
  if(a&&!a.sparse&&stride>=4&&stride%4===0&&raw.length===a.count*stride||a&&isIndex&&raw.length===a.count*stride){
   const encoded=MeshoptEncoder.encodeGltfBuffer(raw,a.count,stride,mode),decoded=new Uint8Array(raw.length)
   MeshoptDecoder.decodeGltfBuffer(decoded,a.count,stride,encoded,mode)
   if(!Buffer.from(decoded).equals(raw))throw Error(`Non-lossless encoding: ${source} view ${id}`)
   checks.push({sourceView:id,bytes:raw.length,sha256:hash(raw)})
   if(encoded.length<raw.length){const at=append(Buffer.from(encoded)),fallback=fallbackOffset;fallbackOffset+=raw.length;return{...v,buffer:1,byteOffset:fallback,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:at,byteLength:encoded.length,byteStride:stride,count:a.count,mode}}}}
  }
  return{...v,buffer:0,byteOffset:append(raw)}
 })
 doc.accessors=ids.map(id=>{const a=structuredClone(g.doc.accessors[id]);if(a.bufferView!==undefined)a.bufferView=viewMap.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=viewMap.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=viewMap.get(a.sparse.values.bufferView)}return a})
 for(const m of doc.meshes)for(const p of m.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=mapping.get(p.attributes[k]);if(p.indices!==undefined)p.indices=mapping.get(p.indices);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=mapping.get(t[k])}
 for(const s of doc.skins||[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=mapping.get(s.inverseBindMatrices)
 for(const a of doc.animations||[])for(const s of a.samplers){s.input=mapping.get(s.input);s.output=mapping.get(s.output)}
 for(const i of doc.images||[])if(i.bufferView!==undefined)i.bufferView=viewMap.get(i.bufferView)
 doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'EXT_meshopt_compression'])];doc.extensionsRequired=[...new Set([...(doc.extensionsRequired||[]),'EXT_meshopt_compression'])]
 doc.buffers=[{byteLength:offset},{byteLength:fallbackOffset,extensions:{EXT_meshopt_compression:{fallback:true}}}]
 doc.asset.extras={...doc.asset.extras,delivery:{sourceSha256:hash(g.bytes),functional,lossless:true}}
 const output=`public/delivery/${name}.glb`;writeGlb(output,doc,Buffer.concat(chunks))
 manifest.files.push({source:input,sourceSha256:hash(g.bytes),output,sha256:hash(fs.readFileSync(output)),bytes:fs.statSync(output).size,functional,verifiedViews:checks.length})
 console.log(name,manifest.files.at(-1).bytes)
}
fs.writeFileSync('public/delivery/manifest.json',JSON.stringify(manifest,null,2)+'\n')
