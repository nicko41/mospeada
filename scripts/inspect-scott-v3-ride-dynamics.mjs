import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3} from 'three'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'

const directory=process.env.MOSPEADA_SCOTT_V3_DYNAMICS_DIR||'artifacts/scott-v3/ride-dynamics'
fs.mkdirSync(directory,{recursive:true})
const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),''),v=new ScottV3Visual(f.instance,asset.scene)
f.runtime.scottData=f.authored.data
const report={}
for(const [name,patch]of [['slow',{speed:3}],['fast',{speed:24}],['left',{speed:18,lean:-.35,steer:.03}],['right',{speed:18,lean:.35,steer:-.03}],['cyclone-jump',{speed:18,airborne:true,riderStand:1,airTime:.6}],['cyclone-hover',{speed:18,airborne:true,riderStand:.65,boostBlend:1,airTime:1.2}]]){
 Object.assign(f.s,{idleBlend:0,parked:false,airborne:false,riderStand:0,boostBlend:0,lean:0,steer:0,...patch});f.step(120);v.apply(f.runtime);f.rig.root.updateWorldMatrix(true,true);f.wrapper.updateWorldMatrix(true,true)
 const body=f.rig.body,mesh=v.skins[0].mesh,bones=v.retarget.bones,point=n=>body.worldToLocal(bones.get(n).getWorldPosition(new Vector3())).toArray(),average=ids=>{const p=new Vector3();ids.forEach(id=>p.add(body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return p.divideScalar(ids.length).toArray()}
 report[name]={diagnostics:structuredClone(v.diagnostics),chest:point('Spine2'),hips:point('Hips'),head:point('Head'),palms:Object.fromEntries(['Left','Right'].map(s=>[s,average(v.shapes[s].palmIds)])),soles:Object.fromEntries(['Left','Right'].map(s=>[s,average(v.shapes[s].soleIds)]))}
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=v.skins;writeRidingScene(f,directory+'/'+name+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
