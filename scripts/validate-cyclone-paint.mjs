import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/cyclone-paint',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
async function shot(name){await wait(200);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))}
try{
  const end=Date.now()+300000;let ready=false
  while(Date.now()<end){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.paused=true;d.runtime.state.idleBlend=0;d.runtime.state.lean=0;d.rig.update(d.runtime.state,d.sample,d.config);d.setCameraMode(3);const v=d.camera.position.clone();d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.clone().set(0,1.1,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(3.2,1.55,1.4)));d.runtime.orbit.update();window.__PAINT_COMPARE__=[...d.rig.surfaceMaterials].filter(([m,mat])=>mat.userData.cyclonePaintTone).map(([mesh,material])=>({mesh,material,tint:material.color.clone()}));return true})()`)
  await shot('anime-boot-tone')
  await c.evaluate('__ANIME__.state.set({mode:"PBR"});true')
  await shot('pbr-boot-tone')
  await c.evaluate('__ANIME__.state.set({mode:"ANIME"});true')
  const report=await c.evaluate(`({paintedSurfaces:__PAINT_COMPARE__.length,shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})`)
  assert.equal(report.shader,'');assert.equal(report.gl,0);assert.ok(report.paintedSurfaces>70)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
