import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/front-battloid/chest-fast',report=[]
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function bounded(promise){
  let timer
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser inspection timed out')),20000)})])}finally{clearTimeout(timer)}
}
fs.mkdirSync(dir,{recursive:true})
try{
  let ready=false
  for(let i=0;i<120;i++){
    ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")'))
    if(ready)break
    await wait(250)
  }
  assert.ok(ready)
  await bounded(c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false}))
  await bounded(c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;__FRONT_BATTLOID__.entry.elapsed=.98;true'))
  for(const [name,progress]of[['chest-moving',.1],['chest-set',.22],['covers-turning',.29],['slide',.48],['clear',.64],['turn',.75],['turned',.86],['back',1]]){
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});true`))
    await bounded(c.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'))
    const sample=await bounded(c.evaluate(`(()=>{
      const f=__FRONT_BATTLOID__,g=f.effect.motionGroups.find(g=>g.role==='tank');
      const center=g.center.clone().applyMatrix4(g.current),tip=g.tip.clone().applyMatrix4(g.current);
      const rear=g.center.clone().set(1,0,0).transformDirection(g.sourceBody);
      const hip=f.effect.hips.getWorldPosition(g.center.clone()).applyMatrix4(f.effect.bodyInverse);
      const carriers=f.effect.motionGroups.filter(g=>g.role==='carrier'),covers=f.effect.motionGroups.filter(g=>g.role==='cover');
      const coverAngles=covers.map(g=>{const local=g.parent.current.clone().invert().multiply(g.current),a=g.parts[0].mesh.quaternion.clone(),b=a.clone();local.decompose(g.center.clone(),a,g.center.clone());g.localFrom.decompose(g.center.clone(),b,g.center.clone());return a.angleTo(b)});
      return{name:${JSON.stringify(name)},progress:f.store.snapshot().progress,chest:carriers.map(g=>g.localBlend),coverAngles,stage:g.tankStage,center:center.toArray(),frontClearance:tip.sub(hip).dot(rear),shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()};
    })()`))
    assert.equal(sample.progress,progress);assert.equal(sample.shader,'');assert.equal(sample.gl,0)
    if(progress<=.64)assert.equal(sample.stage.rotation,0)
    if(progress<=.22){assert.equal(sample.stage.fold,0);assert.ok(sample.coverAngles.every(a=>a<1e-7))}
    if(progress>=.22)assert.deepEqual(sample.chest,[1,1])
    if(progress>=.64&&progress<=.86){assert.equal(sample.stage.slide,1);assert.equal(sample.stage.fit,0)}
    if(progress===.64)assert.ok(sample.frontClearance>=sample.stage.clearance-1e-7)
    report.push(sample)
    for(const [view,position]of progress===.48?[['side',[3.1,1.5,.3]],['rear',[.1,1.45,-3.1]]]:[['side',[3.1,1.5,.3]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1.2,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`))
      await wait(200)
      const result=await bounded(c.send('Page.captureScreenshot',{format:'png'}))
      fs.writeFileSync(`${dir}/${name}-${view}.png`,Buffer.from(result.data,'base64'))
    }
  }
  const center=report.find(s=>s.name==='clear').center
  for(const name of['turn','turned'])assert.ok(report.find(s=>s.name===name).center.every((v,i)=>Math.abs(v-center[i])<1e-7),'Tank center must stay fixed throughout the turn')
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}finally{
  await bounded(c.send('Browser.close')).catch(()=>{});c.close()
}
