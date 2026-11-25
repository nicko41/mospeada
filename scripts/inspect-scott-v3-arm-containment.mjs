import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3,Box3} from 'three'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'

const phase=process.argv[2]||'after'
if(!['before','after'].includes(phase))throw Error('Use before or after')
const directory=(process.env.MOSPEADA_SCOTT_V3_ARM_INSPECTION_DIR||'artifacts/scott-v3/arm-containment')+'/'+phase
fs.mkdirSync(directory,{recursive:true})
const f=await ridingFixture(),g=readGlb('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),''),visual=new ScottV3Visual(f.instance,asset.scene)
f.runtime.scottData=f.authored.data
const mesh=visual.skins[0].mesh,geometry=mesh.geometry,forearms={}
for(const side of ['Left','Right']){const joint=mesh.skeleton.bones.findIndex(b=>b.name.endsWith(side+'ForeArm')),ids=[];for(let i=0;i<geometry.attributes.position.count;i++){let weight=0;for(let k=0;k<4;k++)if(geometry.attributes.skinIndex.getComponent(i,k)===joint)weight+=geometry.attributes.skinWeight.getComponent(i,k);if(weight>.65)ids.push(i)}forearms[side]=ids}
const report={}
for(const [name,patch]of [['riding',{speed:18,idleBlend:0,parked:false,airborne:false,riderStand:0}],['cyclone-jump',{speed:18,idleBlend:0,parked:false,airborne:true,frontGrounded:false,rearGrounded:false,airTime:.6,riderStand:1}],['cyclone-hover',{speed:18,idleBlend:0,parked:false,airborne:true,frontGrounded:false,rearGrounded:false,airTime:1.2,riderStand:.65,boostBlend:1}]]){
 Object.assign(f.s,patch);f.step(120);visual.apply(f.runtime);f.rig.root.updateWorldMatrix(true,true,true);f.wrapper.updateWorldMatrix(true,true,true)
 const body=f.rig.body,bones=visual.retarget.bones,point=n=>body.worldToLocal(bones.get(n).getWorldPosition(new Vector3())),average=ids=>{const p=new Vector3();ids.forEach(id=>p.add(body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return p.divideScalar(ids.length).toArray()}
 report[name]={diagnostics:structuredClone(visual.diagnostics),palms:Object.fromEntries(['Left','Right'].map(s=>[s,average(visual.shapes[s].palmIds)])),forearms:Object.fromEntries(['Left','Right'].map(s=>{const box=new Box3();forearms[s].forEach(id=>box.expandByPoint(body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return[s,{center:average(forearms[s]),min:box.min.toArray(),max:box.max.toArray()}]})),joints:Object.fromEntries([...bones].map(([n])=>[n,point(n).toArray()])),protectedBones:Object.fromEntries([...bones].filter(([n])=>!/^(Left|Right)(Arm|ForeArm|Hand)/.test(n)).map(([n,b])=>[n,b.matrixWorld.toArray()]))}
 const original=f.scott,skins=f.skins;f.scott={g,asset};f.skins=visual.skins;writeRidingScene(f,directory+'/'+name+'-inspection.glb');f.scott=original;f.skins=skins
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([name,r])=>[name,{palms:r.palms,forearms:r.forearms}])),null,2))
