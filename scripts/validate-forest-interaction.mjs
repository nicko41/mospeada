import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-interaction',wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyF:'f',ShiftLeft:'Shift'}[code]})
const frames=n=>c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)
async function place(x=8,z=2,speed=0){for(const code of ['KeyW','ShiftLeft'])await key(code,false);await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.resetAt({x:${x},z:${z},yaw:Math.PI,label:'Forest'});d.setCameraMode(0);d.runtime.state.speed=${speed};return true})()`);await frames(4)}
async function snapshot(name){const r=await c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FOREST_INTERACTION__,p=d.runtime.state.pedestrian;return{name:${JSON.stringify(name)},stats:{...f.field.stats},speed:d.runtime.state.speed,rider:d.runtime.state.riderMode,boosts:d.runtime.state.boostCount,sources:f.sources.map(s=>({active:s.active,x:s.x,z:s.z,speed:s.speed,radius:s.radius,strength:s.strength})),foot:p?{x:p.x,z:p.z,moving:p.moving,run:p.runBlend}:null,gl:__ANIME__.renderer.getContext().getError(),error:__ANIME__.state.snapshot().error}})()`);results.push(r);return r}
async function shot(name){await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames(2);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));await c.evaluate('__MOSPEADA__.runtime.paused=false;true')}
async function measure(enabled){
  await c.evaluate(`__FOREST_INTERACTION__.config.enabled=${enabled};true`);await frames(15)
  return c.evaluate(`new Promise(resolve=>{const t=[];let last=performance.now();function tick(now){t.push(now-last);last=now;if(t.length<60)requestAnimationFrame(tick);else{t.sort((a,b)=>a-b);resolve({enabled:${enabled},medianMs:t[30],meanMs:t.reduce((a,b)=>a+b)/60,p95Ms:t[57],calls:__ANIME__.effect.stats.renderCalls,triangles:__ANIME__.effect.stats.renderTriangles,width:__ANIME__.renderer.domElement.width,height:__ANIME__.renderer.domElement.height,cpu:__FOREST_INTERACTION__.field.stats.cpuMs})}}requestAnimationFrame(tick)})`)
}
try{
  const oldOrigin=await c.evaluate('performance.timeOrigin');await c.send('Page.reload',{ignoreCache:false});c.events.length=0
  for(let i=0;i<900;i++){const s=await c.evaluate(`({ready:performance.timeOrigin!==${oldOrigin}&&!!window.__FOREST_INTERACTION__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader'),error:window.__ANIME__?.effect.error})`);if(s.error)throw Error(s.error);if(s.ready)break;if(i===899)throw Error('Foliage did not load');await wait(150)}
  await place(14,-7);await key('KeyF',true);await key('KeyF',false)
  for(let i=0;i<100;i++){if(await c.evaluate('__MOSPEADA__.runtime.state.riderMode==="onFoot"'))break;await frames(2)}
  const idle=await snapshot('Scott idle');assert.equal(idle.rider,'onFoot');await shot('scott-idle')
  await key('KeyW',true);await frames(28);const walk=await snapshot('Scott walk');assert.ok(walk.foot.moving);assert.equal(walk.sources[3].radius,await c.evaluate('__FOREST_INTERACTION__.config.walkRadius'));await shot('scott-walk')
  await key('ShiftLeft',true);await frames(22);const run=await snapshot('Scott run');assert.ok(run.sources[3].radius>.95&&run.sources[3].speed>walk.sources[3].speed);await shot('scott-run')
  await c.evaluate('window.__bendTrail={x:__MOSPEADA__.runtime.state.pedestrian.x+.6,z:__MOSPEADA__.runtime.state.pedestrian.z+.3};true');await frames(8);await key('KeyW',false);await key('ShiftLeft',false)
  const early=await c.evaluate('__FOREST_INTERACTION__.field.sample(__bendTrail.x,__bendTrail.z)');await frames(45);const late=await c.evaluate('__FOREST_INTERACTION__.field.sample(__bendTrail.x,__bendTrail.z)');assert.ok(Math.hypot(late.x,late.z)<.005);await snapshot('recovered trail')
  await place();await key('KeyW',true);await frames(14);const slow=await snapshot('Cyclone slow');assert.ok(slow.speed>0);await shot('cyclone-slow')
  await place(8,2,40);await key('KeyW',true);await frames(5);const fast=await snapshot('Cyclone fast');assert.ok(fast.speed>25);assert.ok(fast.stats.maxBend>slow.stats.maxBend)
  await place(8,2,12);await key('KeyW',true);await key('ShiftLeft',true);await frames(5);const boost=await snapshot('Cyclone boost');assert.equal(boost.boosts,1);await key('KeyW',false);await key('ShiftLeft',false);await shot('cyclone-boost')
  const rotation=await c.evaluate(`(()=>{__MOSPEADA__.runtime.paused=true;const f=__FOREST_INTERACTION__.field;return{version:f.texture.version,data:f.sample(f.area.x,f.area.y)}})()`)
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);const o=d.runtime.cameraController.orbit;d.camera.position.copy(o.target).add({x:4,y:2,z:-2});o.update();return true})()`);await frames(5);assert.equal(await c.evaluate('__FOREST_INTERACTION__.field.texture.version'),rotation.version);await shot('bent-camera-rotation')
  for(const r of results){assert.equal(r.gl,0);assert.equal(r.error,'');assert.ok(r.stats.activeCells<2500)}
  await place(8,-8);await frames(35);await c.evaluate(`(()=>{const a=__ANIME__,config=__FOREST_FOLIAGE__.config.performance;window.__bendBench={render:a.effect.render,dpr:a.renderer.getPixelRatio(),adaptive:config.adaptiveResolution,config};config.adaptiveResolution=false;a.effect.render=function(...args){if(a.renderer.getPixelRatio()!==.66)a.renderer.setPixelRatio(.66);return __bendBench.render.apply(this,args)};__MOSPEADA__.runtime.paused=true;return true})()`)
  const performanceResults=[await measure(true),await measure(false)];assert.equal(performanceResults[0].calls,performanceResults[1].calls)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(errors,[])
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({results,recovery:{early,late},performance:performanceResults,before:JSON.parse(fs.readFileSync(dir+'/before-performance.json')),errors},null,2)+'\n');console.log({cases:results.map(r=>({name:r.name,cells:r.stats.activeCells,bend:r.stats.maxBend,cpu:r.stats.cpuMs})),performance:performanceResults,errors})
}finally{
  for(const code of ['KeyW','ShiftLeft'])await key(code,false).catch(()=>{})
  await c.evaluate(`(()=>{if(window.__bendBench){const b=__bendBench;__ANIME__.effect.render=b.render;__ANIME__.renderer.setPixelRatio(b.dpr);b.config.adaptiveResolution=b.adaptive;delete window.__bendBench}if(window.__FOREST_INTERACTION__)__FOREST_INTERACTION__.config.enabled=true;__MOSPEADA__.setCameraMode(0);__MOSPEADA__.reset('forest');return true})()`).catch(()=>{});c.close()
}
