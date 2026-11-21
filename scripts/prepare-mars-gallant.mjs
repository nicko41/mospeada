import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

// Offline derived asset. No source vertices move; UVs, normals, materials and
// embedded maps survive. Runtime never simplifies the weapon while playing.
const source='assets/scott-cyclone/weapons/mars-gallant.glb',output='public/models/mospeada/mars-gallant.glb'
fs.mkdirSync('artifacts/mars-gallant',{recursive:true})
const bytes=fs.readFileSync(source),jsonLength=bytes.readUInt32LE(12)
const document=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binary=bytes.subarray(28+jsonLength)
const read=id=>{
  const a=document.accessors[id],v=document.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type]
  const array=new (a.componentType===5126?Float32Array:Uint32Array)(a.count*components),data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength)
  const size={5126:4,5125:4,5123:2}[a.componentType]
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const offset=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*components)+j*size;array[i*components+j]=a.componentType===5126?data.getFloat32(offset,true):a.componentType===5125?data.getUint32(offset,true):data.getUint16(offset,true)}
  return array
}
const original=structuredClone(document),bounds=new Box3(),hierarchy=[]
function visit(id,parent=new Matrix4()){
  const n=original.nodes[id],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...n.translation||[0,0,0]),new Quaternion(...n.rotation||[0,0,0,1]),new Vector3(...n.scale||[1,1,1]));m.premultiply(parent)
  hierarchy.push({id,...n})
  for(const p of original.meshes?.[n.mesh]?.primitives||[]){const a=original.accessors[p.attributes.POSITION];bounds.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)).applyMatrix4(m))}
  for(const child of n.children||[])visit(child,m)
}
original.scenes[original.scene||0].nodes.forEach(id=>visit(id))
await MeshoptSimplifier.ready
const chunks=[],views=[],accessors=[];let length=0
function addView(buffer,target){const data=Buffer.from(buffer.buffer||buffer,buffer.byteOffset||0,buffer.byteLength);const padded=Buffer.alloc(Math.ceil(data.length/4)*4);data.copy(padded);const id=views.length;views.push({buffer:0,byteOffset:length,byteLength:data.length,...target&&{target}});chunks.push(padded);length+=padded.length;return id}
const parts=[]
for(let mi=0;mi<document.meshes.length;mi++)for(let pi=0;pi<document.meshes[mi].primitives.length;pi++){
  const p=document.meshes[mi].primitives[pi],position=read(p.attributes.POSITION),normal=read(p.attributes.NORMAL),uv=read(p.attributes.TEXCOORD_0),indices=read(p.indices)
  const attributes=new Float32Array(position.length/3*5)
  for(let i=0;i<position.length/3;i++){attributes.set(normal.subarray(i*3,i*3+3),i*5);attributes.set(uv.subarray(i*2,i*2+2),i*5+3)}
  const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(indices,position,3,attributes,5,[.35,.35,.35,1,1],null,30000*3,.003)
  const [remap,count]=MeshoptSimplifier.compactMesh(simplified)
  const newAttributes={}
  for(const [name,id]of Object.entries(p.attributes)){
    const a=original.accessors[id],input=read(id),components={VEC2:2,VEC3:3,VEC4:4}[a.type],compact=new Float32Array(count*components)
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)compact.set(input.subarray(i*components,i*components+components),remap[i]*components)
    newAttributes[name]=accessors.length
    accessors.push({...a,bufferView:addView(compact,34962),byteOffset:0,count})
  }
  const indexId=accessors.length;accessors.push({bufferView:addView(simplified,34963),componentType:5125,count:simplified.length,type:'SCALAR'})
  document.meshes[mi].primitives[pi]={...p,attributes:newAttributes,indices:indexId}
  parts.push({sourceTriangles:indices.length/3,runtimeTriangles:simplified.length/3,vertices:count,relativePositionError:error,metresErrorAt34cm:error*MeshoptSimplifier.getScale(position,3)*.34/bounds.getSize(new Vector3()).x})
}
fs.mkdirSync('.local/gallant-textures',{recursive:true})
for(const [i,image]of original.images.entries()){const v=original.bufferViews[image.bufferView];fs.writeFileSync(`.local/gallant-textures/source-${i}.jpg`,binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))}
const resize=fs.readFileSync('scripts/resize-alpha-textures.ps1','utf8'),textureDirectory=path.resolve('.local/gallant-textures').replaceAll("'","''")
execFileSync('powershell.exe',['-NoProfile','-Command',`& { ${resize} } -TextureDirectory '${textureDirectory}'`],{stdio:'inherit'})
for(const [i,image]of document.images.entries())image.bufferView=addView(fs.readFileSync(`.local/gallant-textures/runtime-${i}.jpg`))
document.asset={...document.asset,generator:'MOSPEADA Gallant preparation / meshoptimizer',extras:{sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')}}
document.accessors=accessors;document.bufferViews=views;document.buffers=[{byteLength:length}]
const json=Buffer.from(JSON.stringify(document)),jsonChunk=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonChunk)
const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8)
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+bin.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16)
binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4)
fs.mkdirSync('public/models/mospeada',{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jsonChunk,binHeader,bin]))
const manifest={source,output,sourceSha256:document.asset.extras.sourceSha256,runtimeSha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),sourceBytes:bytes.length,runtimeBytes:fs.statSync(output).size,size:bounds.getSize(new Vector3()).toArray(),min:bounds.min.toArray(),max:bounds.max.toArray(),orientation:{up:'+Y',barrel:'-X',thickness:'Z'},referenceLengthMetres:.34,scale:.34/bounds.getSize(new Vector3()).x,parts,hierarchy,materials:original.materials,texturesPreserved:original.images.length,textureMaximumSize:2048,animations:original.animations?.length||0,skins:original.skins?.length||0}
fs.writeFileSync('public/models/mospeada/mars-gallant-manifest.json',JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync('artifacts/mars-gallant/preparation.json',JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({output,parts,sourceBytes:manifest.sourceBytes,runtimeBytes:manifest.runtimeBytes,scale:manifest.scale},null,2))
