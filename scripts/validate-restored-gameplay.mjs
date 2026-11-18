import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c = await connect(), wait = ms => new Promise(r => setTimeout(r, ms)), directory = 'artifacts/gameplay-restored'
fs.mkdirSync(directory, { recursive: true })
async function until(expression, seconds = 30) { for (let i = 0; i < seconds * 5; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(200) } throw Error('Timed out: ' + expression) }
async function key(code, down) { await c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: ({ Space: ' ', ShiftLeft: 'Shift', ControlLeft: 'Control' })[code] || code.replace('Key', '').toLowerCase() }) }
async function tap(code) { await key(code, true); await key(code, false) }
async function shot(name) { fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
async function checkpoint(label) { return c.evaluate(`(()=>{const d=__MOSPEADA__,s=d.runtime.state;return{label:${JSON.stringify(label)},speed:s.speed,x:s.x,z:s.z,yaw:s.yaw,boostCount:s.boostCount,handbrake:s.handbrake,riderMode:s.riderMode,pedestrian:s.pedestrian?{x:s.pedestrian.x,z:s.pedestrian.z,moving:s.pedestrian.moving,runBlend:s.pedestrian.runBlend}:null,clip:__SCOTT_ORIGINAL__.instance.clip,frontTravel:d.rig.articulation.frontTravel,wheelSpin:d.rig.frontSpin.rotation.x}})()` ) }
try {
  await c.send('Page.bringToFront'); await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.reload', { ignoreCache: true }); await wait(350)
  await until('!!window.__MOSPEADA__?.runtime.gameplay && !!window.__SCOTT_ORIGINAL__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")', 100)
  assert.equal(await c.evaluate('!!document.querySelector(".scott-original-panel")'), false)
  await c.evaluate('__MOSPEADA__.reset("highway")')
  const report = { animationPanelRemoved: true, samples: [], startupGL: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  report.samples.push(await checkpoint('mounted'))
  await key('KeyW', true); await until('__MOSPEADA__.runtime.state.speed > 8'); report.samples.push(await checkpoint('accelerating'))
  await tap('ShiftLeft'); await until('__MOSPEADA__.runtime.state.boostCount>0'); report.samples.push(await checkpoint('boost'))
  await key('ControlLeft', true); await until('__MOSPEADA__.runtime.state.wheelieAngle>.4'); await shot('wheelie')
  report.wheelie = await c.evaluate('__MOSPEADA__.runtime.state.wheelieAngle'); await key('ControlLeft', false)
  await key('KeyA', true); await key('Space', true); await until('__MOSPEADA__.runtime.state.handbrake>.5'); report.samples.push(await checkpoint('handbrake'))
  await key('KeyA', false); await key('Space', false); await key('KeyW', false)
  await key('KeyS', true); await until('__MOSPEADA__.runtime.state.speed<.05'); await key('KeyS', false)
  await until('__MOSPEADA__.runtime.state.wheelieAngle<.01 && __MOSPEADA__.runtime.state.frontGrounded')
  await tap('KeyF'); await until('__MOSPEADA__.runtime.state.riderMode==="dismounting"'); report.samples.push(await checkpoint('dismounting'))
  await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"'); report.samples.push(await checkpoint('on-foot')); await shot('on-foot')
  await c.evaluate('window.__FOOT_START__={...__MOSPEADA__.runtime.state.pedestrian}')
  await key('KeyS', true); await until('__MOSPEADA__.runtime.state.pedestrian.moving && __SCOTT_ORIGINAL__.instance.clip==="walking_2_inplace"')
  await until('Math.hypot(__MOSPEADA__.runtime.state.pedestrian.x-__FOOT_START__.x,__MOSPEADA__.runtime.state.pedestrian.z-__FOOT_START__.z)>.30')
  report.samples.push(await checkpoint('walking'))
  await key('ShiftLeft', true); await until('__SCOTT_ORIGINAL__.instance.clip==="Running"'); report.samples.push(await checkpoint('running'))
  await key('ShiftLeft', false); await key('KeyS', false)
  await key('ControlLeft', true); await until('__SCOTT_ORIGINAL__.instance.clip==="air_squat"'); await shot('crouching'); await key('ControlLeft', false)
  // Put the actor at its measured left approach point, preserving world/game
  // state, so the remount check does not depend on a particular camera yaw.
  await c.evaluate(`(()=>{const d=__MOSPEADA__,s=d.runtime.state,a=d.runtime.scottData.keyPoses[0].pelvis,p=s.pedestrian;p.x=s.x+Math.cos(s.yaw)*a[0]+Math.sin(s.yaw)*a[2]+Math.cos(s.yaw)*.10;p.z=s.z-Math.sin(s.yaw)*a[0]+Math.cos(s.yaw)*a[2]-Math.sin(s.yaw)*.10;p.ground=d.sample(p.x,p.z);p.yaw=s.yaw;p.moving=false})()`)
  await tap('KeyF'); await until('__MOSPEADA__.runtime.state.riderMode==="mounting"'); report.samples.push(await checkpoint('mounting'))
  await until('__MOSPEADA__.runtime.state.riderMode==="mounted"'); await until('__SCOTT_ORIGINAL__.instance.clip==="Cyclone_RidingPose"')
  await key('KeyW', true); await until('__MOSPEADA__.runtime.state.speed>2'); await key('KeyW', false); report.samples.push(await checkpoint('riding-again'))
  await tap('KeyP'); const before = await c.evaluate('__MOSPEADA__.runtime.state.distance'); await wait(400)
  assert.equal(await c.evaluate('__MOSPEADA__.runtime.state.distance'), before); await tap('KeyP')
  await c.evaluate('__MOSPEADA__.reset("highway")'); await shot('gameplay-hud')
  report.integrity = await c.evaluate(`(()=>{const d=__SCOTT_ORIGINAL__;let source;d.source.scene.traverse(n=>{if(n.isSkinnedMesh)source=n});return{bones:d.instance.bones.size,originalClips:d.source.animations.length,sameBaseGeometry:d.instance.skins[0].mesh.geometry.attributes.position===source.geometry.attributes.position,relaxedHandInfluence:d.instance.skins[0].mesh.morphTargetInfluences?.[0]??0,sameWeights:d.instance.skins[0].mesh.geometry.attributes.skinWeight===source.geometry.attributes.skinWeight,cameraActive:__MOSPEADA__.runtime.orbit.enabled,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.equal(report.integrity.bones, 24); assert.equal(report.integrity.originalClips, 16); assert.ok(report.integrity.sameBaseGeometry && report.integrity.relaxedHandInfluence===0 && report.integrity.sameWeights && report.integrity.cameraActive)
  assert.equal(report.integrity.shader, ''); assert.equal(report.integrity.gl, 0)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2))
} finally {
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'Space', 'ShiftLeft', 'ControlLeft']) await key(code, false).catch(() => {})
  c.close()
}
