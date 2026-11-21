import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect()
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='KeyW'?'w':'Shift'})
const frames=n=>c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)
try{
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.reset('forest');d.setCameraMode(0);d.runtime.state=createBikeState({x:8,z:2,yaw:Math.PI},d.rig.metrics,d.sample);d.runtime.state.speed=10;d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await frames(5);await key('KeyW',true);await key('ShiftLeft',true);await frames(5);await key('KeyW',false);await key('ShiftLeft',false)
  const population=await c.evaluate(`(async()=>{const {FOREST}=await import('/src/world/forest/forestConfig.js');window.__wheelPerf={adaptive:FOREST.performance.adaptiveResolution,FOREST,original:__ANIME__.effect.render,show:true,batches:[__MOSPEADA_VFX__.dust.batch,...__MOSPEADA_VFX__.ejecta.batches]};FOREST.performance.adaptiveResolution=false;__MOSPEADA__.runtime.paused=true;__ANIME__.renderer.setPixelRatio(.66);__ANIME__.effect.render=function(...args){for(const b of __wheelPerf.batches)b.visible=__wheelPerf.show&&b.geometry.instanceCount>0;return __wheelPerf.original.apply(this,args)};return{dust:__MOSPEADA_VFX__.dust.system.particleNum,ejecta:__MOSPEADA_VFX__.ejecta.records.map(r=>({type:r.type,active:r.system.particleNum})),batches:__wheelPerf.batches.length}})()`)
  const samples=[]
  for(const show of [false,true,true,false]){
    await c.evaluate(`__wheelPerf.show=${show};true`);await frames(8)
    const sample=await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function tick(now){times.push(now-last);last=now;if(times.length<80)requestAnimationFrame(tick);else{times.sort((a,b)=>a-b);const gl=__ANIME__.renderer,ext=gl.getContext().getExtension('WEBGL_debug_renderer_info');resolve({mean:times.reduce((a,b)=>a+b)/times.length,median:times[40],p95:times[76],calls:__ANIME__.effect.stats.renderCalls,triangles:__ANIME__.effect.stats.renderTriangles,width:gl.domElement.width,height:gl.domElement.height,gpu:ext?gl.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'})}}requestAnimationFrame(tick)})`)
    samples.push({contactFX:show,...sample})
  }
  const result={scope:'Frozen identical gameplay frame: contact FX render cost only; movement/simulation and pool bounds validated separately.',population,samples}
  fs.writeFileSync('artifacts/forest-wheel-fx/performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
}finally{
  await key('KeyW',false).catch(()=>{});await key('ShiftLeft',false).catch(()=>{})
  await c.evaluate(`(()=>{if(window.__wheelPerf){__ANIME__.effect.render=__wheelPerf.original;__wheelPerf.FOREST.performance.adaptiveResolution=__wheelPerf.adaptive;for(const b of __wheelPerf.batches)b.visible=b.geometry.instanceCount>0;delete window.__wheelPerf}return true})()`).catch(()=>{});c.close()
}
