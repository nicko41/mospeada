import fs from 'node:fs'
import {ridingFixture,measureRiding,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {scottV2RidingConfig as config} from '../src/vehicle/scottV2RidingConfig.js'
const dir='artifacts/scott-v2-riding/seat-forward-adjustment';fs.mkdirSync(dir,{recursive:true});const report={},current=config.seated.rearShift
try{
 for(const[key,rearShift]of[['approved-base',.24],['adjusted',current]]){
  config.seated.rearShift=rearShift;const f=await ridingFixture({ridingVariant:'air-squat-seated'});Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);report[key]=measureRiding(f);writeRidingScene(f,`${dir}/${key}.glb`)
  console.log(key,JSON.stringify({hips:report[key].hips,fit:report[key].fit}))
 }
}finally{config.seated.rearShift=current}
fs.writeFileSync(dir+'/measurements.json',JSON.stringify(report,null,2)+'\n')
