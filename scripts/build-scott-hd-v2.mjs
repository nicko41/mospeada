import fs from 'node:fs'
import crypto from 'node:crypto'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'

// V2 deliberately never reads the V1 output. No remeshing, welding, arm
// reconstruction, distance-based binding or mixed skin weights occur here.
const dir='artifacts/scott-hd-hybrid-v2';fs.mkdirSync(dir,{recursive:true})
const originalPath='public/models/mospeada/scott-bernard-animated-original.glb',donorPath='assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'
const original=readGlb(originalPath),donor=readGlb(donorPath),doc=structuredClone(original.doc),chunks=[original.bin];let length=original.bin.length
const selection=JSON.parse(fs.readFileSync('assets/01-SCOTT/scott-hd-v2-head-selection.json'))
if(selection.donorSha256!==crypto.createHash('sha256').update(donor.bytes).digest('hex'))throw Error('La selección HD no corresponde al donante original')
const headFaces=new Set(selection.triangles)
function append(bytes){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const off=length;chunks.push(bytes);length+=bytes.length;return off}
function view(bytes,target){const i=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:append(bytes),byteLength:bytes.length,...(target?{target}:{})});return i}
function accessor(values,type,componentType,target){const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],Typed={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[componentType],data=new Typed(values),count=data.length/dim,min=Array(dim).fill(Infinity),max=Array(dim).fill(-Infinity);for(let i=0;i<count;i++)for(let k=0;k<dim;k++){min[k]=Math.min(min[k],data[i*dim+k]);max[k]=Math.max(max[k],data[i*dim+k])}const i=doc.accessors.length;doc.accessors.push({bufferView:view(Buffer.from(data.buffer),target),componentType,count,type,...(type==='VEC3'?{min,max}:{})});return i}
const primitive=donor.doc.meshes[0].primitives[0],p=accessorData(donor,primitive.attributes.POSITION).values,n=accessorData(donor,primitive.attributes.NORMAL).values,uv=accessorData(donor,primitive.attributes.TEXCOORD_0).values,indices=accessorData(donor,primitive.indices).values.flat()
// Isolate the front breastplate panel, stopping inside its sculpted rim.
// Original collar/side armor stays intact beneath/around this rigid overlay.
const outline=[[-.13,-.02],[.13,-.02],[.26,-.20],[.16,-.39],[-.16,-.39],[-.26,-.20]]
function insidePolygon(x,y){let inside=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){const a=outline[i],b=outline[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
const parts=[
 {name:'HD2_HeadHelmet',joint:5,scale:[.48,.48,.48],offset:[.0039413,1.545-.49*.48,-.005-.04*.48]},
 {name:'HD2_ChestPlate',joint:3,scale:[.40,.40,.34],offset:[.0039413,1.32,.025],select:q=>q[2]>.20&&insidePolygon(q[0],q[1])},
]
// Preserve donor images/materials byte-for-byte, independently of its geometry.
const imageOffset=doc.images.length,textureOffset=doc.textures.length,materialOffset=doc.materials.length,samplerOffset=(doc.samplers||=[]).length
for(const image of donor.doc.images){const v=donor.doc.bufferViews[image.bufferView];doc.images.push({...image,bufferView:view(donor.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))})}
doc.samplers.push(...structuredClone(donor.doc.samplers||[]));doc.textures.push(...donor.doc.textures.map(t=>({...t,source:t.source+imageOffset,...(t.sampler!==undefined?{sampler:t.sampler+samplerOffset}:{})})))
function remapTextures(v){if(!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){if(key.endsWith('Texture')&&value?.index!==undefined)value.index+=textureOffset;else remapTextures(value)}}
for(const source of donor.doc.materials){const m=structuredClone(source);remapTextures(m);m.name='Scott HD V2 / original donor';doc.materials.push(m)}
const baseNode=doc.nodes.findIndex(n=>n.mesh===0&&n.skin===0),parent=doc.nodes.findIndex(n=>n.children?.includes(baseNode)),reportParts=[]
for(const part of parts){
 const lookup=new Map(),sourceIds=[],outIndices=[],positions=[],normals=[],texcoords=[],joints=[],weights=[]
 let selected=[]
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),center=ids.reduce((a,id)=>a.map((v,k)=>v+p[id][k]/3),[0,0,0]);if(part.name==='HD2_HeadHelmet'?headFaces.has(i/3):part.select(center))selected.push(ids)}
 if(part.name==='HD2_HeadHelmet'){
  // Connectivity is used only to reject isolated collar scraps at the cut.
  // Position duplicates are linked for analysis, never welded in the output.
  const parent=new Map(),weldKeys=new Map(),find=id=>{let r=id;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,r);id=next}return r},join=(a,b)=>parent.set(find(a),find(b))
  for(const ids of selected)for(const id of ids)if(!parent.has(id)){parent.set(id,id);const key=p[id].map(v=>Math.round(v*1e5)).join(',');if(weldKeys.has(key))join(id,weldKeys.get(key));else weldKeys.set(key,id)}
  for(const ids of selected){join(ids[0],ids[1]);join(ids[1],ids[2])}
  const components=new Map();for(const ids of selected){const key=find(ids[0]);const c=components.get(key)||{maxY:-Infinity,maxZ:-Infinity};for(const id of ids){c.maxY=Math.max(c.maxY,p[id][1]);c.maxZ=Math.max(c.maxZ,p[id][2])}components.set(key,c)}
  selected=selected.filter(ids=>{const c=components.get(find(ids[0]));return c.maxY>.40||c.maxZ>.30})
 }
 for(const ids of selected){
  for(const id of ids){if(!lookup.has(id)){
   lookup.set(id,lookup.size);sourceIds.push(id);positions.push(...p[id].map((v,k)=>v*part.scale[k]+part.offset[k]))
   const normal=n[id].map((v,k)=>v/part.scale[k]),norm=Math.hypot(...normal);normals.push(...normal.map(v=>v/norm));texcoords.push(...uv[id]);joints.push(part.joint,0,0,0);weights.push(1,0,0,0)
  }outIndices.push(lookup.get(id))}
 }
 const attributes={POSITION:accessor(positions,'VEC3',5126,34962),NORMAL:accessor(normals,'VEC3',5126,34962),TEXCOORD_0:accessor(texcoords,'VEC2',5126,34962),JOINTS_0:accessor(joints,'VEC4',5121,34962),WEIGHTS_0:accessor(weights,'VEC4',5126,34962)}
 const mesh=doc.meshes.length;doc.meshes.push({name:part.name,primitives:[{attributes,indices:accessor(outIndices,'SCALAR',sourceIds.length>65535?5125:5123,34963),material:materialOffset,mode:4}]})
 doc.nodes[parent].children.push(doc.nodes.length);doc.nodes.push({name:part.name,mesh,skin:0})
 fs.writeFileSync(`${dir}/${part.name}-source-vertices.bin`,Buffer.from(new Uint32Array(sourceIds).buffer))
 reportParts.push({name:part.name,joint:part.joint,jointName:doc.nodes[doc.skins[0].joints[part.joint]].name,scale:part.scale,offset:part.offset,vertices:sourceIds.length,triangles:outIndices.length/3})
}
// Remove only the old head. Original chest/neck remain as hidden support;
// every arm, hand, pelvis, leg and foot triangle is retained.
const base=doc.meshes[0].primitives[0],baseP=accessorData(original,base.attributes.POSITION).values,baseJ=accessorData(original,base.attributes.JOINTS_0).values,baseW=accessorData(original,base.attributes.WEIGHTS_0).values,oldIndices=accessorData(original,base.indices).values.flat(),kept=[],removed=[]
for(let i=0;i<oldIndices.length;i+=3){const ids=oldIndices.slice(i,i+3),center=ids.reduce((a,id)=>a.map((v,k)=>v+baseP[id][k]/3),[0,0,0]),onlyHead=ids.every(id=>baseJ[id].reduce((s,j,k)=>s+([5,6,7].includes(j)?baseW[id][k]:0),0)>.5);if(center[1]>1.39&&onlyHead)removed.push(...ids);else kept.push(...ids)}
base.indices=accessor(kept,'SCALAR',5123,34963)
doc.buffers=[{byteLength:length}];doc.asset.generator='MOSPEADA controlled Scott HD V2 / original rig and animation binary retained'
doc.extras={...doc.extras,scottHybrid:{version:2,parts:reportParts.map(p=>p.name),originalVertexStreamsPreserved:true,rigidOwners:['Head','Spine2'],noArmTransplant:true}}
const output='public/models/mospeada/scott-bernard-hd-hybrid-v2.glb';writeGlb(output,doc,Buffer.concat(chunks))
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const report={output,bytes:fs.statSync(output).size,triangles:kept.length/3+reportParts.reduce((s,p)=>s+p.triangles,0),originalRetainedTriangles:kept.length/3,originalRemovedHeadTriangles:removed.length/3,parts:reportParts,sourceSha256:{receiver:sha(originalPath),donor:sha(donorPath)},skeletonJoints:24,originalAnimations:doc.animations.length,noProximityTransfer:true,noRemeshing:true,noHelmetRepair:true}
fs.writeFileSync(dir+'/build-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
