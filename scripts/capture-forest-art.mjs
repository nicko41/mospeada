import fs from 'node:fs'
import { connect } from './browser-cdp.mjs'
const c=await connect(),name=process.argv[2]||'after',dir=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'artifacts/forest-art-direction'
fs.mkdirSync(dir,{recursive:true})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'})
  let ready=false
  for(let i=0;i<600;i++){
    ready=await c.evaluate(`!!window.__MOSPEADA__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader')`)
    if(ready)break
    await wait(250)
  }
  if(!ready)throw Error('Forest did not become ready')
  await c.evaluate(`(async()=>{const{FOREST}=await import('/src/world/forest/forestConfig.js');window.__artAdaptive=FOREST.performance.adaptiveResolution;FOREST.performance.adaptiveResolution=false;__MOSPEADA__.runtime.paused=true;__MOSPEADA__.scene.__r3f.root.getState().setDpr(1);return true})()`)
  await wait(400)
  fs.writeFileSync(dir+'/'+name+'-spawn.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  const images=['spawn']
  if(name!=='before'){
    for(const mode of [1,2]){
      await c.evaluate(`__MOSPEADA__.setCameraMode(${mode});true`);await wait(400)
      fs.writeFileSync(dir+'/'+name+'-side-'+mode+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));images.push('side-'+mode)
    }
    await c.evaluate('__MOSPEADA__.setCameraMode(0);true');await wait(200)
  }
  await c.evaluate('__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);true');await wait(1500)
  const result=await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function frame(t){times.push(t-last);last=t;if(times.length<125)requestAnimationFrame(frame);else{times.splice(0,5);times.sort((a,b)=>a-b);const mesh=[];__MOSPEADA__.scene.traverse(o=>{if(o.userData.forest&&o.isBatchedMesh)mesh.push({name:o.name,prepared:o.instanceCount,drawn:o._multiDrawCount})});resolve({medianMs:times[60],p95Ms:times[114],calls:__ANIME__.effect.stats.renderCalls,mesh,shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError(),raster:[__ANIME__.renderer.domElement.width,__ANIME__.renderer.domElement.height]})}}requestAnimationFrame(frame)})`)
  fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify({images,...result},null,2)+'\n')
  console.log(JSON.stringify({name,images,medianMs:result.medianMs,p95Ms:result.p95Ms,calls:result.calls,shader:result.shader,gl:result.gl,raster:result.raster},null,2))
}finally{
  await c.evaluate(`(async()=>{const{FOREST}=await import('/src/world/forest/forestConfig.js');FOREST.performance.adaptiveResolution=window.__artAdaptive;__MOSPEADA__.runtime.paused=false;return true})()`).catch(()=>{});c.close()
}
