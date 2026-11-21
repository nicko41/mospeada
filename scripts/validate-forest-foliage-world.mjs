import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-foliage-world',wait=ms=>new Promise(r=>setTimeout(r,ms))
async function ready(){for(let i=0;i<1500;i++){const state=await c.evaluate(`({ready:!!window.__FOREST_FOLIAGE_WORLD__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader'),error:window.__ANIME__?.effect.error})`);if(state.error)throw Error(state.error);if(state.ready)return;const error=c.events.find(e=>e.method==='Runtime.exceptionThrown');if(error)throw Error(error.params.exceptionDetails.exception?.description||'Runtime exception');await wait(200)}throw Error('Forest world timeout')}
async function measure(name){await wait(1800);const sample=await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function f(t){times.push(t-last);last=t;if(times.length<125)requestAnimationFrame(f);else{times.splice(0,5);times.sort((a,b)=>a-b);const w=__FOREST_FOLIAGE_WORLD__,r=__ANIME__.renderer;resolve({...w.metrics,medianMs:times[60],p95Ms:times[114],fps:1000/times[60],exact:w.manager.visibleGroups(__MOSPEADA__.camera),calls:__ANIME__.effect.stats.renderCalls,triangles:__ANIME__.effect.stats.renderTriangles,raster:[r.domElement.width,r.domElement.height],ratio:r.getPixelRatio(),programs:r.info.programs.length,gl:r.getContext().getError(),shader:__ANIME__.state.snapshot().error})}}requestAnimationFrame(f)})`);console.log(name,JSON.stringify({medianMs:sample.medianMs,p95Ms:sample.p95Ms,calls:sample.calls,visible:sample.exact.groups,near:sample.exact.crossed,far:sample.exact.billboards,gpuMB:sample.exact.gpuMB,late:sample.exact.latePrepares,raster:sample.raster}));return{name,...sample}}
try{
  await c.send('Network.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});c.events.length=0
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest&foliageDebug=1'})
  await ready()
  await c.evaluate('__FOREST_FOLIAGE__.config.performance.adaptiveResolution=false;__MOSPEADA__.scene.__r3f.root.getState().setDpr(1);__MOSPEADA__.reset("forest");__MOSPEADA__.runtime.paused=true;true')
  await wait(1500)
  const initial=await c.evaluate(`(()=>{const w=__FOREST_FOLIAGE_WORLD__;return{world:w.world.total,sectors:w.world.sectors.length,resident:w.manager.resident.size,prepared:w.manager.prepared,queue:w.manager.queue.length,initialPreparationMs:w.manager.initialPreparationMs,reference:'user-supplied gtx3060 4gb; not available for direct benchmark'}})()`)
  console.log('World ready',initial)
  const results=[]
  for(const profile of [2000,3000,4000]){await c.evaluate(`__FOREST_FOLIAGE_WORLD__.manager.profile=${profile};true`);results.push(await measure('density-'+profile))}
  await c.evaluate('__FOREST_FOLIAGE_WORLD__.manager.enabled=false;true');results.push(await measure('without-world-foliage'))
  await c.evaluate('__FOREST_FOLIAGE_WORLD__.manager.enabled=true;__FOREST_FOLIAGE_WORLD__.manager.profile=3000;true');await wait(1500)
  fs.writeFileSync(dir+'/after-1080p.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  fs.writeFileSync(dir+'/profiles-1080p.json',JSON.stringify({initial,results,errors},null,2)+'\n')
  for(const result of results){assert.equal(result.gl,0);assert.equal(result.shader,'');assert.deepEqual(result.raster,[1920,1080])}
  assert.deepEqual(errors,[])
}finally{c.close()}
