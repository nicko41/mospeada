import fs from 'node:fs'
import {ridingFixture,measureRiding,writeRidingScene} from './scott-v2-riding-fixture.mjs'
const phase=process.argv[2]||'before',dir='artifacts/scott-v2-riding/'+phase;fs.mkdirSync(dir,{recursive:true});const report={}
for(const mode of ['rest','moving']){const f=await ridingFixture({fit:phase!=='before'});Object.assign(f.s,{speed:mode==='rest'?0:18,parked:mode==='rest',idleBlend:mode==='rest'?1:0,idleTime:0});f.step(60);report[mode]=measureRiding(f);writeRidingScene(f,dir+'/'+mode+'.glb');console.log(mode,JSON.stringify({hips:report[mode].hips,headForward:report[mode].headForward,chestForward:report[mode].chestForward,contacts:report[mode].diagnostics,fit:report[mode].fit}))}
fs.writeFileSync(dir+'/measurements.json',JSON.stringify(report,null,2)+'\n')
