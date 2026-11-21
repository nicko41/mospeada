import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),report={}
const ev=code=>c.evaluate(code)
try{
  await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__COMBAT_PERF__={tasks:[],frames:[]};new PerformanceObserver(list=>{for(const e of list.getEntries())__COMBAT_PERF__.tasks.push({at:e.startTime,ms:e.duration})}).observe({type:'longtask',buffered:true});window.addEventListener('game-ready',()=>__COMBAT_PERF__.readyMs=performance.now(),{once:true});`})
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?intro=1'})
  let ready=false
  for(let i=0;i<900;i++){
    if(await ev('!!window.__COMBAT_PERF__?.readyMs&&!!window.__MOSPEADA__&&!!window.__ANIME__?.state.snapshot().openingReady').catch(()=>false)){ready=true;break}
    await wait(200)
  }
  assert.ok(ready,'Startup finishes with current lighting and opening views')
  report.startup=await ev(`(()=>{const a=__ANIME__,b=__COMBAT_PERF__;__FOREST_OPENING__.finish();__MOSPEADA__.runtime.paused=true;return {readyMs:b.readyMs,preparation:{...a.effect.stats.preparation},programs:a.renderer.info.programs.length,preparationObjects:a.effect.preparationObjects().length,maxTaskMs:Math.max(0,...b.tasks.map(t=>t.ms)),tasks:b.tasks.length}})()`)
  console.log('Startup:',JSON.stringify(report.startup))
  await ev(`(async()=>{const d=__MOSPEADA__,r=d.runtime,{FOREST_STAGE3:S,stage3PathX,stage3Yaw}=await import('/src/world/forest/forestStage3Config.js');const z=S.triggerZ+8;__FOREST_STAGE3_WORLD__.ensureAround(z);r.resetAt({x:stage3PathX(z),z,yaw:stage3Yaw(z),label:'Combat performance QA'});r.state.speed=14;r.state.idleBlend=0;r.state.parked=false;r.paused=true;return true})()`)
  // Let the real camera and terrain settle before measuring the light toggle.
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  report.activation=await ev(`(()=>{const d=__MOSPEADA__,a=__ANIME__,fx=d.runtime.combatVFX;const sample=visible=>{fx.root.visible=visible;let lights=0;d.scene.traverseVisible(o=>{if(o.isPointLight)lights++});const before=a.renderer.info.programs.length,start=performance.now();a.effect.render(a.state.snapshot(),1);a.renderer.getContext().finish();return {visible,lights,ms:performance.now()-start,programsAdded:a.renderer.info.programs.length-before}};return [sample(false),sample(true),sample(false),sample(true)]})()`)
  assert.ok(report.activation.every(v=>v.lights===0),'Combat flashes never introduce global point lights')
  assert.ok(report.activation.every(v=>v.programsAdded===0),'Toggling combat cannot compile world shaders')
  await ev(`(()=>{const r=__MOSPEADA__.runtime,b=__COMBAT_PERF__;b.frames=[];b.begin=performance.now();let previous=b.begin;window.__COMBAT_FRAME_SAMPLE__=true;const tick=now=>{if(!window.__COMBAT_FRAME_SAMPLE__)return;b.frames.push(now-previous);previous=now;requestAnimationFrame(tick)};requestAnimationFrame(tick);r.paused=false;return true})()`)
  let combat=false
  for(let i=0;i<150;i++){if(await ev('__MOSPEADA__.runtime.stage3.encounter.phase==="active"')){combat=true;break}await wait(100)}
  assert.ok(combat,'Scott reaches the first purple-cube wave')
  await ev(`(()=>{const r=__MOSPEADA__.runtime,e=r.stage3.encounter;e.pointer.set(0,0);e.firing=true;return true})()`)
  await wait(2000)
  report.encounter=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,e=r.stage3.encounter,b=__COMBAT_PERF__;window.__COMBAT_FRAME_SAMPLE__=false;r.paused=true;e.firing=false;const sorted=[...b.frames].sort((a,b)=>a-b);return {phase:e.phase,time:e.time,frames:sorted.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxFrameMs:Math.max(...sorted),shots:e.shots,enemyShots:e.enemyShots,maxTaskMs:Math.max(0,...b.tasks.filter(t=>t.at>b.begin).map(t=>t.ms)),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.ok(report.encounter.frames>10&&report.encounter.enemyShots>0);assert.equal(report.encounter.gl,0);assert.equal(report.encounter.shader,'')
  report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text)
  assert.deepEqual(report.errors,[])
  fs.mkdirSync('artifacts/combat-vfx-performance',{recursive:true});fs.writeFileSync('artifacts/combat-vfx-performance/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('window.__COMBAT_FRAME_SAMPLE__=false;__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.stage3.encounter.firing=false').catch(()=>{});c.close()}
