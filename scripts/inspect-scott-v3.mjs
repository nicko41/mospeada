import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'
import {v3ArmorFixture} from './scott-v3-armor-fixture.mjs'

const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'')
const visual=new ScottV3Visual(f.instance,asset.scene);f.runtime.scottData=f.authored.data
const report={}
for(const [name,speed]of [['stationary',0],['moving',10]]){
 Object.assign(f.s,{speed,idleBlend:speed?0:1,parked:!speed});f.step(180);visual.apply(f.runtime);report[name]=structuredClone(visual.diagnostics)
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=visual.skins
 writeRidingScene(f,'artifacts/scott-v3/'+name+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync('artifacts/scott-v3/contacts.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
const armor=await v3ArmorFixture();armor.scott=armor.native;armor.skins=armor.visual.skins
writeRidingScene(armor,'artifacts/scott-v3/armor-inspection.glb')
