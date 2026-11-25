import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {AnimationMixer} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
import {ScottNativeRetarget} from '../src/vehicle/ScottNativeRetarget.js'
import {parseCycloneScottActions} from '../src/vehicle/cycloneScottActions.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const sourcePath='assets/01-SCOTT/scott-gear-v3.glb',referencePath='public/models/mospeada/scott-bernard-animated-original.glb',output='assets/01-SCOTT/scott-gear-v3-animated.glb',publicOutput='public/models/mospeada/scott-gear-v3-animated.glb',directory='artifacts/scott-v3'
fs.mkdirSync(directory,{recursive:true})
const native=readGlb(sourcePath),reference=readGlb(referencePath),doc=structuredClone(native.doc)
if(!doc.skins?.length||!doc.meshes.every(m=>m.primitives.every(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined)))throw Error('V3 no contiene rig/skinning nativos')
const load=g=>new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'')
const [original,v3]=await Promise.all([load(reference),load(native)]),source=clone(original.scene),target=clone(v3.scene),retarget=new ScottNativeRetarget(source,target,original.scene),mixer=new AnimationMixer(source),chunks=[native.bin]
let length=native.bin.length
function attribute(values,type){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const data=new Float32Array(values),buffer=Buffer.from(data.buffer),view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:buffer.length});chunks.push(buffer);length+=buffer.length;const index=doc.accessors.length,dim=type==='SCALAR'?1:type==='VEC3'?3:4;doc.accessors.push({bufferView:view,componentType:5126,count:values.length/dim,type,...(type==='SCALAR'?{min:[Math.min(...values)],max:[Math.max(...values)]}:{})});return index}
// Preserve the native clips under explicit names alongside the game library.
doc.animations.forEach(a=>{a.name='Meshy_'+a.name})
const authored=parseCycloneScottActions(JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))),clips=[...original.animations,...authored]
for(const clip of clips){
 const action=mixer.clipAction(clip).reset().play();action.paused=true
 const times=[...new Set([0,clip.duration,...clip.tracks.flatMap(t=>Array.from(t.times))])].sort((a,b)=>a-b),samples=new Map(retarget.records.map(r=>[r.name,{rotation:[],translation:[]}]))
 for(const time of times){action.time=time;mixer.update(0);retarget.apply();for(const r of retarget.records){const sample=samples.get(r.name),q=r.b.quaternion.toArray(),last=sample.rotation.slice(-4);if(last.length&&q.reduce((n,v,i)=>n+v*last[i],0)<0)q.forEach((v,i)=>q[i]=-v);sample.rotation.push(...q);if(r.name==='Hips')sample.translation.push(...r.b.position.toArray())}}
 const animation={name:clip.name,samplers:[],channels:[]},input=attribute(times,'SCALAR')
 for(const r of retarget.records){const node=doc.nodes.findIndex(n=>n.name.replace(/^mixamorig[:_]?/,'')===r.name),sample=samples.get(r.name);for(const [path,values,type]of [['rotation',sample.rotation,'VEC4'],...(r.name==='Hips'?[['translation',sample.translation,'VEC3']]:[])]){const sampler=animation.samplers.length;animation.samplers.push({input,output:attribute(values,type),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node,path}})}}
 doc.animations.push(animation);mixer.stopAllAction()
}
doc.buffers[0].byteLength=length
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
doc.extras={...doc.extras,scottV3:{source:sourcePath,sourceSha256:sha(native.bytes),strategy:'native-rig-bind-space-retarget',nativeGeometryAndSkinning:true}}
writeGlb(output,doc,Buffer.concat(chunks));fs.copyFileSync(output,publicOutput)
const result=readGlb(output)
for(const key of ['nodes','skins','meshes','materials','textures','images','samplers'])if(JSON.stringify(native.doc[key])!==JSON.stringify(result.doc[key]))throw Error('Alteración de V3: '+key)
if(!result.bin.subarray(0,native.bin.length).equals(native.bin))throw Error('Cambió el buffer nativo')
let weights=0,maxWeightError=0
for(const m of native.doc.meshes)for(const p of m.primitives){const values=accessorData(native,p.attributes.WEIGHTS_0).values;weights+=values.length;for(const w of values)maxWeightError=Math.max(maxWeightError,Math.abs(w.reduce((a,b)=>a+b,0)-1))}
const report={source:sourcePath,output,publicOutput,sourceSha256:sha(native.bytes),outputSha256:sha(result.bytes),nativeBones:doc.skins[0].joints.length,mappedBones:retarget.records.length,weightedVertices:weights,maxWeightError,triangles:doc.meshes.reduce((n,m)=>n+m.primitives.reduce((v,p)=>v+doc.accessors[p.indices].count/3,0),0),preserved:['geometry','hierarchy','bind pose','inverse bind matrices','skin weights','materials','textures','UVs','native clips'],animations:doc.animations.map(a=>a.name)}
fs.writeFileSync(directory+'/build.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
