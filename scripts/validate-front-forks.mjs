import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), began = Date.now(), directory = 'artifacts/driving'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms)), frames = []
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 120 && !await c.evaluate('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")'); i++) await wait(250)
  await c.evaluate(`window.__MOSPEADA__.reset('highway');window.dispatchEvent(new CustomEvent('ride-command',{detail:{freeCamera:true}}));window.__MOSPEADA__.runtime.paused=true;window.__forkTestHeight=window.__MOSPEADA__.runtime.state.height`)
  for (const [name, steer, heave, airborne] of [['straight', 0, 0, false], ['left', 0.52, 0, false], ['right', -0.52, 0, false], ['compressed-left', 0.52, -0.012, false], ['extended-right', -0.52, 0.028, false], ['airborne', 0.3, 0.45, true]]) {
    await c.evaluate(`{const d=window.__MOSPEADA__,s=d.runtime.state;s.steer=${steer};s.idleBlend=0;s.lean=0;s.height=window.__forkTestHeight+${heave};s.frontGrounded=s.rearGrounded=${!airborne};s.frontAirGap=s.rearAirGap=${airborne ? 0.4 : 0};
      d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0.04,0.65,0.53)));
      d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(1.20,1.03,1.32)));d.runtime.orbit.update();}`)
    await wait(400)
    const state = await c.evaluate(`window.__MOSPEADA__.rig.frontForks.map(f=>({side:f.side,...f.state,top:f.top.toArray(),fixedMountsStable:f.fixed.every((mesh,i)=>mesh.parent===window.__MOSPEADA__.rig.body&&mesh.matrix.equals(f.fixedMatrices[i]))}))`)
    for (const fork of state) {
      assert.ok(fork.fixedMountsStable)
      assert.ok(fork.topError < 1e-8 && fork.bottomError < 1e-8)
      assert.ok(fork.radialError < 0.001 && fork.insertion > 0.035)
    }
    frames.push({ name, steer, heave, airborne, forks: state })
    fs.writeFileSync(`${directory}/front-forks-${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
  }
  assert.ok(Math.abs(frames[1].forks[0].length - frames[0].forks[0].length) > 0.005)
  const errors = c.events.filter(event => event.method === 'Runtime.exceptionThrown' && event.params.timestamp > began).map(event => event.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  const report = { frames, errors, maxTopError: Math.max(...frames.flatMap(frame => frame.forks.map(f => f.topError))), maxBottomError: Math.max(...frames.flatMap(frame => frame.forks.map(f => f.bottomError))), minInsertion: Math.min(...frames.flatMap(frame => frame.forks.map(f => f.insertion))) }
  fs.writeFileSync(`${directory}/front-forks-validation.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ frames: frames.length, maxTopError: report.maxTopError, maxBottomError: report.maxBottomError, minInsertion: report.minInsertion, errors }, null, 2))
  await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.runtime.cameraMode=0;window.__MOSPEADA__.runtime.orbit.enabled=false')
} finally { c.close() }
