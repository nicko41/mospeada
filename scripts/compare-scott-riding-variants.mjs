import fs from 'node:fs'
import crypto from 'node:crypto'
import {ridingFixture,measureRiding,writeRidingScene} from './scott-v2-riding-fixture.mjs'
const dir='artifacts/scott-v2-riding/seated-comparison';fs.mkdirSync(dir,{recursive:true});const report={}
for(const variant of['previous','air-squat-seated']){
 const f=await ridingFixture({ridingVariant:variant});Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);report[variant]=measureRiding(f);writeRidingScene(f,`${dir}/${variant}.glb`)
 console.log(variant,JSON.stringify({hips:report[variant].hips,fit:report[variant].fit,feet:report[variant].diagnostics.feet}))
}
const original=JSON.parse(fs.readFileSync('.local/checkpoints/scott-v2-before-riding-2026-11-23/manifest.json')),protectedFiles=original.files.filter(f=>f.path.startsWith('public/')||f.path.startsWith('assets/'));report.protectedAssets=protectedFiles.map(f=>{const hash=crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');if(hash!==f.sha256)throw Error('Protected asset changed: '+f.path);return{path:f.path,unchanged:true,sha256:hash}})
fs.writeFileSync(dir+'/measurements.json',JSON.stringify(report,null,2)+'\n')
