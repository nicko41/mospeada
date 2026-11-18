import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), began = Date.now(), directory = 'artifacts/driving'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const frames = []
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 120 && !await c.evaluate('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")'); i++) await wait(250)
  await c.evaluate(`window.__MOSPEADA__.reset('highway'); window.dispatchEvent(new CustomEvent('ride-command',{detail:{freeCamera:true}})); window.__MOSPEADA__.runtime.paused=true`)
  for (const [name, steer, view] of [['straight', 0, 'front'], ['left', 0.52, 'front'], ['right', -0.52, 'front'], ['rear-seat', 0, 'rear']]) {
    await c.evaluate(`{ const d=window.__MOSPEADA__,s=d.runtime.state; s.steer=${steer}; s.idleBlend=0; s.lean=0;
      const camera=d.camera,orbit=d.runtime.orbit;
      orbit.target.copy(d.rig.root.localToWorld(camera.position.clone().set(${view === 'front' ? '0.19,0.39,0.35' : '-0.19,0.34,-0.12'})));
      camera.position.copy(d.rig.root.localToWorld(camera.position.clone().set(${view === 'front' ? '1.10,0.92,1.10' : '-1.10,0.85,-1.15'}))); orbit.update(); }`)
    await wait(500)
    const state = await c.evaluate(`({ snapshot:window.__MOSPEADA__.snapshot(), seats:window.__MOSPEADA__.rig.hydraulicSeats.map(seat=>({base:seat.base.toArray(),floor:seat.floor,outer:seat.outer,radius:seat.casingRadius})),guardAngle:window.__MOSPEADA__.rig.guards[0].angle,pivot:window.__MOSPEADA__.rig.guards[0].pivot.toArray() })`)
    assert.ok(state.snapshot.hydraulics.every(h => h.baseError < 1e-8 && h.targetError < 1e-8))
    for (const seat of state.seats) {
      assert.ok(Math.abs(seat.base[0]) - seat.radius > Math.abs(seat.floor))
      assert.ok(Math.abs(seat.base[0]) + seat.radius < Math.abs(seat.outer))
    }
    if (steer > 0) assert.ok(state.guardAngle < -0.15)
    const shot = await c.send('Page.captureScreenshot')
    fs.writeFileSync(`${directory}/hydraulic-seated-${name}.png`, Buffer.from(shot.data, 'base64'))
    frames.push({ name, ...state })
  }
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' && e.params.timestamp > began).map(e => e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  fs.writeFileSync(`${directory}/hydraulic-seating-validation.json`, JSON.stringify({ frames, errors }, null, 2))
  console.log(JSON.stringify({ frames: frames.map(f => ({ name: f.name, guardDegrees: f.guardAngle * 180 / Math.PI })), seats: frames[0].seats, errors }, null, 2))
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.runtime.cameraMode=0;window.__MOSPEADA__.runtime.orbit.enabled=false')
} finally { c.close() }
