import fs from 'node:fs'
import crypto from 'node:crypto'
import {MeshoptSimplifier} from 'three/examples/jsm/libs/meshopt_simplifier.module.js'
const source='assets/invid/scout/invid-scout.glb',output='public/models/mospeada/invid-scout.glb',bytes=fs.readFileSync(source),jsonLength=bytes.readUInt32LE(12),document=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binary=bytes.subarray(28+jsonLength),original=structuredClone(document)
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sizes={5126:4,5125:4,5123:2,5121:1}
function read(id){const a=original.accessors[id],v=original.bufferViews[a.bufferView],n=components[a.type],size=sizes[a.componentType],out=new (a.componentType===5126?Float32Array:Uint32Array)(a.count*n),view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){const p=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*n)+j*size;out[i*n+j]=a.componentType===5126?view.getFloat32(p,true):a.componentType===5125?view.getUint32(p,true):a.componentType===5123?view.getUint16(p,true):view.getUint8(p)}return out}
await MeshoptSimplifier.ready
let length=0;const chunks=[],views=[],accessors=[],parts=[],lods=[]
function addView(input,target){const data=Buffer.from(input.buffer||input,input.byteOffset||0,input.byteLength),padded=Buffer.alloc(Math.ceil(data.length/4)*4);data.copy(padded);const id=views.length;views.push({buffer:0,byteOffset:length,byteLength:data.length,...target&&{target}});chunks.push(padded);length+=padded.length;return id}
if(original.meshes.length!==1||original.meshes[0].primitives.length!==1||original.nodes.length!==1)throw Error('Inspect a changed Scout hierarchy before preparing its LODs')
const primitive=original.meshes[0].primitives[0],sourceAttributes=Object.fromEntries(Object.entries(primitive.attributes).map(([name,id])=>[name,read(id)])),sourceIndices=read(primitive.indices)
function buildLOD(input,indices,target,tolerance){
 const pos=input.POSITION,normal=input.NORMAL,uv=input.TEXCOORD_0,attributes=new Float32Array(pos.length/3*5)
 for(let i=0;i<pos.length/3;i++){attributes.set(normal.subarray(i*3,i*3+3),i*5);attributes.set(uv.subarray(i*2,i*2+2),i*5+3)}
 const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attributes,5,[.35,.35,.35,1,1],null,target*3,tolerance)
 const [remap,count]=MeshoptSimplifier.compactMesh(simplified),out={},compact={}
 for(const [name,id]of Object.entries(primitive.attributes)){const a=original.accessors[id],values=input[name],n=components[a.type],data=new Float32Array(count*n);for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)data.set(values.subarray(i*n,i*n+n),remap[i]*n);compact[name]=data;out[name]=accessors.length;accessors.push({...a,componentType:5126,bufferView:addView(data,34962),byteOffset:0,count})}
 const index=accessors.length;accessors.push({bufferView:addView(simplified,34963),componentType:5125,count:simplified.length,type:'SCALAR'})
 return {primitive:{...primitive,attributes:out,indices:index},attributes:compact,indices:simplified,error,vertices:count}
}
const near=buildLOD(sourceAttributes,sourceIndices,80000,.004),middle=buildLOD(near.attributes,near.indices,20000,.004),far=buildLOD(near.attributes,near.indices,6000,.010)
document.meshes=[near,middle,far].map((level,i)=>({name:'Scout_LOD'+i,primitives:[level.primitive]}))
document.nodes=[near,middle,far].map((_,i)=>({...original.nodes[0],mesh:i,name:'Scout_LOD'+i}))
document.scenes[document.scene||0].nodes=[0,1,2]
parts.push({sourceTriangles:sourceIndices.length/3,runtimeTriangles:near.indices.length/3,vertices:near.vertices,relativePositionError:near.error})
for(const [i,level]of [near,middle,far].entries())lods.push({level:i,triangles:level.indices.length/3,vertices:level.vertices,relativePositionError:i?near.error+level.error:near.error})
for(const [i,image]of document.images.entries()){const v=original.bufferViews[original.images[i].bufferView];image.bufferView=addView(binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))}
document.asset={...document.asset,generator:'MOSPEADA Scout runtime copy / meshoptimizer',extras:{sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')}}
document.accessors=accessors;document.bufferViews=views;document.buffers=[{byteLength:length}]
const json=Buffer.from(JSON.stringify(document)),jsonChunk=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonChunk);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+bin.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
fs.mkdirSync('public/models/mospeada',{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jsonChunk,binHeader,bin]));const manifest={source,output,sourceSha256:document.asset.extras.sourceSha256,runtimeSha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),sourceBytes:bytes.length,runtimeBytes:fs.statSync(output).size,parts,lods,materialsUnchanged:JSON.stringify(original.materials)===JSON.stringify(document.materials),embeddedImagesPreserved:document.images.length,sourceBounds:{min:original.accessors[original.meshes[0].primitives[0].attributes.POSITION].min,max:original.accessors[original.meshes[0].primitives[0].attributes.POSITION].max},animations:document.animations?.length||0,skins:document.skins?.length||0}
fs.writeFileSync('public/models/mospeada/invid-scout-manifest.json',JSON.stringify(manifest,null,2)+'\n');fs.mkdirSync('artifacts/invid-scout',{recursive:true});fs.writeFileSync('artifacts/invid-scout/preparation.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2))
