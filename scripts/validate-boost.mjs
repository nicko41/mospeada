import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
import { bikeConfig } from '../src/vehicle/bikeConfig.js'
import { createBikeState, advanceBike } from '../src/vehicle/bikePhysics.js'

const c = await connect(), directory = 'artifacts/driving', began = Date.now()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = (code, down) => c.send('Input.dispatchKeyEvent', {
  type: down ? 'keyDown' : 'keyUp', code,
  key: ({ KeyW: 'w', KeyS: 's', Space: ' ', ShiftLeft: 'Shift', ShiftRight: 'Shift' })[code],
  windowsVirtualKeyCode: ({ KeyW: 87, KeyS: 83, Space: 32, ShiftLeft: 16, ShiftRight: 16 })[code],
})
const snapshot = () => c.evaluate('window.__MOSPEADA__.snapshot()')
async function until(predicate, label, limit = 10000) {
  const started = Date.now()
  while (Date.now() - started < limit) {
    const state = await snapshot()
    if (predicate(state)) return state
    await wait(80)
  }
  throw Error('Timed out: ' + label)
}
async function photograph(name) {
  await c.evaluate('window.__MOSPEADA__.runtime.paused=true')
  await wait(140)
  fs.writeFileSync(`${directory}/boost-${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
  await c.evaluate('window.__MOSPEADA__.runtime.paused=false')
}
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 120 && !await c.evaluate('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")'); i++) await wait(250)
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.setCameraMode(1)')
  const before = await snapshot()
  await key('KeyW', true)
  const launch = await until(s => s.distance > 0.8, 'launch')
  assert.ok(launch.pitch < before.pitch - 0.02 && launch.rearTravel > 0.008)
  assert.ok(launch.frontGrounded && launch.rearGrounded && !launch.blocked)
  await photograph('launch')
  const preBoost = await snapshot()
  await key('ShiftLeft', true)
  const impulse = await until(s => s.boostCount === 1, 'left Shift impulse')
  assert.ok(impulse.speed > preBoost.speed + bikeConfig.boostImpulse - 1)
  assert.ok(impulse.handbrake === 0 && impulse.boostTime > 0)
  assert.match(await c.evaluate('document.querySelector(".ride-boost").textContent'), /BOOST/)
  await photograph('impulse')
  const held = await until(s => s.boostCooldown === 0, 'held Shift recharge')
  assert.equal(held.boostCount, 1)
  await key('ShiftLeft', false)
  await wait(150)
  await key('ShiftRight', true)
  const second = await until(s => s.boostCount === 2, 'right Shift impulse')
  assert.ok(second.speed > held.speed + 8 && second.handbrake === 0)
  await key('ShiftRight', false)
  await key('KeyW', false)
  await key('KeyS', true)
  const braking = await until(s => s.acceleration < -8 && s.pitch > before.pitch + 0.02 && s.frontTravel > 0.008, 'front brake dive')
  assert.ok(braking.frontTravel > 0.008 && braking.frontGrounded && braking.rearGrounded)
  await photograph('braking')
  const stopped = await until(s => s.speed === 0 && s.idleBlend > 0.95, 'full stop')
  await key('KeyS', false)
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.setCameraMode(1)')
  await key('KeyW', true)
  await until(s => s.speed > 5, 'handbrake setup')
  await key('KeyW', false)
  await key('Space', true)
  const handbrake = await until(s => s.handbrake > 0.9, 'independent space handbrake')
  assert.equal(handbrake.boostCount, 0)
  await key('Space', false)
  for (const state of [launch, impulse, second, braking]) {
    assert.ok(Math.abs(state.frontContactError) < 0.04 && Math.abs(state.rearContactError) < 0.04)
    assert.ok(state.handErrors.every(error => error < 0.05))
  }
  // Sustained speed on a flat test surface is independent of streamed road length.
  const metrics = before.metrics, flat = () => 0
  const bench = createBikeState({ x: 0, z: 0, yaw: 0 }, metrics, flat)
  let zeroTo100 = null
  for (let i = 0; i < 3600; i++) {
    advanceBike(bench, { throttle: 1 }, 1 / 120, metrics, flat)
    if (zeroTo100 === null && bench.speed * 3.6 >= 100) zeroTo100 = (i + 1) / 120
  }
  const topSpeedKmh = bench.speed * 3.6
  assert.ok(topSpeedKmh > 213 && topSpeedKmh <= 216)
  for (let i = 0; i < 66; i++) advanceBike(bench, { throttle: 1, boost: true }, 1 / 120, metrics, flat)
  const boostedSpeedKmh = bench.speed * 3.6
  assert.ok(boostedSpeedKmh > 245)
  const errors = c.events.filter(event => event.method === 'Runtime.exceptionThrown' && event.params.timestamp > began).map(event => event.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  const report = { topSpeedKmh, boostedSpeedKmh, zeroTo100Seconds: zeroTo100, before, launch, impulse, held, second, braking, stopped, handbrake, errors }
  fs.writeFileSync(`${directory}/boost-validation.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ topSpeedKmh, boostedSpeedKmh, zeroTo100Seconds: zeroTo100, launchRearTravel: launch.rearTravel, brakingFrontTravel: braking.frontTravel, heldBoostCount: held.boostCount, repeatedBoostCount: second.boostCount, errors }, null, 2))
} finally {
  for (const code of ['KeyW', 'KeyS', 'Space', 'ShiftLeft', 'ShiftRight']) await key(code, false).catch(() => {})
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.setCameraMode(0)').catch(() => {})
  c.close()
}
