import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-wheel-fx',wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyA:'a',Space:' ',ShiftLeft:'Shift',KeyT:'t'}[code]})
async function frames(n){return c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)}
async function snapshot(name){const result=await c.evaluate(`(()=>{const f=__MOSPEADA_VFX__,s=__MOSPEADA__.runtime.state;return{name:${JSON.stringify(name)},speed:s.speed,boost:s.boostCount,phase:__MOSPEADA__.runtime.transformEntry.phase,armor:__MOSPEADA__.runtime.armorController.active,front:{...f.surfaceFX.configs.front},rear:{...f.surfaceFX.configs.rear},contacts:{front:{biome:f.surfaceFX.wheels.front.biome,earth:f.surfaceFX.wheels.front.earthWeight,grounded:f.surfaceFX.wheels.front.grounded},rear:{biome:f.surfaceFX.wheels.rear.biome,earth:f.surfaceFX.wheels.rear.earthWeight,grounded:f.surfaceFX.wheels.rear.grounded}},dust:{active:f.dust.system.particleNum,rate:f.dust.response.rate,emitted:f.dust.emitted},ejecta:f.ejecta.records.map(r=>({type:r.type,side:r.side,active:r.system.particleNum,rate:r.desired,slide:r.response.slide,size:r.size.a,quota:r.response.quota})),emitted:{...f.ejecta.emitted},gl:__ANIME__.renderer.getContext().getError(),error:__ANIME__.state.snapshot().error}})()`);results.push(result);return result}
async function place(kind,speed=0){for(const code of ['KeyW','KeyA','Space','ShiftLeft'])await key(code,false);await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js'),{forestPathX}=await import('/src/world/forest/forestSurface.js');d.reset('forest');d.setCameraMode(0);const start=${kind==='dirt'?`{x:forestPathX(-24),z:-24,yaw:Math.atan2(-.32,-1)}`:kind==='to-grass'?`{x:forestPathX(-8),z:-8,yaw:Math.PI/2}`:kind==='to-dirt'?`{x:forestPathX(-8)+7,z:-8,yaw:-Math.PI/2}`:`{x:8,z:2,yaw:Math.PI}`};d.runtime.state=createBikeState(start,d.rig.metrics,d.sample);d.runtime.state.speed=${speed};d.runtime.cameraController.reset(d.runtime.state);__MOSPEADA_VFX__.dust.clear();__MOSPEADA_VFX__.ejecta.clear();d.runtime.paused=false;return true})()`);await frames(5)}
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});const oldOrigin=await c.evaluate('performance.timeOrigin');await c.send('Page.reload',{ignoreCache:false});c.events.length=0
  let ready=false
  for(let i=0;i<1200;i++){const s=await c.evaluate(`({fresh:performance.timeOrigin!==${oldOrigin},ready:!!window.__MOSPEADA__&&!!window.__MOSPEADA_VFX__?.surfaceFX&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})`);if(s.fresh&&s.error)throw Error(s.error);if(s.fresh&&s.ready){ready=true;break}await wait(150)}
  if(!ready)throw Error('Forest FX did not become ready')
  for(const kind of ['dirt','grass']){
    await place(kind);await key('KeyW',true);await frames(18);const accelerating=await snapshot(kind+'-acceleration');await key('KeyW',false)
    await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await wait(150)
    fs.writeFileSync(dir+'/'+kind+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await place(kind,8);await key('KeyW',true);await key('ShiftLeft',true);await frames(5);await key('ShiftLeft',false);await key('KeyW',false);const boost=await snapshot(kind+'-boost');assert.ok(boost.boost>0)
    await place(kind,16);await key('Space',true);await key('KeyA',true);await frames(5);const skid=await snapshot(kind+'-skid');await key('Space',false);await key('KeyA',false);assert.ok(Math.max(...skid.ejecta.map(r=>r.slide))>.03)
    assert.equal(accelerating.front.humidity,.3);assert.ok(kind==='dirt'?accelerating.rear.grassWeight<.02:accelerating.rear.grassWeight>.98)
  }
  const transitions=[]
  for(const kind of ['to-grass','to-dirt']){await place(kind);await key('KeyW',true);const rows=await c.evaluate(`new Promise(resolve=>{const rows=[];function tick(){const f=__MOSPEADA_VFX__,s=__MOSPEADA__.runtime.state;rows.push({x:s.x,emission:f.surfaceFX.configs.rear.emission,grass:f.surfaceFX.configs.rear.grassWeight});if(rows.length<42)requestAnimationFrame(tick);else resolve(rows)}requestAnimationFrame(tick)})`);await key('KeyW',false);transitions.push({kind,rows});assert.ok(Math.max(...rows.map(r=>r.emission))-Math.min(...rows.map(r=>r.emission))>.3)}
  await place('grass');await frames(8);const stopped=await snapshot('stopped');await frames(20);const stoppedAgain=await snapshot('stopped-again');assert.deepEqual(stopped.emitted,stoppedAgain.emitted);assert.equal(stopped.dust.emitted,stoppedAgain.dust.emitted)
  await place('grass',12);await key('KeyT',true);await key('KeyT',false);await frames(12);const transformed=await snapshot('transforming');assert.notEqual(transformed.phase,'idle');assert.equal(transformed.dust.active,0);assert.equal(transformed.ejecta.reduce((n,r)=>n+r.active,0),0)
  for(let i=0;i<120;i++){if(await c.evaluate('__MOSPEADA__.runtime.armorController.active'))break;await frames(2)}await snapshot('armor');
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  fs.writeFileSync(dir+'/gameplay.json',JSON.stringify({results,transitions,errors},null,2)+'\n')
  console.log(results.map(r=>({name:r.name,speed:r.speed,grass:r.rear.grassWeight,dust:r.dust.active,grassParticles:r.ejecta.filter(p=>p.type==='grass').reduce((n,p)=>n+p.active,0),mudParticles:r.ejecta.filter(p=>p.type==='mud').reduce((n,p)=>n+p.active,0),boost:r.boost,phase:r.phase})))
  const dirt=results.find(r=>r.name==='dirt-acceleration'),grass=results.find(r=>r.name==='grass-acceleration');assert.ok(dirt.dust.emitted>0);assert.ok(grass.emitted.grass>0);assert.ok(grass.rear.grassWeight>.95)
  for(const r of results){assert.equal(r.gl,0);assert.equal(r.error,'');for(const e of r.ejecta)assert.ok(e.active<=e.quota)}assert.deepEqual(errors,[])
}finally{for(const code of ['KeyW','KeyA','Space','ShiftLeft'])await key(code,false).catch(()=>{});c.close()}
