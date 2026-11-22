import fs from 'node:fs'
import crypto from 'node:crypto'
import {Euler,Matrix4,Quaternion} from 'three'
import {SCOUT_JOINTS,SCOUT_MOTION} from '../src/world/forest/scoutMechanicalConfig.js'
import {readRgbaPng} from './foliage-png.mjs'
import {scoutClawRegions} from './scout-claw-regions.mjs'

// Work exclusively on the already optimized, unchanged runtime copy.
const source='public/models/mospeada/invid-scout.glb',output='public/models/mospeada/invid-scout-rigged.glb'
const bytes=fs.readFileSync(source),jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binary=bytes.subarray(28+jsonLength)
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),sourceHash=digest(bytes)
const sizes={5121:1,5123:2,5125:4,5126:4},components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}
function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=components[a.type],size=sizes[a.componentType],out=new Float64Array(a.count*n),view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);for(let i=0;i<a.count;i++)for(let c=0;c<n;c++){const p=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*n)+c*size;out[i*n+c]=a.componentType===5126?view.getFloat32(p,true):a.componentType===5125?view.getUint32(p,true):a.componentType===5123?view.getUint16(p,true):view.getUint8(p)}return out}
if(doc.meshes.length!==3||doc.skins?.length||doc.accessors[doc.meshes[0].primitives[0].indices].count/3>80000)throw Error('Expected the static three-LOD Scout runtime copy (<=80k triangles)')
const chunks=[Buffer.from(binary)],lods=[];let length=binary.length
const colorImage=doc.images[doc.textures[doc.materials[0].pbrMetallicRoughness.baseColorTexture.index].source],colorView=doc.bufferViews[colorImage.bufferView],paint=readRgbaPng(binary.subarray(colorView.byteOffset||0,(colorView.byteOffset||0)+colorView.byteLength))
function accessor(data,type,componentType,extra={}){const raw=Buffer.from(data.buffer,data.byteOffset,data.byteLength),pad=Buffer.alloc(Math.ceil(raw.length/4)*4);raw.copy(pad);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.length});chunks.push(pad);length+=pad.length;const id=doc.accessors.length;doc.accessors.push({bufferView:view,componentType,count:data.length/components[type],type,...extra});return id}

