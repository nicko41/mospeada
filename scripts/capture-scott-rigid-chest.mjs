import fs from 'node:fs'
import {ridingFixture,writeRidingScene,measureRiding} from './scott-v2-riding-fixture.mjs'
const dir='artifacts/scott-rigid-chest',variants=[['before','public/models/mospeada/scott-bernard-gear-v2-animated.glb'],['after','public/models/mospeada/scott-bernard-gear-v2-animated-rigid-chest.glb'],['mask',dir+'/selection-mask.glb']],report={}
for(const[key,modelPath]of variants){
 const f=await ridingFixture({modelPath});Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);report[key]=measureRiding(f);f.rig.root.visible=false;writeRidingScene(f,`${dir}/${key}-riding.glb`)
 if(key==='mask'){const rest=await ridingFixture({modelPath,fit:false});rest.rig.root.visible=false;rest.wrapper.updateMatrixWorld(true);writeRidingScene(rest,dir+'/mask-rest.glb')}
}
fs.writeFileSync(dir+'/poses.json',JSON.stringify(report,null,2)+'\n');console.log('Captured unchanged riding poses and selection inspection')
