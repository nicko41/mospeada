import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/camera'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
async function photo(name) {
  await wait(250)
  fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
const view = () => c.evaluate(`(()=>{const d=__MOSPEADA__,o=d.runtime.orbit,s=d.runtime.state;return{enabled:o.enabled,mode:d.runtime.cameraMode,azimuth:o.getAzimuthalAngle(),radius:o.getDistance(),zoom:d.runtime.cameraController.radius,subjectDistance:d.camera.position.distanceTo(d.camera.position.clone().set(s.x,s.height+1,s.z)),paused:d.runtime.paused}})()`)
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  for (let i = 0; i < 600; i++) {
    if (await c.evaluate(`!!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`).catch(() => false)) break
    await wait(250)
  }
  const report = { startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  await c.evaluate(`__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0);window.dispatchEvent(new CustomEvent('ride-command',{detail:{pause:true}}))`)
  await wait(500); report.default = await view()
  assert.ok(report.default.enabled && report.default.mode === 0 && report.default.subjectDistance < 4)
  assert.equal(await c.evaluate(`document.elementFromPoint(650,480).tagName`), 'CANVAS', 'Pause must leave the view interactive')
  await photo('close-follow')
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 650, y: 480 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 440 })
  await wait(250)
  assert.ok(Math.abs((await view()).azimuth - report.default.azimuth) < .001, 'Hover must not orbit')
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 650, y: 480, button: 'left', buttons: 1, clickCount: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 440, button: 'left', buttons: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 440, button: 'left', buttons: 0, clickCount: 1 })
  await wait(250)
  assert.ok(Math.abs((await view()).azimuth - report.default.azimuth) < .001, 'Left-drag must not orbit')
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 650, y: 480, button: 'right', buttons: 2, clickCount: 1 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 440, button: 'right', buttons: 2 })
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 440, button: 'right', buttons: 0, clickCount: 1 })
  await wait(900); report.mouseLook = await view()
  assert.ok(Math.abs(report.mouseLook.azimuth - report.default.azimuth) > 0.5)
  assert.equal(report.mouseLook.mode, 0, 'Mouse look must work without V or another mode')
  await photo('mouse-look')
  await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 650, y: 480, deltaX: 0, deltaY: -400 })
  await wait(350); report.zoom = await view()
  assert.ok(report.zoom.zoom < report.mouseLook.zoom - 0.05)
  await c.evaluate(`[...document.querySelectorAll('.ride-actions button')].find(b=>b.textContent==='Recentrar').click()`)
  await wait(350); report.recentered = await view()
  assert.ok(Math.abs(report.recentered.azimuth - report.default.azimuth) < 0.05)
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{advanceBike}=await import('/src/vehicle/bikePhysics.js');d.reset('highway');d.runtime.paused=false;const s=d.runtime.state;s.speed=80;s.parked=false;s.idleBlend=0;
    for(let i=0;i<120;i++){advanceBike(s,{},1/120,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);d.runtime.cameraController.update(s,1/120)}d.runtime.paused=true})()`)
  await wait(350); report.fastFollow = await view()
  assert.ok(report.fastFollow.subjectDistance < 4.5, 'Speed must not create a large trailing gap')
  await photo('fast-follow')
  await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await photo('close-anime')
  await c.evaluate(`__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.runtime.paused=true`)
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
  await wait(350); const beforeTouch = await view()
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 350, id: 0 }] })
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 370, id: 0 }] })
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await wait(300); report.touchOrbit = await view()
  assert.ok(Math.abs(report.touchOrbit.azimuth - beforeTouch.azimuth) > 0.15)
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 350, id: 0 }, { x: 250, y: 350, id: 1 }] })
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 350, id: 0 }, { x: 280, y: 350, id: 1 }] })
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await wait(350); report.touchZoom = await view()
  assert.ok(report.touchZoom.zoom < report.touchOrbit.zoom - 0.05)
  await photo('touch-view')
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {})
  await c.evaluate(`__ANIME__.state.set({mode:'ANIME'});__MOSPEADA__.reset('highway')`).catch(() => {})
  c.close()
}
