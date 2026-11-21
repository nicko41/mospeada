import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {connect} from './browser-cdp.mjs'
import {createForestTerrain} from '../src/world/forest/forestTerrainGeometry.js'
import {forestLayout} from '../src/world/forest/forestLayout.js'
const dir='artifacts/forest-stage2',before=JSON.parse(fs.readFileSync(dir+'/before.json')),hash=v=>crypto.createHash('sha256').update(v).digest('hex'),terrain=createForestTerrain()
assert.equal(hash(Buffer.from(terrain.attributes.position.array.buffer)),before.positions);terrain.dispose();assert.equal(hash(JSON.stringify(forestLayout)),before.layout)
for(const [file,h]of Object.entries(before.files))assert.equal(hash(fs.readFileSync(file)),h,file)
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyA:'a',KeyD:'d',ShiftLeft:'Shift',KeyT:'t'}[code]})
async function frames(n){await c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)}
async function snapshot(name){const r=await c.evaluate(`(()=>{const d=__MOSPEADA__,s=d.runtime.state,p=__FOREST_STAGE2__;return{name:${JSON.stringify(name)},state:{x:s.x,z:s.z,y:s.height,speed:s.speed,air:s.airborne,vy:s.verticalVelocity,pitch:s.pitch,front:s.frontGrounded,rear:s.rearGrounded,airBoostCount:s.airBoostCount,boostMode:s.boostMode,boostTime:s.boostTime},recoveries:d.runtime.levelProgress.recoveries,phase:d.runtime.transformEntry.phase,armor:d.runtime.armorController.active,fx:{boost:__MOSPEADA_VFX__.engine.boosting,glow:__MOSPEADA_VFX__.engine.airGlow.value,boostEmitted:__MOSPEADA_VFX__.engine.emitted.boost,dust:__MOSPEADA_VFX__.dust.system.particleNum},resident:p.plants.resident.size,late:p.plants.latePrepares,render:{calls:__ANIME__.effect.stats.renderCalls,triangles:__ANIME__.effect.stats.renderTriangles,width:__ANIME__.renderer.domElement.width,height:__ANIME__.renderer.domElement.height},gl:__ANIME__.renderer.getContext().getError(),error:__ANIME__.state.snapshot().error}})()`);results.push(r);return r}
async function shot(name){await frames(2);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function place(z,speed=0){for(const code of ['KeyW','KeyA','KeyD','ShiftLeft'])await key(code,false);await c.evaluate(`(async()=>{const d=__MOSPEADA__,{stage2PathX}=await import('/src/world/forest/forestStage2Config.js');window.__stage2Path=stage2PathX;d.runtime.levelProgress.reset();d.runtime.resetAt({x:stage2PathX(${z}),z:${z},yaw:Math.atan2(stage2PathX(${z}-1)-stage2PathX(${z}+1),-2),label:'Prueba Plano 2'});d.setCameraMode(0);d.runtime.state.speed=${speed};window.__stage2Run={rows:[],launched:false,landed:false,pressed:false,groundPressed:false,last:performance.now()};return true})()`)}
async function until(condition,{air=false,ground=false,follow=false}={}){
  return c.evaluate(`new Promise((resolve,reject)=>{let n=0;function tick(){try{const d=__MOSPEADA__,s=d.runtime.state,r=__stage2Run,now=performance.now();if(s.airborne)r.launched=true;if(r.launched&&s.frontGrounded&&s.rearGrounded&&d.runtime.levelProgress.recoveries===0)r.landed=true;
  if(${air}&&s.airborne&&s.airTime>.025&&!r.pressed){r.pressed=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',key:'Shift'}))}else if(r.pressed&&d.runtime.keys.ShiftLeft)window.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',key:'Shift'}));
  if(${ground}&&!r.groundPressed&&s.z<-790&&!s.airborne){r.groundPressed=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',key:'Shift'}))}
  if(${follow}){const target=Math.atan2(__stage2Path(s.z-12)-s.x,-12),error=Math.atan2(Math.sin(target-s.yaw),Math.cos(target-s.yaw));d.runtime.keys.KeyA=error>.008;d.runtime.keys.KeyD=error<-.008}
  r.rows.push({x:s.x,z:s.z,y:s.height,speed:s.speed,air:s.airborne,boost:s.boostTime,airBoosts:s.airBoostCount,frameMs:now-r.last,recoveries:d.runtime.levelProgress.recoveries});r.last=now;
  if(${condition}){d.runtime.paused=true;resolve({landed:r.landed,launched:r.launched,rows:r.rows})}else if(++n>700)reject(Error('Gameplay condition timed out'));else requestAnimationFrame(tick)}catch(e){reject(e)}}requestAnimationFrame(tick)})`)
}
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  const oldOrigin=await c.evaluate('performance.timeOrigin');await c.send('Page.reload',{ignoreCache:false});c.events.length=0
  for(let i=0;i<1000;i++){const s=await c.evaluate(`({ready:performance.timeOrigin!==${oldOrigin}&&!!window.__FOREST_STAGE2__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})`);if(s.error)throw Error(s.error);if(s.ready)break;if(i===999)throw Error('Plano 2 did not load');await wait(150)}
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await shot('plano1-preserved');await snapshot('plano1')
  await place(-390,30);await key('KeyW',true);await until('s.z<-425',{follow:true});await snapshot('continuous-seam');await shot('seam')
  await place(-475,30);await key('KeyW',true);await until('s.airborne&&s.airTime>.15');const firstAir=await snapshot('first-flight');assert.equal(firstAir.state.airBoostCount,0);await shot('first-flight')
  await c.evaluate('__MOSPEADA__.runtime.paused=false;true');const first=await until('r.landed');await snapshot('first-landing');await shot('first-landing');assert.ok(first.landed)
  const runs={first}
  for(const ground of [false,true]){await place(-730,60);await key('KeyW',true);const run=await until('d.runtime.levelProgress.recoveries>0',{ground});runs[ground?'groundOnly':'noBoost']=run;const s=await snapshot(ground?'ground-only-retry':'no-boost-retry');assert.equal(s.state.airBoostCount,0);assert.equal(s.state.z,-655);assert.equal(s.state.speed,0);assert.equal(run.landed,false);await shot(ground?'ground-only-retry':'checkpoint-retry')}
  await place(-655);await key('KeyW',true);await until("s.airborne&&s.boostMode==='air'&&s.boostTime>.08",{air:true});const air=await snapshot('air-boost');assert.equal(air.state.airBoostCount,1);assert.equal(air.fx.glow,1);assert.ok(air.fx.boost);await shot('air-boost')
  await c.evaluate('__MOSPEADA__.runtime.paused=false;true');const success=await until('r.landed');runs.air=success;assert.ok(success.landed);const landed=await snapshot('canyon-landing');assert.ok(landed.state.z< -930);assert.equal(landed.recoveries,0);await shot('canyon-landing')
  // Brief elevated inspection only; production camera parameters are restored.
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.runtime.cameraController.orbit.maxDistance=250;d.camera.position.set(72,102,-780);d.runtime.cameraController.orbit.target.set(5,0,-865);d.runtime.cameraController.orbit.update();return true})()`);await shot('canyon-elevated')
  await place(-600,8);await key('KeyT',true);await key('KeyT',false);await until('d.runtime.armorController.active');await snapshot('armor')
  await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await key('KeyT',true);await key('KeyT',false);await until("d.runtime.transformEntry.phase==='idle'&&!d.runtime.armorController.active");await snapshot('motorcycle-return')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  for(const r of results){assert.equal(r.gl,0);assert.equal(r.error,'');for(const v of Object.values(r.state))if(typeof v==='number')assert.ok(Number.isFinite(v))}assert.deepEqual(errors,[])
  fs.writeFileSync(dir+'/gameplay.json',JSON.stringify({results,runs,errors,preserved:true},null,2)+'\n');console.log(results.map(r=>({name:r.name,z:r.state.z,y:r.state.y,speed:r.state.speed,air:r.state.air,airBoosts:r.state.airBoostCount,recoveries:r.recoveries,late:r.late,phase:r.phase})))
}finally{for(const code of ['KeyW','KeyA','KeyD','ShiftLeft'])await key(code,false).catch(()=>{});await c.evaluate('__MOSPEADA__.setCameraMode(0);__MOSPEADA__.reset("forest");true').catch(()=>{});c.close()}
