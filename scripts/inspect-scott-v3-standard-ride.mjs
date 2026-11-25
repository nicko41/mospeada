import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3,Quaternion} from 'three'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'

const phase=process.argv[2]||'after'
if(!['before','after'].includes(phase))throw Error('Use before or after')
const directory='artifacts/scott-v3/standard-ride/'+phase
fs.mkdirSync(directory,{recursive:true})
const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),''),visual=new ScottV3Visual(f.instance,asset.scene)
f.runtime.scottData=f.authored.data
const report={}
for(const [name,speed]of [['standard-slow',3],['standard-medium',18],['standard-fast',45]]){
 Object.assign(f.s,{speed,idleBlend:0,parked:false,airborne:false,riderStand:0});f.step(120);visual.apply(f.runtime);f.rig.root.updateWorldMatrix(true,true,true);f.wrapper.updateWorldMatrix(true,true,true)
 const body=f.rig.body,bones=visual.retarget.bones,point=n=>body.worldToLocal(bones.get(n).getWorldPosition(new Vector3())),chest=new Vector3(0,0,1).applyQuaternion(bones.get('Spine2').getWorldQuaternion(new Quaternion()).multiply(visual.retarget.targetBind.get('Spine2').rotation.clone().invert()).premultiply(body.getWorldQuaternion(new Quaternion()).invert()))
 report[name]={speed,torsoPitch:Math.atan2(-chest.y,chest.z),diagnostics:structuredClone(visual.diagnostics),joints:Object.fromEntries([...bones].map(([n])=>[n,point(n).toArray()]))}
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=visual.skins;writeRidingScene(f,directory+'/'+name+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([n,r])=>[n,{speed:r.speed,torsoPitch:r.torsoPitch,feet:[r.joints.LeftFoot,r.joints.RightFoot]}])),null,2))
