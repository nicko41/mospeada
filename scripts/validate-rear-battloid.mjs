import fs from'node:fs'
import assert from'node:assert/strict'
import{connect}from'./browser-cdp.mjs'
const c=await connect(),dir='artifacts/rear-battloid',report=[]
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function bounded(promise,timeout=20000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser validation timed out')),timeout)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<160;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.rear && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(250)}
  assert.ok(ready)
  await bounded(c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false}))
  await c.openSettings('Clima');await bounded(c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`));await c.closeSettings()
  await bounded(c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;__FRONT_BATTLOID__.entry.elapsed=.98;true'))
  for(const [name,progress]of[['motorcycle',0],['tank-start',.22],['dip',.28],['slide',.48],['configure',.75],['battloid',1],['reverted',0]]){
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});true`))
    await bounded(c.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'))
    const snapshot=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,r=f.rear;return{name:${JSON.stringify(name)},progress:f.store.snapshot().progress,active:r.root.visible,parts:r.parts.length,legs:r.parts.filter(p=>p.record.role==='leg').map(p=>({ids:p.record.ids,visible:p.mesh.visible})),endpointError:${progress===1?'Math.max(...r.parts.filter(p=>!p.record.retract).flatMap(p=>f.effect.anchorWorld.clone().invert().multiply(p.mesh.matrixWorld).elements.map((v,i)=>Math.abs(v-p.target.elements[i]))))':'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.equal(snapshot.progress,progress);assert.equal(snapshot.active,progress>0);assert.equal(snapshot.legs.length,2);assert.ok(snapshot.legs.every(p=>p.visible));assert.ok(snapshot.endpointError<1e-7);assert.equal(snapshot.gl,0);assert.equal(snapshot.shader,'');report.push(snapshot)
    if(progress===.22)continue
    for(const [view,position]of[['side',[3.2,1.6,.3]],['rear',[1.3,1.6,-3.1]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1.25,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`));await wait(200)
      fs.writeFileSync(`${dir}/${name}-${view}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/visual-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
