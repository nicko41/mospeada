// Offline runtime copy: the supplied high-resolution GLB is never modified.
import fs from 'node:fs'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {MeshoptSimplifier} from 'meshoptimizer/simplifier'
import {MeshoptEncoder} from 'meshoptimizer/encoder'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {readGlb,writeGlb} from './glb-data.mjs'

const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const source='assets/invid/invid_drone.glb',output='public/delivery/invid-drone.glb',g=readGlb(source),doc=structuredClone(g.doc)
if(doc.nodes.length!==1||doc.meshes.length!==1||doc.meshes[0].primitives.length!==1||doc.skins?.length||doc.animations?.length)throw Error('Inspect the changed drone hierarchy before preparing it')
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),primitive=doc.meshes[0].primitives[0]
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}
function read(id){
 const a=g.doc.accessors[id],v=g.doc.bufferViews[a.bufferView],Type=types[a.componentType],stride=components[a.type]*Type.BYTES_PER_ELEMENT
 if(a.sparse||v.byteStride&&v.byteStride!==stride)throw Error('Unexpected drone accessor layout')
 return new Type(g.bin.buffer,g.bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*components[a.type]).slice()
}
await Promise.all([MeshoptSimplifier.ready,MeshoptEncoder.ready,MeshoptDecoder.ready])
const input=Object.fromEntries(Object.entries(primitive.attributes).map(([name,id])=>[name,read(id)])),sourceIndices=Uint32Array.from(read(primitive.indices))
const chunks=[],views=[],accessors=[],lods=[];let length=0,fallbackLength=0
function append(data){const at=length,b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);chunks.push(b);length+=b.length;const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}return at}
function addView(data,stride,target){
 const raw=new Uint8Array(data.buffer,data.byteOffset,data.byteLength),count=data.byteLength/stride,mode=target===34963?'INDICES':'ATTRIBUTES'
 const encoded=MeshoptEncoder.encodeGltfBuffer(raw,count,stride,mode),decoded=new Uint8Array(raw.length)
 MeshoptDecoder.decodeGltfBuffer(decoded,count,stride,encoded,mode)
 if(!Buffer.from(decoded).equals(Buffer.from(raw)))throw Error('Non-lossless drone delivery encoding')
 const id=views.length,offset=fallbackLength;fallbackLength+=raw.length
 views.push({buffer:1,byteOffset:offset,byteLength:raw.length,target,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:append(encoded),byteLength:encoded.length,byteStride:stride,count,mode}}})
 return id
}
function buildLOD(attributes,indices,triangles,tolerance){
 const count=attributes.POSITION.length/3,weighted=new Float32Array(count*5)
 for(let i=0;i<count;i++){weighted.set(attributes.NORMAL.subarray(i*3,i*3+3),i*5);weighted.set(attributes.TEXCOORD_0.subarray(i*2,i*2+2),i*5+3)}
 const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(indices,attributes.POSITION,3,weighted,5,[.1,.1,.1,.5,.5],null,triangles*3,tolerance)
 const [remap,vertices]=MeshoptSimplifier.compactMesh(simplified),compact={},out={}
 for(const [name,id]of Object.entries(primitive.attributes)){
  const a=g.doc.accessors[id],n=components[a.type],data=new Float32Array(vertices*n)
  for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)data.set(attributes[name].subarray(i*n,i*n+n),remap[i]*n)
  compact[name]=data;out[name]=accessors.length
  const min=Array(n).fill(Infinity),max=Array(n).fill(-Infinity)
  if(name==='POSITION')for(let i=0;i<data.length;i++){min[i%n]=Math.min(min[i%n],data[i]);max[i%n]=Math.max(max[i%n],data[i])}
  accessors.push({bufferView:addView(data,n*4,34962),componentType:5126,count:vertices,type:a.type,...name==='POSITION'&&{min,max}})
 }
 const index=accessors.length;accessors.push({bufferView:addView(simplified,4,34963),componentType:5125,count:simplified.length,type:'SCALAR'})
 const level=lods.length;lods.push({level,triangles:simplified.length/3,vertices,relativeError:error})
 console.log('Drone LOD',lods.at(-1))
 return {attributes:compact,indices:simplified,primitive:{attributes:out,indices:index,material:primitive.material}}
}
const near=buildLOD(input,sourceIndices,20000,.006),middle=buildLOD(near.attributes,near.indices,5000,.012),far=buildLOD(near.attributes,near.indices,1500,.025)
doc.meshes=[near,middle,far].map((l,i)=>({name:'Drone_LOD'+i,primitives:[l.primitive]}))
doc.nodes=lods.map((l,i)=>({...g.doc.nodes[0],mesh:i,name:'Drone_LOD'+i}))
doc.scenes=[{nodes:[0,1,2]}];doc.scene=0
const images=[]
for(const [i,image]of doc.images.entries()){
 const v=g.doc.bufferViews[image.bufferView],bytes=g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),original=await sharp(bytes).metadata()
 // Keep the authored 2K colour image byte-for-byte. The two PBR data maps
 // need less resolution at gameplay distances; all eleven drones share them.
 const size=i===0?2048:i===1?512:1024,data=i===0?bytes:await sharp(bytes).resize(size,size).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer()
 image.bufferView=views.length;views.push({buffer:0,byteOffset:append(data),byteLength:data.length})
 images.push({width:size,height:size,bytes:data.length,originalWidth:original.width,originalHeight:original.height,unchanged:i===0})
}
doc.accessors=accessors;doc.bufferViews=views
doc.extensionsUsed=['EXT_meshopt_compression'];doc.extensionsRequired=['EXT_meshopt_compression']
doc.buffers=[{byteLength:length},{byteLength:fallbackLength,extensions:{EXT_meshopt_compression:{fallback:true}}}]
doc.asset={...doc.asset,generator:'MOSPEADA drone LODs / meshoptimizer',extras:{sourceSha256:hash(g.bytes)}}
fs.mkdirSync('public/delivery',{recursive:true});writeGlb(output,doc,Buffer.concat(chunks))
const manifest={source,output,sourceSha256:hash(g.bytes),runtimeSha256:hash(fs.readFileSync(output)),sourceBytes:g.bytes.length,runtimeBytes:fs.statSync(output).size,sourceTriangles:sourceIndices.length/3,lods,images,materialsUnchanged:JSON.stringify(g.doc.materials)===JSON.stringify(doc.materials),sourceBounds:{min:g.doc.accessors[primitive.attributes.POSITION].min,max:g.doc.accessors[primitive.attributes.POSITION].max}}
fs.writeFileSync('public/delivery/invid-drone-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2))
