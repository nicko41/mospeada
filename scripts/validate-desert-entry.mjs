import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),ev=code=>c.evaluate(code),dir='artifacts/desert-entry',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=180){for(let i=0;i<seconds*4;i++){if(await ev(code).catch(()=>false))return;await wait(250)}throw Error('Timed out: '+code)}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1897,height:902,deviceScaleFactor:1,mobile:false})
 await until('!!window.__MOSPEADA__?.runtime.scottInstance&&!!window.__FOREST_STAGE4__&&!document.querySelector("#entry-preloader")')
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});r.resetAt(w.startAt(900));r.paused=true;return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,p=__DESERT_SCOUTS__.opening,w=__FOREST_STAGE4__.world;p.update(.016,__DESERT_SCOUTS__.player,d.camera,w,{allowAttack:false});for(const s of p.scouts)for(let i=0;i<16;i++)s.receiveHit(1);r.paused=false;return true})()`)
 await until('!!__DESERT_SCOUTS__.climax&&__DESERT_SCOUTS__.sequence.revealed&&__FOREST_STAGE4__.world.climaxPlain?.ready')
 await ev(`(async()=>{const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world,{createBikeState}=await import('/src/vehicle/bikePhysics.js');r.paused=true;for(let i=0;i<40;i++)w.updateClimax(2320,2375);Object.assign(r.state,createBikeState(w.startAt(2320),d.rig.metrics,d.sample));r.randEscape.resumeClimax(r.state,w);r.randEscape.protected=true;r.combatVFX?.clear();d.setCameraMode(0);r.cameraController.reset(r.state);return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))')
 await ev(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world,e=__ANIME__.effect,g=__ANIME__.renderer.getContext(),plain=w.climaxPlain
  const q=window.__ENTRY_QA__={frames:[],programs:[],render:e.render,createProgram:g.createProgram,update:plain.update,background:e.allowBackgroundWork,lastFrame:performance.now(),terrainMs:0,done:false};e.allowBackgroundWork=()=>false
  g.createProgram=function(...args){q.programs.push({depth:w.distance(r.state.z),at:performance.now()});return q.createProgram.apply(this,args)}
  plain.update=function(...args){const t=performance.now();const result=q.update.apply(this,args);q.terrainMs=Math.max(q.terrainMs,performance.now()-t);return result}
  e.render=function(...args){const t=performance.now(),depth=w.distance(r.state.z);const result=q.render.apply(this,args);q.frames.push({depth,renderMs:performance.now()-t,intervalMs:t-q.lastFrame,terrainMs:q.terrainMs,haze:this.uniforms.uDistanceHaze.value});q.terrainMs=0;q.lastFrame=t;if(depth>2650){r.paused=true;r.keys={};q.done=true}return result}
  r.state.speed=58;r.state.parked=false;r.keys={KeyW:true};r.paused=false;return true
 })()`)
 await until('__ENTRY_QA__.done',45)
 const report=await ev(`(()=>{const q=__ENTRY_QA__,entry=q.frames.filter(f=>f.depth>=2380&&f.depth<=2460),all=q.frames.filter(f=>f.depth<=2650),max=(list,k)=>Math.max(...list.map(f=>f[k])),sorted=all.map(f=>f.intervalMs).sort((a,b)=>a-b);return{frames:all.length,start:all[0].depth,end:all.at(-1).depth,entryFrames:entry.length,entryMaxRenderMs:max(entry,'renderMs'),entryMaxIntervalMs:max(entry,'intervalMs'),entryMaxTerrainMs:max(entry,'terrainMs'),p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxFrameMs:max(all,'intervalMs'),programsCreated:q.programs,entryShaderCompiles:q.programs.filter(p=>p.depth>=2380&&p.depth<=2460).length,hazeBefore:all.some(f=>f.depth<2400&&f.haze===0),hazeAfter:all.some(f=>f.depth>2400&&f.haze===1),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
 assert.ok(report.entryFrames>10);assert.equal(report.entryShaderCompiles,0,'No new WebGL programs at the fog boundary');assert.ok(report.hazeBefore&&report.hazeAfter)
 assert.ok(report.entryMaxRenderMs<1000,'No synchronous rendering stall at entry');assert.ok(report.entryMaxTerrainMs<100,'Terrain preparation stays bounded')
 assert.equal(report.gl,0);assert.equal(report.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
 fs.writeFileSync(`${dir}/after-entry.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}finally{
 await ev(`(()=>{const q=window.__ENTRY_QA__,r=window.__MOSPEADA__?.runtime;if(q){__ANIME__.effect.render=q.render;__ANIME__.effect.allowBackgroundWork=q.background;__ANIME__.renderer.getContext().createProgram=q.createProgram;__FOREST_STAGE4__.world.climaxPlain.update=q.update}if(r){r.paused=true;r.keys={}}return true})()`).catch(()=>{});c.close()
}
