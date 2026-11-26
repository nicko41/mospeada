import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readGlb,writeGlb,accessorData} from './glb-data.mjs'

const file='public/models/mospeada/horizon-t-desert-landmark.glb',g=readGlb(file),doc=structuredClone(g.doc),sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),replacements=new Map(),images=[]
for(const image of doc.images){
 const v=g.doc.bufferViews[image.bufferView],bytes=g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),metadata=await sharp(bytes).metadata(),jpeg=await sharp(bytes).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:84,chromaSubsampling:'4:4:4'}).toBuffer()
 replacements.set(image.bufferView,jpeg);image.mimeType='image/jpeg';images.push({before:[metadata.width,metadata.height],after:[Math.min(metadata.width,1024),Math.min(metadata.height,1024)],beforeBytes:bytes.length,afterBytes:jpeg.length})
}
const chunks=[];let length=0
for(let i=0;i<doc.bufferViews.length;i++){
 const old=g.doc.bufferViews[i],v=doc.bufferViews[i],bytes=replacements.get(i)||g.bin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength),pad=(-length)&3
 if(pad){chunks.push(Buffer.alloc(pad));length+=pad}
 v.byteOffset=length;v.byteLength=bytes.length;chunks.push(bytes);length+=bytes.length
}
doc.buffers[0].byteLength=length
writeGlb(file,doc,Buffer.concat(chunks));const result=readGlb(file)
for(let i=0;i<doc.accessors.length;i++)assert.deepEqual(accessorData(result,i).values,accessorData(g,i).values,'Geometry accessor '+i)
const report={file,beforeBytes:g.bytes.length,afterBytes:result.bytes.length,images,geometry:'all LOD vertex attributes and indices unchanged',textureGpuBytesWithMipmaps:3*1024*1024*4*4/3}
fs.writeFileSync('artifacts/horizon-t/texture-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
