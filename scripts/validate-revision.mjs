import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = (code, down) => c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase() })
const snapshot = () => c.evaluate('window.__MOSPEADA__.snapshot()')
const screenshot = async name => fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
const began = Date.now()
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 120 && !await c.evaluate('!!window.__MOSPEADA__'); i++) await wait(250)
  await c.evaluate('window.__MOSPEADA__.reset("highway")')
  await wait(1500)
  const idle = await snapshot()
  assert.ok(idle.idleBlend > 0.95 && idle.lean < -0.1)
  assert.equal(await c.evaluate('window.__MOSPEADA__.runtime.orbit.enabled'), true)
  assert.equal((await snapshot()).cameraMode, 0)
  const beforeOrbit = await c.evaluate('window.__MOSPEADA__.camera.position.toArray()')
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 400, button: 'left', buttons: 1, clickCount: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 940, y: 450, button: 'left', buttons: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 940, y: 450, button: 'left', buttons: 0, clickCount: 1 })
  await wait(600)
  const afterOrbit = await c.evaluate('window.__MOSPEADA__.camera.position.toArray()')
  assert.ok(Math.hypot(...afterOrbit.map((x, i) => x - beforeOrbit[i])) > 1)
  const beforeZoom = await c.evaluate('window.__MOSPEADA__.camera.position.distanceTo(window.__MOSPEADA__.runtime.orbit.target)')
  await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 650, y: 400, deltaX: 0, deltaY: -180 })
  await wait(400)
  const afterZoom = await c.evaluate('window.__MOSPEADA__.camera.position.distanceTo(window.__MOSPEADA__.runtime.orbit.target)')
  assert.ok(afterZoom < beforeZoom)
  await c.evaluate(`{const d=window.__MOSPEADA__,s=d.runtime.state;d.runtime.paused=true;d.setCameraMode(3);d.runtime.orbit.target.set(s.x,s.height+0.85,s.z);d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(2.7,2.6,-2.6)));d.runtime.orbit.update()}`)
  await screenshot('revision-idle-left')
  for (const steer of [-0.52, 0.52]) {
    await c.evaluate(`window.__MOSPEADA__.runtime.state.steer=${steer}`); await wait(200)
    await screenshot(steer < 0 ? 'revision-steering-right' : 'revision-steering-left')
  }
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.runtime.cameraMode=1;window.__MOSPEADA__.runtime.orbit.enabled=false')
  await key('KeyW', true); await wait(3000)
  const riding = await snapshot(); assert.ok(riding.idleBlend < 0.03)
  await key('KeyA', true); await key('Space', true); await wait(750)
  const handbrake = await snapshot()
  assert.ok(handbrake.handbrake > 0.7 && Math.abs(handbrake.slip) > 0.05)
  await screenshot('revision-handbrake')
  await key('KeyA', false); await key('Space', false); await key('KeyW', false)
  await c.evaluate('window.__MOSPEADA__.reset("jump");window.__MOSPEADA__.runtime.cameraMode=1')
  await key('KeyW', true)
  let flight, landed = false, maxGap = 0, landingImpact = 0
  for (let i = 0; i < 160; i++) {
    await wait(70)
    const s = await snapshot(); maxGap = Math.max(maxGap, s.frontAirGap, s.rearAirGap); landingImpact = Math.max(landingImpact, s.landingImpact)
    if (!flight && s.airborne && maxGap > 0.1) {
      await c.evaluate('window.__MOSPEADA__.runtime.paused=true'); flight = await snapshot()
      await screenshot('revision-inertial-flight')
      await c.evaluate('window.__MOSPEADA__.runtime.paused=false')
    }
    if (flight && s.frontGrounded && s.rearGrounded) { landed = true; break }
    if (s.blocked) break
  }
  await key('KeyW', false)
  assert.ok(flight && landed, 'Bike takes off from real rendered crest and lands')
  await key('KeyS', true)
  for (let i = 0; i < 80; i++) {
    await wait(150)
    const current = await snapshot()
    if (current.speed < 0.05 && current.idleBlend > 0.95) break
  }
  await key('KeyS', false); await wait(600)
  const stopped = await snapshot()
  assert.ok(stopped.speed < 0.05 && stopped.idleBlend > 0.9)
  await screenshot('revision-landed')
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' && e.params.timestamp > began).map(e => e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  const report = { idle, orbit: { beforeOrbit, afterOrbit, beforeZoom, afterZoom }, riding, handbrake, flight, landed, maxGap, landingImpact, stopped, errors }
  fs.writeFileSync(`${directory}/revision-validation.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ freeOrbit: true, zoom: true, idleLean: idle.lean, handbrakeSlip: handbrake.slip, flight: !!flight, landed, maxGap, landingImpact, errors }, null, 2))
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.runtime.cameraMode=0;window.__MOSPEADA__.runtime.orbit.enabled=false')
} finally { c.close() }
