import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),results=[]
async function frames(n){await c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)}
async function measure(name){
  await c.evaluate(`new Promise(resolve=>{let n=0;function tick(){if((__FOREST_STAGE2__.plants.queue.length===0&&++n>24)||n>140)resolve(true);else requestAnimationFrame(tick)}requestAnimationFrame(tick)})`)
  const r=await c.evaluate(`new Promise(resolve=>{const samples=[];let last=performance.now();function tick(now){samples.push(now-last);last=now;if(samples.length<60)requestAnimationFrame(tick);else{samples.sort((a,b)=>a-b);const gl=__ANIME__.renderer,ext=gl.getContext().getExtension('WEBGL_debug_renderer_info');resolve({meanMs:samples.reduce((a,b)=>a+b)/samples.length,medianMs:samples[30],p95Ms:samples[57],calls:__ANIME__.effect.stats.renderCalls,triangles:__ANIME__.effect.stats.renderTriangles,width:gl.domElement.width,height:gl.domElement.height,gpu:ext?gl.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',stage2GpuMB:__FOREST_STAGE2__.plants.gpuMemoryBytes()/1048576,stage2LatePrepares:__FOREST_STAGE2__.plants.latePrepares})}}requestAnimationFrame(tick)})`)
  results.push({name,...r})
}
try{
  await c.evaluate(`(()=>{const FOREST=__FOREST_FOLIAGE__.config;window.__stage2Perf={FOREST,adaptive:FOREST.performance.adaptiveResolution,dpr:__ANIME__.renderer.getPixelRatio(),render:__ANIME__.effect.render};FOREST.performance.adaptiveResolution=false;__ANIME__.effect.render=function(...args){if(__ANIME__.renderer.getPixelRatio()!==1)__ANIME__.renderer.setPixelRatio(1);return __stage2Perf.render.apply(this,args)};return true})()`)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.reset("forest");__MOSPEADA__.runtime.paused=true;__ANIME__.renderer.setPixelRatio(1);true')
  await c.evaluate("__MOSPEADA__.scene.getObjectByName('MOSPEADA_Level_01_Forest_Plano_2').visible=false;true");await measure('Plano 1 / extension hidden')
  await c.evaluate("__MOSPEADA__.scene.getObjectByName('MOSPEADA_Level_01_Forest_Plano_2').visible=true;true");await measure('Plano 1 / extension loaded')
  await c.evaluate(`(async()=>{const {stage2Checkpoint}=await import('/src/world/forest/forestStage2Config.js');__MOSPEADA__.runtime.resetAt(stage2Checkpoint());__MOSPEADA__.runtime.paused=true;__ANIME__.renderer.setPixelRatio(1);return true})()`)
  await measure('Plano 2 / checkpoint')
  if(results.some(r=>r.width!==1920||r.height!==1080))throw Error('Benchmark raster changed')
  fs.writeFileSync('artifacts/forest-stage2/performance.json',JSON.stringify({scope:'Paused identical Plano 1 viewpoint, extension hidden versus loaded; separate representative Plano 2 checkpoint. Render cost only at actual 1920x1080, adaptive resolution disabled and render DPR locked. This machine is not the target RTX 3060.',results},null,2)+'\n');console.log(JSON.stringify(results,null,2))
}finally{
  await c.evaluate(`(()=>{if(window.__stage2Perf){__ANIME__.effect.render=__stage2Perf.render;__stage2Perf.FOREST.performance.adaptiveResolution=__stage2Perf.adaptive;__ANIME__.renderer.setPixelRatio(__stage2Perf.dpr);delete window.__stage2Perf}__MOSPEADA__.scene.getObjectByName('MOSPEADA_Level_01_Forest_Plano_2').visible=true;__MOSPEADA__.reset('forest');return true})()`).catch(()=>{});c.close()
}
