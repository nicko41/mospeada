import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'artifacts/forest', stages = []
fs.mkdirSync(directory, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression, timeout = 120000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const result = await c.evaluate(expression); if (result) return result; await wait(120) }
  throw Error('Timed out: ' + expression)
}
const ready = () => until(`!!window.__MOSPEADA__ && !!window.__FRONT_BATTLOID__?.store.snapshot().ready && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`, 240000)
const keys = { KeyW: 'w', KeyS: 's', KeyD: 'd', KeyA: 'a', KeyT: 't', KeyG: 'g', KeyF: 'f', KeyR: 'r', Space: ' ', ShiftLeft: 'Shift' }
const key = (code, down) => c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: keys[code] })
async function press(code) { await key(code, true); await key(code, false) }
const resume = () => c.evaluate('__MOSPEADA__.runtime.paused=false;true')
async function capture(name) {
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  await wait(200)
  const result = await c.evaluate(`(()=>{const d=__MOSPEADA__,a=d.runtime.armorController,forest=[];d.scene.traverse(o=>{if((o.isInstancedMesh||o.isBatchedMesh)&&o.userData.forest)forest.push({name:o.name,count:o.isBatchedMesh?o._multiDrawCount:o.count})});return{name:${JSON.stringify(name)},bike:{x:d.runtime.state.x,z:d.runtime.state.z,height:d.runtime.state.height,speed:d.runtime.state.speed,blocked:d.runtime.state.blocked,riderMode:d.runtime.state.riderMode,frontContact:d.runtime.state.frontContact,rearContact:d.runtime.state.rearContact},armor:a.active?{...a.state}:null,forest,drawCalls:__ANIME__.effect.stats.renderCalls,shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()}})()`)
  assert.equal(result.gl, 0); assert.equal(result.shader, '')
  stages.push(result)
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  console.log(`Passed: ${name}`)
  return result
}

