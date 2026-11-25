import fs from 'node:fs'
import {Vector3} from 'three'
import {v3ArmorFixture} from './scott-v3-armor-fixture.mjs'
import {writeRidingScene} from './scott-v2-riding-fixture.mjs'

const phase=process.argv[2]||'after'
if(!['before','after'].includes(phase))throw Error('Use before or after')
const directory='artifacts/scott-v3/caballer-knees/'+phase
fs.mkdirSync(directory,{recursive:true})
const f=await v3ArmorFixture()
f.scott=f.native;f.skins=f.visual.skins
writeRidingScene(f,directory+'/armor-inspection.glb')
const report={
 legs:f.articulation.bindings.map(b=>({side:b.side,piece:b.mesh.name,top:b.top.clone().applyMatrix4(b.mesh.matrixWorld).toArray(),bottom:b.bottom.clone().applyMatrix4(b.mesh.matrixWorld).toArray(),nativeKnee:f.visual.retarget.bones.get(b.side+'Leg').getWorldPosition(new Vector3()).toArray(),matrix:b.mesh.matrixWorld.toArray()})),
 otherAssemblies:f.articulation.records.filter(r=>!f.articulation.bindings.some(b=>b.mesh===r.mesh)).map(r=>({name:r.mesh.name,matrix:r.mesh.matrixWorld.toArray()})),
 nativeBones:[...f.visual.retarget.bones].map(([name,bone])=>({name,position:bone.position.toArray(),rotation:bone.quaternion.toArray(),scale:bone.scale.toArray()})),
 fit:f.visual.diagnostics.caballers,
}
fs.writeFileSync(directory+'/measurements.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report.legs,null,2));if(report.fit)console.log(JSON.stringify(report.fit,null,2))
