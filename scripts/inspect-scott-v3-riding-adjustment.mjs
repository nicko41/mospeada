import fs from 'node:fs'
import {Vector3,Quaternion} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'

const phase=process.argv[2]||'after',directory='artifacts/scott-v3/riding-adjustment/'+phase
if(!['before','after'].includes(phase))throw Error('Use before or after')
fs.mkdirSync(directory,{recursive:true})
const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'')
const visual=new ScottV3Visual(f.instance,asset.scene);f.runtime.scottData=f.authored.data
const report={}
for(const [mode,speed]of [['stationary',0],['moving',10]]){
 Object.assign(f.s,{speed,idleBlend:speed?0:1,parked:!speed});f.step(180);visual.apply(f.runtime)
 const body=f.rig.body,bones=visual.retarget.bones,point=name=>body.worldToLocal(bones.get(name).getWorldPosition(new Vector3())).toArray(),bodyInverse=body.getWorldQuaternion(new Quaternion()).invert()
 const chest=bones.get('Spine2').getWorldQuaternion(new Quaternion()).multiply(visual.retarget.targetBind.get('Spine2').rotation.clone().invert()).premultiply(bodyInverse),forward=new Vector3(0,0,1).applyQuaternion(chest)
 report[mode]={diagnostics:structuredClone(visual.diagnostics),pelvis:point('Hips'),joints:Object.fromEntries(['Left','Right'].map(side=>[side,Object.fromEntries(['Arm','ForeArm','Hand','UpLeg','Leg','Foot'].map(suffix=>[suffix,point(side+suffix)]))])),chestPitch:Math.atan2(-forward.y,forward.z),chestForward:forward.toArray(),chestLocals:Object.fromEntries(['Spine1','Spine2'].map(name=>[name,bones.get(name).quaternion.toArray()]))}
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=visual.skins;writeRidingScene(f,directory+'/'+mode+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