try {
  await c.send('Network.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/?environment=forest' })
  await ready()
  c.events.length = 0
  const initial = await capture('spawn')
  assert.equal(initial.bike.x, 0); assert.equal(initial.bike.z, 0)
  assert.ok(initial.forest.filter(o => o.name.startsWith('Forest_detail_')).every(o => o.count > 0))

  // Real keyboard movement through the clearing, followed by the existing brake.
  await resume(); await key('KeyW', true); await until('__MOSPEADA__.runtime.state.z < -8 && __MOSPEADA__.runtime.state.speed > 8'); await key('KeyW', false)
  const driving = await capture('cyclone-driving')
  assert.ok(driving.bike.z < -5 && driving.bike.speed > 8)
  assert.equal(driving.bike.frontContact.surface, 'dirt')
  await resume(); await key('KeyS', true); await until('__MOSPEADA__.runtime.state.speed < .1'); await key('KeyS', false)
  await capture('cyclone-braking')

  // Actual original T choreography, Armor Ground locomotion and return.
  await c.evaluate('__MOSPEADA__.reset("forest");true'); await resume()
  await key('KeyW',true);await until('__MOSPEADA__.runtime.state.speed>12');await key('KeyW',false);await press('KeyT')
  await until('__MOSPEADA__.runtime.armorController.active')
  await wait(1200); const hover = await capture('armor-hover'); assert.equal(hover.armor.mode, 'ARMOR_HOVER')
  await press('KeyG'); await resume()
  await until('__MOSPEADA__.runtime.armorController.state.mode === "ARMOR_GROUND" && __MOSPEADA__.runtime.armorController.state.grounded')
  // Entry momentum can land hundreds of metres beyond the clearing, including
  // directly against a seeded trunk. Give the locomotion test a known free
  // starting point AFTER exercising the real transformation and landing.
  await c.evaluate(`(()=>{const d=__MOSPEADA__,controller=d.runtime.armorController,a=controller.state;a.x=0;a.z=0;a.ground=a.groundSmooth=d.sample(0,0);a.y=a.ground-a.soleOffset+.025;a.vx=a.vz=a.vy=0;controller.camera.activate(a);return true})()`)
  const before = await c.evaluate('({...__MOSPEADA__.runtime.armorController.state})')
  await key('KeyW', true); await until(`Math.hypot(__MOSPEADA__.runtime.armorController.state.x-(${before.x}),__MOSPEADA__.runtime.armorController.state.z-(${before.z}))>1.5`); await key('KeyW', false)
  const walking = await capture('armor-ground-walk')
  assert.ok(Math.hypot(walking.armor.x-before.x,walking.armor.z-before.z)>1)
  await resume(); await key('Space',true); await until('__MOSPEADA__.runtime.armorController.state.height>1'); await key('Space',false)
  await capture('armor-jump'); await resume()
  await until('__MOSPEADA__.runtime.armorController.state.grounded'); await press('KeyT')
  await until('__FRONT_BATTLOID__.entry.phase === "idle"')
  const returned = await capture('cyclone-return'); assert.equal(returned.armor, null)

  // Both a trunk and an important rock stop the real Motorcycle collision solver.
  for (const type of ['cylinder','box']) {
    await c.evaluate(`(async()=>{
      const d=__MOSPEADA__,{allColliders}=await import('/src/player/collisionWorld.js'),{createBikeState}=await import('/src/vehicle/bikePhysics.js');
      const obstacle=allColliders().find(c=>c.type==='${type}'&&Math.abs(c.minX)<70&&Math.abs(c.minZ)<70&&c.maxY-d.sample((c.minX+c.maxX)/2,(c.minZ+c.maxZ)/2)>.5);
      if(!obstacle)throw Error('No test obstacle');window.__forestObstacle=obstacle;
      d.reset('forest');d.runtime.state=createBikeState({x:(obstacle.minX+obstacle.maxX)/2,z:obstacle.minZ-4,yaw:0},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);return true
    })()`)
    await resume(); await key('KeyW', true); await until('__MOSPEADA__.runtime.state.blocked')
    const blocked = await capture(type==='cylinder'?'trunk-collision':'rock-collision')
    await key('KeyW', false); assert.ok(blocked.bike.blocked)
    assert.ok(await c.evaluate(`(async()=>{const {overlapsFootprint}=await import('/src/player/collisionWorld.js');const d=__MOSPEADA__,p=d.camera.position,c=window.__forestObstacle;return !(p.y>c.minY&&p.y<c.maxY&&overlapsFootprint(c,p.x,p.z,.1))})()`))
  }

  await c.evaluate('__MOSPEADA__.reset("forest");true'); await resume()
  await press('KeyF'); await until('__MOSPEADA__.runtime.state.riderMode === "onFoot"')
  await capture('scott-on-foot')
  await press('KeyR'); await capture('reset-forest')

  // Frame measurements are recorded with GPU details, not advertised as a universal FPS guarantee.
  await resume(); await until('__ANIME__.state.snapshot().nightReady', 180000)
  await c.evaluate(`(()=>{const p=__FOREST_FOLIAGE__.config.performance;window.__validationAdaptive=p.adaptiveResolution;p.adaptiveResolution=false;__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);return true})()`)
  await wait(12000)
  const performance = await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function frame(t){times.push(t-last);last=t;if(times.length<121)requestAnimationFrame(frame);else{times.shift();times.sort((a,b)=>a-b);const gl=__ANIME__.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({frames:times.length,medianMs:times[60],p95Ms:times[114],drawCalls:__ANIME__.effect.stats.renderCalls,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})}}requestAnimationFrame(frame)})`)
  Object.assign(performance, await c.evaluate(`({pixelRatio:__ANIME__.renderer.getPixelRatio(),renderWidth:__ANIME__.renderer.domElement.width,renderHeight:__ANIME__.renderer.domElement.height})`))
  console.log('Performance:', performance)
  await c.evaluate('__FOREST_FOLIAGE__.config.performance.adaptiveResolution=window.__validationAdaptive;true')

  // Use the actual environment selector; no scene survives across the boundary.
  await c.openSettings('Conducción')
  await c.evaluate(`(()=>{const s=document.querySelector('[aria-label="Escenario de prueba"]');s.value='highway';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await until('location.search.includes("environment=highway")'); await ready()
  assert.equal(await c.evaluate('!!__MOSPEADA__.scene.getObjectByName("MOSPEADA_Level_01_Forest")'),false)
  await capture('highway-preserved')
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  const failedAssets = c.events.filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
  assert.deepEqual(errors, []); assert.deepEqual(failedAssets, [])
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify({ pass: true, performance, stages, errors, failedAssets }, null, 2) + '\n')
  console.log(JSON.stringify({ pass: true, stages: stages.map(s=>s.name), performance }, null, 2))
  // Leave the test browser on the requested default environment.
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/' }); await ready()
} finally { c.close() }
