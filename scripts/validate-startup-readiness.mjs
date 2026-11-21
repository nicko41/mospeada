import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),report={}
try{
  await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__STARTUP_QA__={};window.addEventListener('game-ready',()=>{__STARTUP_QA__.readyMs=performance.now();__STARTUP_QA__.state={...__ANIME__.state.snapshot()}},{once:true})`})
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?intro=1'})
  let installed=false,ready=false
  for(let i=0;i<600;i++){
    const state=await c.evaluate(`(()=>{const a=window.__ANIME__,q=window.__STARTUP_QA__;if(a&&q&&!q.installed){const held=new Promise(()=>{});q.originalNight=a.effect.prepareNight;a.effect.prepareNight=()=>held;q.installed=true}return {installed:!!q?.installed,ready:!!q?.readyMs&&!!window.__MOSPEADA__&&!document.querySelector('#entry-preloader'),shader:a?.state.snapshot().error}})()`)
    installed ||= state.installed
    if(state.shader)throw Error(state.shader)
    if(state.ready){ready=true;break}
    await wait(200)
  }
  assert.ok(installed&&ready,'The real loader exits even with alternate-lighting preparation held indefinitely')
  report.entry=await c.evaluate(`(()=>{const q=__STARTUP_QA__,a=__ANIME__;return {readyMs:q.readyMs,stateAtEntry:q.state,current:a.state.snapshot(),phase:__FOREST_OPENING__.phase,preparation:{...a.effect.stats.preparation}}})()`)
  assert.equal(report.entry.stateAtEntry.openingReady,true);assert.equal(report.entry.stateAtEntry.nightReady,false)
  await c.evaluate('__FOREST_OPENING__.finish();true')
  await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  fs.mkdirSync('artifacts/startup-readiness',{recursive:true})
  fs.writeFileSync('artifacts/startup-readiness/entered-with-night-pending.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{FOREST_STAGE3:S,stage3PathX,stage3Yaw}=await import('/src/world/forest/forestStage3Config.js');const z=S.triggerZ+8;__FOREST_STAGE3_WORLD__.ensureAround(z);d.runtime.resetAt({x:stage3PathX(z),z,yaw:stage3Yaw(z)});d.runtime.state.speed=14;d.runtime.state.idleBlend=0;d.runtime.state.parked=false;return true})()`)
  for(let i=0;i<150;i++){if(await c.evaluate('__MOSPEADA__.runtime.stage3.encounter.phase==="active"'))break;await wait(100)}
  report.combat=await c.evaluate(`(()=>{const d=__MOSPEADA__,e=d.runtime.stage3.encounter;d.runtime.paused=true;return {phase:e.phase,time:e.time,visibleDrones:e.drones.filter(x=>x.spawned&&!x.dead).length,nightReady:__ANIME__.state.snapshot().nightReady,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.equal(report.combat.phase,'active');assert.equal(report.combat.nightReady,false);assert.equal(report.combat.gl,0);assert.equal(report.combat.shader,'')
  report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text)
  assert.deepEqual(report.errors,[])
  fs.writeFileSync('artifacts/startup-readiness/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await c.evaluate('(()=>{if(window.__STARTUP_QA__?.originalNight&&window.__ANIME__)__ANIME__.effect.prepareNight=__STARTUP_QA__.originalNight;if(window.__MOSPEADA__)__MOSPEADA__.runtime.paused=true})()').catch(()=>{});c.close()}
