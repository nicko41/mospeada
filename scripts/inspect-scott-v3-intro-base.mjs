import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Quaternion,Vector3} from 'three'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'

const phase=process.argv[2]||'after',directory='artifacts/scott-v3/intro-base/'+phase
fs.mkdirSync(directory,{recursive:true})
const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),''),v=new ScottV3Visual(f.instance,asset.scene)
f.runtime.scottData=f.authored.data
const report={}
for(const [name,patch]of [['intro',{speed:0,idleBlend:1,parked:true,riderStand:0}],['stationary',{speed:0,idleBlend:1,parked:true,riderStand:0}],['riding',{speed:18,idleBlend:0,parked:false,riderStand:0}],['cyclone-jump',{speed:18,idleBlend:0,parked:false,airborne:true,riderStand:1,airTime:.6}],['cyclone-hover',{speed:18,idleBlend:0,parked:false,airborne:true,riderStand:.65,boostBlend:1,airTime:1.2}]]){
 f.runtime.opening={active:name==='intro'}
 Object.assign(f.s,{airborne:false,boostBlend:0,...patch});f.step(120);v.apply(f.runtime);f.rig.root.updateWorldMatrix(true,true);f.wrapper.updateWorldMatrix(true,true)
 const body=f.rig.body,mesh=v.skins[0].mesh,bones=v.retarget.bones,average=ids=>{const p=new Vector3();ids.forEach(id=>p.add(body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return p.divideScalar(ids.length).toArray()}
 const q=bones.get('Spine2').getWorldQuaternion(new Quaternion()).multiply(v.retarget.targetBind.get('Spine2').rotation.clone().invert()).premultiply(body.getWorldQuaternion(new Quaternion()).invert()),forward=new Vector3(0,0,1).applyQuaternion(q)
 report[name]={diagnostics:structuredClone(v.diagnostics),chestPitch:Math.atan2(-forward.y,forward.z)*180/Math.PI,palms:Object.fromEntries(['Left','Right'].map(s=>[s,average(v.shapes[s].palmIds)])),soles:Object.fromEntries(['Left','Right'].map(s=>[s,average(v.shapes[s].soleIds)])),bones:Object.fromEntries([...bones].map(([n,b])=>[n,{position:body.worldToLocal(b.getWorldPosition(new Vector3())).toArray(),quaternion:b.quaternion.toArray()}]))}
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=v.skins;writeRidingScene(f,directory+'/'+name+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([n,p])=>[n,{chestPitch:p.chestPitch,palms:p.palms,hips:p.bones.Hips.position}]))))
