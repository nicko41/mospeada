import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
import {createStage2Terrain} from '../src/world/forest/forestStage2Terrain.js'
const dir='artifacts/forest-canyon-river',before=JSON.parse(fs.readFileSync(dir+'/before.json')),hash=v=>crypto.createHash('sha256').update(v).digest('hex'),g=createStage2Terrain()
assert.deepEqual(g.tops.map(v=>hash(Buffer.from(v.attributes.position.array.buffer))),before.tops);[...g.tops,g.cliffs,g.bed].forEach(v=>v.dispose());for(const [p,h]of Object.entries(before.files))assert.equal(hash(fs.readFileSync(p)),h,p)
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),shots=[]
async function shot(name){await wait(350);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));shots.push(name)}
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  for(let i=0;i<900;i++){const s=await c.evaluate('({ready:!!window.__FOREST_STAGE2__?.river&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})');if(s.error)throw Error(s.error);if(s.ready)break;if(i===899)throw Error('Canyon did not load');await wait(150)}
  c.events.length=0
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{stage2PathX}=await import('/src/world/forest/forestStage2Config.js');d.runtime.resetAt({x:stage2PathX(-792),z:-792,yaw:Math.PI,label:'Plano 2 · Barranco'});d.setCameraMode(0);d.runtime.paused=true;return true})()`);await shot('gameplay-rim')
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.runtime.cameraController.orbit.maxDistance=180;d.camera.position.set(48,64,-805);d.runtime.cameraController.orbit.target.set(0,-19,-866);d.runtime.cameraController.orbit.update();return true})()`);await shot('elevated')
  if(process.argv.includes('--visual-only')){await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.cameraController.orbit.maxDistance=550;d.camera.position.set(35,55,-820);d.runtime.cameraController.orbit.target.set(-280,-15,-865);d.runtime.cameraController.orbit.update();return true})()`);await shot('extended-side')}
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.camera.position.set(30,-16,-846);d.runtime.cameraController.orbit.target.set(-8,-34,-867);d.runtime.cameraController.orbit.update();return true})()`);await shot('river-detail')
  const time=await c.evaluate('__FOREST_STAGE2__.river.time.value');await wait(250);assert.ok(await c.evaluate(`__FOREST_STAGE2__.river.time.value>${time}`));await shot('river-current')
  const audit=await c.evaluate(`(()=>{const p=__FOREST_STAGE2__,d=__MOSPEADA__,r=d.scene.getObjectByName('Forest_canyon_flowing_river');return{wallMap:p.cliff.wall.map.image.currentSrc||p.cliff.wall.map.image.src,wallTriangles:p.terrain.cliffs.index.count/3,riverTriangles:p.river.geometry.index.count/3,riverIsRideSurface:!!r.userData.rideSurface,gapHasNoSupport:!Number.isFinite(d.sample(0,-865)),animatedTime:p.river.time.value,rocks:p.canyon.placements.length,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.ok(audit.wallMap.includes('barranco.jpg'));assert.equal(audit.riverIsRideSurface,false);assert.ok(audit.gapHasNoSupport);assert.equal(audit.gl,0);assert.equal(audit.shader,'')
  if(process.argv.includes('--visual-only')){
    const sides=await c.evaluate('({tiles:__FOREST_STAGE2__.sides.tiles.length,minX:Math.min(...__FOREST_STAGE2__.sides.tiles.map(t=>t.minX)),maxX:Math.max(...__FOREST_STAGE2__.sides.tiles.map(t=>t.maxX))})');assert.equal(sides.tiles,6)
    const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/sides-validation.json',JSON.stringify({preserved:true,audit,sides,shots,errors},null,2)+'\n');console.log({audit,sides,errors});process.exitCode=0
  }else{
  // One actual airborne Shift press through the normal input path.
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{stage2Checkpoint}=await import('/src/world/forest/forestStage2Config.js');d.runtime.levelProgress.reset();d.runtime.resetAt(stage2Checkpoint());d.setCameraMode(0);window.__riverJump={air:false,pressed:false};window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'}));return true})()`)
  const jump=await c.evaluate(`new Promise((resolve,reject)=>{let n=0;function tick(){const d=__MOSPEADA__,s=d.runtime.state,r=__riverJump;if(s.airborne)r.air=true;if(s.airborne&&!r.pressed){r.pressed=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',key:'Shift'}))}else if(r.pressed&&d.runtime.keys.ShiftLeft)window.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',key:'Shift'}));if(r.air&&s.frontGrounded&&s.rearGrounded&&s.z<-930){d.runtime.paused=true;resolve({z:s.z,y:s.height,airBoosts:s.airBoostCount,recoveries:d.runtime.levelProgress.recoveries})}else if(++n>450||d.runtime.levelProgress.recoveries)reject(Error('Crossing failed'));else requestAnimationFrame(tick)}requestAnimationFrame(tick)})`)
  assert.equal(jump.airBoosts,1);assert.equal(jump.recoveries,0);await shot('landing')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(errors,[])
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({preserved:true,audit,jump,shots,errors},null,2)+'\n');console.log({audit,jump,shots,errors})
  }
}finally{await c.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',key:'Shift'}));__MOSPEADA__.setCameraMode(0);__MOSPEADA__.reset('forest');true`).catch(()=>{});c.close()}
