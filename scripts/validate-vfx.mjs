import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/vfx', wait = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(directory, { recursive: true })
async function until(expression) {
  for (let i = 0; i < 500; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(200) }
  throw Error('Timed out: ' + expression)
}
async function capture(name) {
  await wait(300)
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
async function view(position = [4, 1.7, -5.5], target = [0, .7, -1.5]) {
  await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(target)})));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`)
}
const field = { x: 16, z: -180, yaw: Math.PI }, highway = { x: 65, z: -78.25, yaw: -Math.PI / 2 }
async function setup(start, speed = 0, clear = true) {
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState(${JSON.stringify(start)},d.rig.metrics,d.sample);const s=d.runtime.state;s.speed=${speed};s.parked=${speed === 0};s.idleBlend=${speed === 0 ? 1 : 0};s.frontAngularSpeed=s.speed/d.rig.metrics.frontRadius;s.rearAngularSpeed=s.speed/d.rig.metrics.rearRadius;d.runtime.paused=true;d.rig.update(s,d.sample,d.config);__CYCLONE_WEATHERING__.effect.contacts.update(s);if(${clear}){fx.dust.system.restart();fx.dust.initialized=false;fx.vfx.update(0)}})()`)
}
async function simulate(seconds, input = {}, advance = true) {
  return c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,w=__CYCLONE_WEATHERING__.effect,{advanceBike}=await import('/src/vehicle/bikePhysics.js');const s=d.runtime.state,before=fx.dust.emitted,saved=JSON.stringify(s);for(let i=0;i<${Math.ceil(seconds * 60)};i++){if(${advance})advanceBike(s,${JSON.stringify(input)},1/60,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);const rear=w.contacts.update(s).rear;fx.dust.update(1/60,rear,s,fx.store.snapshot(),5,1,1/60,fx.vfx)}return{emitted:fx.dust.emitted-before,active:fx.dust.system.particleNum,rate:fx.dust.response.rate,budget:fx.dust.response.budget,surface:w.contacts.wheels.rear.surface,speed:s.speed,slip:s.slip,unchanged:${advance}||saved===JSON.stringify(s)}})()`)
}
try {
  await until('!!window.__MOSPEADA_VFX__ && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA_VFX__.store.reset();__MOSPEADA_VFX__.store.set({humidity:0});__ANIME__.state.set({mode:"ANIME"});document.querySelector(".ride-settings-heading button")?.click()')
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN' }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN' })
  const report = { note: 'Fixed 60 Hz visual samples use the existing advanceBike implementation. Humidity samples hold the same real contact/state for direct comparison. No production physics changes.' }
  await setup(field); report.stopped = await simulate(2, {}, false); await view(); await capture('01-stopped')
  assert.equal(report.stopped.emitted, 0)
  await setup(field); report.gentle = await simulate(3, { throttle: .35 }); await view(); await capture('02-gentle')
  await setup(field); report.strong = await simulate(2.6, { throttle: 1 }); await view(); await capture('03-strong')
  assert.ok(report.strong.emitted > report.gentle.emitted && report.strong.active > 0)
  await c.evaluate('__ANIME__.state.set({mode:"PBR"})'); await capture('04-dust-pbr'); await c.evaluate('__ANIME__.state.set({mode:"ANIME"})')
  report.visiblePixels = await c.evaluate(`(()=>{const a=__ANIME__,batch=__MOSPEADA_VFX__.dust.batch,g=a.renderer.getContext(),read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p},result={};for(const mode of['PBR','ANIME']){batch.visible=true;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const on=read();batch.visible=false;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const off=read();let changed=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])changed++;result[mode]=changed}batch.visible=true;return result})()`)
  assert.ok(report.visiblePixels.PBR > 300 && report.visiblePixels.ANIME > 300)
  // A constant-speed visual sample translates the test state only, preserving
  // the full production driving implementation for all other maneuvers.
  await setup(field, 16)
  report.cruise = await c.evaluate(`(()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,s=d.runtime.state,start=fx.dust.emitted;for(let i=0;i<180;i++){s.z-=16/60;d.rig.update(s,d.sample,d.config);const wheel=__CYCLONE_WEATHERING__.effect.contacts.update(s).rear;fx.dust.update(1/60,wheel,s,fx.store.snapshot(),5,1,1/60,fx.vfx)}return{active:fx.dust.system.particleNum,emitted:fx.dust.emitted-start}})()`)
  await view(); await capture('05-cruise')
  await setup(field, 20); await simulate(1, { throttle: .35 }); report.drift = await simulate(.6, { handbrake: true, steer: 1 }); await view([4.5, 1.7, -5.2]); await capture('06-drift')
  assert.ok(Math.abs(report.drift.slip) > .1 && report.drift.emitted > 0)
  await setup(field, 22); await simulate(.6, { throttle: .2 }); report.braking = await simulate(.2, { brake: 1, steer: .6 }); await view(); await capture('07-braking')
  report.completeStop = await simulate(3, { brake: 1 }); report.afterStop = await simulate(1, {}, false); await view([4, 1.6, -4.5]); await capture('08-stopped-cloud')
  assert.equal(report.completeStop.speed, 0); assert.equal(report.afterStop.emitted, 0)
  report.dissipated = await simulate(8, {}, false); assert.equal(report.dissipated.active, 0)
  await setup(field, 12); await simulate(1, {}, false)
  report.worldSpace = await c.evaluate(`(()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,ps=fx.dust.system,p=ps.particles[0],before=p.position.clone(),s=d.runtime.state;s.x+=8;s.yaw+=1.2;d.rig.update(s,d.sample,d.config);const wheel=__CYCLONE_WEATHERING__.effect.contacts.update(s).rear;fx.dust.update(0,wheel,s,fx.store.snapshot(),5,1,1/60,fx.vfx);return{distance:p.position.distanceTo(before),worldSpace:ps.worldSpace,rootIsWorld:fx.vfx.root.parent===d.scene}})()`)
  assert.equal(report.worldSpace.distance, 0); assert.ok(report.worldSpace.worldSpace && report.worldSpace.rootIsWorld)
  await setup(highway, 16, false); report.enterAsphalt = await simulate(.2, {}, false); await view(); await capture('09-enter-asphalt')
  assert.equal(report.enterAsphalt.emitted, 0); assert.equal(report.enterAsphalt.surface, 'asphalt'); assert.ok(report.enterAsphalt.active > 0)
  report.humidity = {}
  for (const humidity of [0, .5, .9, 1]) {
    await c.evaluate(`__MOSPEADA_VFX__.store.set({humidity:${humidity}})`)
    await setup(field, 14); report.humidity[humidity] = await simulate(2, {}, false)
    await view(); await capture(`10-humidity-${humidity}`)
  }
  assert.ok(report.humidity[0].emitted > report.humidity[.5].emitted * 3)
  assert.ok(report.humidity[.9].emitted < report.humidity[0].emitted * .02); assert.equal(report.humidity[1].emitted, 0)
  assert.ok(Object.values(report.humidity).every(v => v.unchanged))
  // Exercise the actual R3F update and keyboard path as well as fixed samples.
  await c.evaluate('__MOSPEADA_VFX__.store.set({humidity:0});__MOSPEADA__.reset("rough");__MOSPEADA_VFX__.dust.system.restart()')
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' }); await wait(1600)
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' })
  report.keyboard = await c.evaluate('({active:__MOSPEADA_VFX__.dust.system.particleNum,speed:__MOSPEADA__.runtime.state.speed,emitted:__MOSPEADA_VFX__.dust.emitted})')
  assert.ok(report.keyboard.active > 0 && report.keyboard.speed > 1)
  await c.openSettings('VFX · terreno')
  await c.evaluate('__MOSPEADA__.runtime.paused=true')
  await capture('11-panel')
  assert.equal(await c.evaluate('!!document.querySelector(".vfx-settings")'), true)
  report.integrity = await c.evaluate('({batches:__MOSPEADA_VFX__.vfx.renderer.batches.length,systems:__MOSPEADA_VFX__.vfx.renderer.systemToBatchIndex.size,pooled:__MOSPEADA_VFX__.dust.system.particles.length,active:__MOSPEADA_VFX__.dust.system.particleNum,budget:__MOSPEADA_VFX__.dust.response.budget,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error,bones:__SCOTT_ORIGINAL__.instance.bones.size,legacySpray:!!__MOSPEADA__.scene.getObjectByName("Cyclone_wheel_spray")})')
  assert.equal(report.integrity.gl, 0); assert.equal(report.integrity.shader, ''); assert.equal(report.integrity.bones, 24)
  assert.equal(report.integrity.legacySpray, false); assert.equal(report.integrity.batches, 5); assert.ok(report.integrity.active <= report.integrity.budget)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' }).catch(() => {})
  await c.evaluate('document.querySelector(".ride-settings-heading button")?.click();__MOSPEADA_VFX__.store.reset();__MOSPEADA_VFX__.dust.system.restart();__ANIME__.state.set({mode:"ANIME"});__MOSPEADA__.reset("highway")').catch(() => {})
  c.close()
}
