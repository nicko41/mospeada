import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
try{
  for(let i=0;i<600;i++){if(await c.evaluate('!!window.__ANIME__?.state.snapshot().nightReady'))break;await wait(250)}
  await c.evaluate(`(async()=>{const {FOREST}=await import('/src/world/forest/forestConfig.js');window.__profileAdaptive=FOREST.performance.adaptiveResolution;FOREST.performance.adaptiveResolution=false;__MOSPEADA__.reset('forest');__MOSPEADA__.runtime.paused=true;__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);return true})()`)
  for(const [name,alpha,ground,forest]of [['full',true,true,true],['without-alpha',false,true,true],['without-ground',true,false,true],['without-forest',false,false,false],['full-repeat',true,true,true]]){
    await c.evaluate(`(()=>{const s=__MOSPEADA__.scene;s.getObjectByName('MOSPEADA_Level_01_Forest').visible=${forest};s.getObjectByName('Forest_crashed_Alpha_Fighter').visible=${alpha};s.getObjectByName('Forest_organic_ground').visible=${ground};return true})()`)
    await wait(1000)
    const measure=await c.evaluate(`new Promise(resolve=>{let last=performance.now();const times=[];function tick(t){times.push(t-last);last=t;if(times.length<75)requestAnimationFrame(tick);else{times.splice(0,5);times.sort((a,b)=>a-b);resolve({medianMs:times[35],p95Ms:times[66],drawCalls:__ANIME__.effect.stats.renderCalls,raster:[__ANIME__.renderer.domElement.width,__ANIME__.renderer.domElement.height]})}}requestAnimationFrame(tick)})`)
    results.push({name,...measure});console.log(results.at(-1))
  }
  fs.writeFileSync('artifacts/forest-alpha/component-profile.json',JSON.stringify(results,null,2)+'\n')
}finally{await c.evaluate(`(async()=>{const{FOREST}=await import('/src/world/forest/forestConfig.js');FOREST.performance.adaptiveResolution=window.__profileAdaptive;for(const name of ['MOSPEADA_Level_01_Forest','Forest_crashed_Alpha_Fighter','Forest_organic_ground'])__MOSPEADA__.scene.getObjectByName(name).visible=true;return true})()`).catch(()=>{});c.close()}