// Weld UV-seam duplicates for anatomical geodesics. Fixed Scout-specific seed
// regions distinguish forward arms from the adjacent legs and rear carapace.
function weightsFor(primitive){
 const p=read(primitive.attributes.POSITION),ix=read(primitive.indices),count=p.length/3,ids=new Uint32Array(count),map=new Map(),points=[]
 for(let i=0;i<count;i++){const key=[0,1,2].map(c=>Math.round(p[i*3+c]*100000)).join(',');if(!map.has(key)){map.set(key,points.length);points.push([p[i*3],p[i*3+1],p[i*3+2]])}ids[i]=map.get(key)}
 const edges=Array.from({length:points.length},()=>new Set())
 for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){const a=ids[ix[i+j]],b=ids[ix[i+(j+1)%3]];if(a!==b){edges[a].add(b);edges[b].add(a)}}
 const seeds=points.map(([x,y,z])=>{
  const ax=Math.abs(x)
  if(y>.51||ax>.38&&y>(x<0?.35:.47)||ax<.36&&y>.38||ax<.29&&y>.30||z>.30&&ax<.24&&y>.01||ax<.10&&y>-.45&&(z>.25||z<-.15)||z<-.30&&(y>.08||ax<.16&&y>-.45))return 0
  if(ax>.32&&y>.16&&y<.48&&z>-.19&&z<.28||ax>.48&&y>-.12&&y<.34&&z>.12)return x>0?1:2
  if(y<-.57||y<-.38&&z<.49&&ax<.56||ax>.13&&ax<(y>.13?.29:.35)&&y<.26&&y>-.40&&z>-.28&&z<.29)return x>0?3:4
  return -1
 })
 function distances(label){
  const d=new Float64Array(points.length).fill(Infinity),heap=[]
  const push=(id,value)=>{let i=heap.length;heap.push([id,value]);while(i){const parent=(i-1)>>1;if(heap[parent][1]<=value)break;heap[i]=heap[parent];i=parent}heap[i]=[id,value]}
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c}heap[i]=last}return first}
  for(let i=0;i<seeds.length;i++)if(seeds[i]===label){d[i]=0;push(i,0)}
  while(heap.length){const [a,da]=pop();if(da!==d[a])continue;for(const b of edges[a]){const va=points[a],vb=points[b];if((label===1||label===2)&&(vb[1]<-.55||vb[2]<.01&&vb[1]<-.1))continue;if(label>=3&&(vb[1]>.31||Math.abs(vb[0])>.33&&vb[1]>.1||vb[2]>.38&&vb[1]>-.52))continue;const next=da+Math.hypot(va[0]-vb[0],va[1]-vb[1],va[2]-vb[2]);if(next<d[b]){d[b]=next;push(b,next)}}}return d
 }
 const distance=SCOUT_JOINTS.map((_,i)=>distances(i)),joints=new Uint8Array(count*4),weights=new Uint8Array(count*4),counts=Array(5).fill(0);let collars=0
 const claws=scoutClawRegions({p,uv:read(primitive.attributes.TEXCOORD_0),ix,ids,points,edges,paint});let clawVertices=0,correctedClawVertices=0
 for(let i=0;i<count;i++){
  const v=ids[i],[x,y,z]=points[v];let joint=0,best=Infinity
  for(let j=0;j<5;j++)if(distance[j][v]<best){joint=j;best=distance[j][v]}
  // Detached tiny fittings have no geodesic seed; keep them with the measured
  // nearby anatomical mass rather than inventing a new articulation.
  if(!Number.isFinite(best)){joint=y>.45||Math.abs(x)<.14||z<-.3&&y>-.45?0:y<-.48?(x>0?3:4):Math.abs(x)>.39&&z>.08?(x>0?1:2):(x>0?3:4)}
  let limbWeight=joint?1:0
  if(joint&&Number.isFinite(distance[0][v])){const delta=distance[0][v]-best,t=Math.max(0,Math.min(1,delta/.045));limbWeight=.5+.5*t*t*(3-2*t)}
  else if(joint===0&&seeds[v]!==0){let limb=1;for(let j=2;j<5;j++)if(distance[j][v]<distance[limb][v])limb=j;const delta=distance[limb][v]-distance[0][v];if(delta<.045){joint=limb;const t=Math.max(0,Math.min(1,delta/.045));limbWeight=.5*(1-t*t*(3-2*t))}}
  if(claws.mask[v]){clawVertices++;if(joint!==claws.mask[v]||limbWeight<1)correctedClawVertices++;joint=claws.mask[v];limbWeight=1}
  const w=Math.round(limbWeight*255);counts[joint]++
  joints[i*4]=joint;weights[i*4]=joint?w:255
  if(joint&&w<255){joints[i*4+1]=0;weights[i*4+1]=255-w;collars++}
 }
 return {joints,weights,counts,collars,welded:points.length,clawVertices,correctedClawVertices,clawComponents:claws.handComponents}
}
for(const [level,mesh]of doc.meshes.entries()){
 const primitive=mesh.primitives[0],result=weightsFor(primitive)
 primitive.attributes.JOINTS_0=accessor(result.joints,'VEC4',5121)
 primitive.attributes.WEIGHTS_0=accessor(result.weights,'VEC4',5121,{normalized:true})
 lods.push({level,triangles:doc.accessors[primitive.indices].count/3,vertices:result.joints.length/4,jointVertices:result.counts,collarVertices:result.collars,welded:result.welded,clawVertices:result.clawVertices,correctedClawVertices:result.correctedClawVertices,clawComponents:result.clawComponents})
}
const inverse=new Float32Array(5*16);SCOUT_JOINTS.forEach((j,i)=>new Matrix4().makeTranslation(...j.pivot.map(v=>-v)).toArray(inverse,i*16))
doc.nodes=[{name:'Scout_mechanical_rig',children:[1,6,7,8]},{name:'body_root',children:[2,3,4,5]},...SCOUT_JOINTS.slice(1).map(j=>({name:j.name,translation:j.pivot})),...doc.meshes.map((_,i)=>({name:'Scout_LOD'+i,mesh:i,skin:0}))]
doc.scenes=[{name:'Scout optimized mechanical working copy',nodes:[0]}];doc.scene=0
doc.skins=[{name:'Scout_four_limbs',skeleton:1,joints:[1,2,3,4,5],inverseBindMatrices:accessor(inverse,'MAT4',5126)}]
doc.animations=[]
function animation(name,times,frames){
 const samplers=[],channels=[],input=accessor(new Float32Array(times),'SCALAR',5126,{min:[times[0]],max:[times.at(-1)]}),q=new Quaternion(),e=new Euler()
 for(let joint=0;joint<5;joint++){
  const values=new Float32Array(times.length*4)
  frames.forEach((f,i)=>{q.setFromEuler(e.fromArray([...(f[joint]||[0,0,0]),'XYZ']));q.toArray(values,i*4)})
  const sampler=samplers.length;samplers.push({input,output:accessor(values,'VEC4',5126),interpolation:'LINEAR'});channels.push({sampler,target:{node:joint+1,path:'rotation'}})
 }
 const translations=new Float32Array(times.length*3);frames.forEach((f,i)=>translations.set(f[5]||[0,0,0],i*3))
 samplers.push({input,output:accessor(translations,'VEC3',5126),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:1,path:'translation'}})
 doc.animations.push({name,samplers,channels})
}
// Flight reads differently from standing: hips trail behind the body and the
// complete arms gather forward/inward like a crab. Small opposing corrections
// keep the limbs alive without shaking the rigid launchers or opening seams.
const flight=(y=0,roll=0,grip=0)=>[[0,0,roll],[-.43-grip,-.19,-.23-grip*.3],[-.43+grip,.19,.23-grip*.3],[.72+grip*.5,0,.045],[.72-grip*.5,0,-.045],[0,y,0]]
const rest=(y=0)=>[[0,0,0],[0,0,.025],[0,0,-.025],[0,0,0],[0,0,0],[0,y,0]]
animation('Hover',[0,.7,1.4,2.1,2.8],[flight(0),flight(.010,.006,.055),flight(0),flight(-.006,-.006,-.055),flight(0)])
animation('Idle',[0,1,2],[rest(),rest(.0015),rest()])
const compressed=rest(-.015);compressed[0]=[.025,0,0];compressed[3]=[.12,0,.015];compressed[4]=[.12,0,-.015]
animation('Landing',[0,.20,.45,.54,.65,.75],[flight(),flight(),rest(),compressed,rest(-.004),rest()])
animation('Takeoff',[0,.15,.35,.65],[rest(),rest(-.008),flight(.008),flight()])
const walk=(phase)=>{const f=rest(),s=Math.sin(phase),c=Math.cos(phase);f[0]=[0,0,s*.008];f[1]=[-c*.045,0,.035];f[2]=[c*.045,0,-.035];f[3]=[c*.19,0,.015];f[4]=[-c*.19,0,-.015];f[5]=[s*.008,Math.abs(s)*.004,0];return f}
animation('Walk',[0,.175,.35,.525,.7,.875,1.05,1.225,1.4],Array.from({length:9},(_,i)=>walk(i*Math.PI/4)))
for(const side of [0,1]){const frames=[rest(),rest(),rest(),rest(),rest(),rest()],arm=side+1,sign=side?-1:1;frames[1][arm]=[.26,-sign*.08,sign*.07];frames[2][arm]=[-.64,-sign*.13,sign*.015];frames[3][arm]=[-.54,-sign*.11,sign*.025];frames[4][arm]=[-.12,0,sign*.025];frames[2][0]=[.025,sign*.012,0];animation(side?'Claw_R':'Claw_L',[0,.18,.24,.32,.56,SCOUT_MOTION.clawDuration],frames)}
doc.asset={...doc.asset,generator:'MOSPEADA / Scout-specific mechanical rig from optimized LODs',extras:{...doc.asset.extras,rigSource:source,rigSourceSha256:sourceHash}}
doc.buffers=[{byteLength:length}]
const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded)
const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+bin.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4)
fs.writeFileSync(output,Buffer.concat([header,padded,binHeader,bin]))
const manifest={source,output,sourceSha256:sourceHash,sourceUnchanged:digest(fs.readFileSync(source))===sourceHash,runtimeSha256:digest(fs.readFileSync(output)),joints:SCOUT_JOINTS,animations:doc.animations.map(a=>a.name),lods,bytes:fs.statSync(output).size,originalAttributesAndImagesPreserved:true}
fs.writeFileSync('public/models/mospeada/invid-scout-rigged-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2))
