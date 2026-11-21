import fs from 'node:fs'
import { connect } from './browser-cdp.mjs'
const c=await connect(),results=[]
try {
  for(let i=0;i<180&&!await c.evaluate('!!window.__ANIME__?.state.snapshot().nightReady');i++)await new Promise(r=>setTimeout(r,500))
  await new Promise(r=>setTimeout(r,10000))
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  await c.evaluate(`(async()=>{const {FOREST}=await import('/src/world/forest/forestConfig.js');window.__forestAdaptive=FOREST.performance.adaptiveResolution;FOREST.performance.adaptiveResolution=false;return true})()`)
  for (const enabled of [true,false]) {
    await c.evaluate(`__MOSPEADA__.scene.getObjectByName('MOSPEADA_Level_01_Forest').visible=${enabled};true`)
    results.push(await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function frame(t){times.push(t-last);last=t;if(times.length<65)requestAnimationFrame(frame);else{times.splice(0,5);times.sort((a,b)=>a-b);resolve({forest:${enabled},medianMs:times[30],p95Ms:times[57],drawCalls:__ANIME__.effect.stats.renderCalls})}}requestAnimationFrame(frame)})`))
  }
  console.log(JSON.stringify(results,null,2))
  const raster=await c.evaluate(`({pixelRatio:__ANIME__.renderer.getPixelRatio(),width:__ANIME__.renderer.domElement.width,height:__ANIME__.renderer.domElement.height})`)
  fs.writeFileSync('artifacts/forest/performance-comparison.json',JSON.stringify({raster,results},null,2)+'\n')
} finally {await c.evaluate(`(async()=>{const {FOREST}=await import('/src/world/forest/forestConfig.js');FOREST.performance.adaptiveResolution=window.__forestAdaptive;__MOSPEADA__.scene.getObjectByName('MOSPEADA_Level_01_Forest').visible=true;__MOSPEADA__.runtime.paused=false;return true})()`);c.close()}
