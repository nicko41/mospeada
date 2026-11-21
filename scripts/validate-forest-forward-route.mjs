import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {connect} from './browser-cdp.mjs'
import {createForestTerrain} from '../src/world/forest/forestTerrainGeometry.js'
import {forestLayout} from '../src/world/forest/forestLayout.js'
const dir='artifacts/forest-forward-route',before=JSON.parse(fs.readFileSync(dir+'/before.json')),hash=v=>crypto.createHash('sha256').update(v).digest('hex'),g=createForestTerrain()
assert.equal(hash(Buffer.from(g.attributes.position.array.buffer)),before.positionHash);g.dispose()
assert.equal(hash(JSON.stringify(forestLayout)),before.layoutHash)
for(const [file,expected]of Object.entries(before.files))assert.equal(hash(fs.readFileSync(file)),expected,`Preserve ${file}`)
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),shots=[]
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  const oldOrigin=await c.evaluate('performance.timeOrigin');await c.send('Page.reload',{ignoreCache:false});c.events.length=0
  let ready=false
  for(let i=0;i<1000;i++){
    const s=await c.evaluate(`({ready:performance.timeOrigin!==${oldOrigin}&&!!window.__FOREST_BOUNDARIES__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})`)
    if(s.error)throw Error(s.error)
    if(s.ready){ready=true;break}await wait(200)
  }
  assert.ok(ready,'Forest boundary assets loaded')
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  async function shot(name){await wait(450);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));shots.push(name)}
  await shot('startup')
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.runtime.cameraController.orbit.maxDistance=180;d.camera.position.set(-12,125,24);d.runtime.cameraController.orbit.target.set(-12,0,-25);d.runtime.cameraController.orbit.update();return true})()`)
  await shot('elevated')
  for(const [name,x,z,yaw]of [['forward',-17,-48,Math.PI],['left',-19,-65,-Math.PI/2],['right',-19,-62,Math.PI/2],['rear',8,36,.1]]){
    await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.setCameraMode(0);d.runtime.state=createBikeState({x:${x},z:${z},yaw:${yaw}},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);return true})()`)
    await shot(name)
  }
  const audit=await c.evaluate(`(()=>{const b=__FOREST_BOUNDARIES__,a=__FOREST_ALPHA__;return{trees:Object.values(b.layout.byName).flat().filter(p=>p.kind==='tree').length,rocks:Object.values(b.layout.byName).flat().filter(p=>p.kind==='rock').length,sprites:b.layout.sprites.length,colliders:b.colliders.length,logParts:b.logs.group.children.length,logTriangles:b.logs.group.children.reduce((n,m)=>n+m.geometry.index.count/3,0),alphaMatrix:a.placement.matrix.toArray(),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error,render:__ANIME__.effect.stats.renderCalls}})()`)
  assert.ok(audit.logParts>=2&&audit.logTriangles>20);assert.equal(audit.gl,0);assert.equal(audit.shader,'')
  // Exercise actual W input from the main approach: the new edges must not
  // introduce a collision on the single forward route through the old junction.
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js'),{forestPathX}=await import('/src/world/forest/forestSurface.js');d.runtime.state=createBikeState({x:forestPathX(-48),z:-48,yaw:Math.PI+.18},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'})
  await c.evaluate('new Promise(resolve=>{let n=42;function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})')
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'})
  const drive=await c.evaluate('({x:__MOSPEADA__.runtime.state.x,z:__MOSPEADA__.runtime.state.z,speed:__MOSPEADA__.runtime.state.speed})');assert.ok(drive.z< -61&&drive.speed>8)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(errors,[])
  const report={preserved:{terrainPositions:true,originalForestLayout:true,protectedFiles:before.files},audit,drive,shots,errors}
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({audit,drive,shots,errors},null,2))
}finally{
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'}).catch(()=>{})
  await c.evaluate('__MOSPEADA__.setCameraMode(0);__MOSPEADA__.reset("forest");__MOSPEADA__.runtime.paused=false;true').catch(()=>{});c.close()
}
