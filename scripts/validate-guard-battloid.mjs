import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/guard-battloid',report=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.guards && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;true')
  for(const [name,progress]of[['motorcycle',0],['waiting',.22],['travel',.35],['attached-tpose',.48],['arms-down',.62],['armor',1],['reverted',0]]){
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,g=f.guards;return{progress:f.store.snapshot().progress,active:g.applied,surfaces:g.parts.length,visible:g.parts.every(p=>p.mesh.visible),endpointError:${progress>=.48?'Math.max(...g.groups.flatMap(group=>group.parts.flatMap(p=>group.bone.matrixWorld.clone().multiply(group.targetInBone).multiply(group.inversePivot).elements.map((v,i)=>Math.abs(v-p.mesh.matrixWorld.elements[i])))))':'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.equal(state.active,progress>.22);assert.equal(state.surfaces,30);assert.equal(state.visible,true);assert.ok(state.endpointError<1e-7);assert.equal(state.gl,0);assert.equal(state.shader,'');report.push({name,...state})
    if(name==='waiting')continue
    for(const [view,offset]of[['front',[.5,.2,3.6]],['side',[3.5,.4,.5]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.3,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(150)
      fs.writeFileSync(`${dir}/${name}-${view}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/visual-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
