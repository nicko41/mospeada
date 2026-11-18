import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving'
fs.mkdirSync(directory, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = (code, down) => c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: ({ KeyW: 'w', KeyA: 'a', KeyD: 'd', Space: ' ' })[code] || code, windowsVirtualKeyCode: ({ KeyW: 87, KeyA: 65, KeyD: 68, Space: 32 })[code] || 0 })
const snapshot = () => c.evaluate('window.__MOSPEADA__.snapshot()')
const screenshot = async name => fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const began = Date.now()
  for (let i = 0; i < 120 && !await c.evaluate('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")'); i++) await wait(250)
  assert.ok(await c.evaluate('!!window.__MOSPEADA__'), 'Scene loaded')
  await c.evaluate(`window.__MOSPEADA__.reset('highway'); window.__MOSPEADA__.runtime.cameraMode=1;
    window.__rideSamples=[]; clearInterval(window.__rideTimer);
    window.__rideTimer=setInterval(()=>window.__rideSamples.push(window.__MOSPEADA__.snapshot()),100)`)
  await wait(800); await screenshot('parked-side')
  const before = await snapshot()
  await key('KeyW', true); await wait(3500)
  const accelerating = await snapshot(); await screenshot('accelerating')
  await key('KeyW', false)
  assert.ok(accelerating.distance > 4 && accelerating.speed > 3, 'Keyboard throttle moves the bike')
  await key('KeyA', true); await wait(900)
  const turning = await snapshot(); await screenshot('turning')
  assert.ok(Math.abs(turning.lean) > 0.05, 'Progressive lean is visible')
  await key('KeyA', false); await key('KeyD', true); await wait(650); await key('KeyD', false)
  const reversingSteer = await snapshot()
  await key('KeyS', true); await wait(1800)
  const braking = await snapshot(); await screenshot('braking')
  await key('KeyS', false)
  assert.ok(braking.speed < accelerating.speed * 0.5, 'Hard braking reduces speed')
  const scenarios = {}
  for (const name of ['slope', 'rough']) {
    await c.evaluate(`window.__MOSPEADA__.reset('${name}'); window.__MOSPEADA__.runtime.cameraMode=1`)
    await key('KeyW', true); await wait(2500); await key('KeyW', false)
    scenarios[name] = await snapshot(); await screenshot(name)
    assert.ok(Number.isFinite(scenarios[name].height), name + ' remains finite')
  }
  const samples = await c.evaluate('clearInterval(window.__rideTimer); window.__rideSamples')
  const max = field => Math.max(...samples.filter(s => !field.includes('ContactError') || s[field.startsWith('front') ? 'frontGrounded' : 'rearGrounded']).map(s => Math.abs(s[field] || 0)))
  assert.ok(max('frontContactError') < 0.04, 'Front contact remains within 4 cm over the real scene')
  assert.ok(max('rearContactError') < 0.04, 'Rear contact remains within 4 cm over the real scene')
  assert.ok(Math.max(...samples.flatMap(s => s.handErrors)) < 0.05, 'Hands keep their grip targets')
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' && e.params.timestamp > began).map(e => e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  const report = {
    before, accelerating, turning, reversingSteer, braking, scenarios,
    samples: samples.length, maxLean: max('lean'), maxFrontTravel: max('frontTravel'), maxRearTravel: max('rearTravel'),
    maxFrontContactError: max('frontContactError'), maxRearContactError: max('rearContactError'),
    maxHandError: Math.max(...samples.flatMap(s => s.handErrors)), errors,
  }
  fs.writeFileSync(`${directory}/browser-validation.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, before: undefined, accelerating: accelerating.speed, turning: turning.lean, reversingSteer: reversingSteer.steer, braking: braking.speed, scenarios: Object.fromEntries(Object.entries(scenarios).map(([name, s]) => [name, { speed: s.speed, pitch: s.pitch, frontTravel: s.frontTravel, rearTravel: s.rearTravel }])) }, null, 2))
  await c.evaluate(`window.__MOSPEADA__.reset('highway'); window.__MOSPEADA__.runtime.cameraMode=0`)
} finally { await c.evaluate('clearInterval(window.__rideTimer)').catch(() => {}); c.close() }
