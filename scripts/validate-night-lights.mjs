import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving', began = Date.now()
const sharp = createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = async code => {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(3).toLowerCase() })
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase() })
}
async function until(expression) {
  for (let i = 0; i < 120; i++) { if (await c.evaluate(expression)) return; await wait(100) }
  throw Error('Timed out: ' + expression)
}
const lamps = () => c.evaluate(`(()=>{const l=window.__MOSPEADA__.rig.lighting;return {headlights:l.headlights.map(h=>({position:h.light.position.toArray(),direction:h.direction.toArray(),intensity:h.light.intensity,color:h.light.color.getHexString(),source:h.lens.userData.sourcePiece,emission:h.lens.material.emissiveIntensity,shadows:h.light.castShadow})),amber:l.amberLights.map(h=>({position:h.light.position.toArray(),direction:h.direction.toArray(),intensity:h.light.intensity,color:h.light.color.getHexString(),source:h.lens.userData.sourcePiece,emission:h.lens.material.emissiveIntensity})),emissiveSurfaces:l.luminous.length}})()`)
async function view(position, target) {
  await c.evaluate(`{const d=window.__MOSPEADA__;d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().fromArray(${JSON.stringify(target)})));d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().fromArray(${JSON.stringify(position)})));d.runtime.orbit.update()}`)
  await wait(250)
}
async function screenshot(name) {
  const bytes = Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64')
  fs.writeFileSync(`${directory}/night-lights-${name}.png`, bytes)
  return bytes
}
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await until('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")')
  await c.evaluate(`{const d=window.__MOSPEADA__;d.reset('highway');d.setCameraMode(3);d.runtime.paused=true;d.runtime.state.idleBlend=0;d.runtime.state.lean=0;d.rig.update(d.runtime.state,d.sample,d.config)}`)
  await key('KeyM')
  await until('window.__MOSPEADA__.rig.lighting.headlights.every(h=>h.light.intensity>=2399)')
  const night = await lamps()
  assert.equal(night.headlights.length, 2); assert.equal(night.amber.length, 2)
  assert.equal(night.emissiveSurfaces, 10)
  assert.ok(night.headlights.every(h => h.shadows && h.emission > 0 && h.intensity > 2000))
  assert.ok(night.amber.every(h => h.source === 'faro-yellow' && h.color === 'e7bd4b' && h.intensity > 60 && h.emission > 0))
  await view([1.9, 1.3, 3.4], [0, 0.85, 0.5]); await screenshot('front')
  await view([0.35, 1.15, 1.9], [0, 0.9, 0.75]); await screenshot('optics')
  await view([2.1, 1.25, 1.5], [0, 0.9, 0.4]); await screenshot('amber')
  await view([0, 2.4, -4.8], [0, 0.45, 12]); await screenshot('road')
  // Freeze storm flashes and compare intensities with an unchanged light count,
  // so shader recompilation and lightning cannot contaminate the A/B images.
  await c.evaluate(`{const d=window.__MOSPEADA__,l=d.rig.lighting,update=l.update,others=[],skies=[],own=new Set([...l.headlights,...l.amberLights].map(h=>h.light)),fog=d.scene.fog.color.clone();
    d.scene.traverse(n=>{if(n.isLight&&!own.has(n))others.push({light:n,intensity:n.intensity,fixed:['b5c9d5','c6d8e2'].includes(n.color.getHexString())?0:n.intensity});if(n.material?.uniforms?.uLightning)skies.push(n.material.uniforms.uLightning)});
    window.__lampMode='off';window.__lampRestore=()=>{l.update=update;others.forEach(o=>o.light.intensity=o.intensity);d.scene.fog.color.copy(fog);delete window.__lampMode};
    l.update=day=>{update(day);others.forEach(o=>o.light.intensity=o.fixed);d.scene.fog.color.set('#0b0e0f');skies.forEach(u=>u.value=0);l.amberLights.forEach(h=>{h.light.visible=true;h.light.intensity=0});l.headlights.forEach((h,i)=>{h.light.visible=true;h.light.intensity=window.__lampMode==='both'||window.__lampMode===(i===0?'left':'right')?h.nightIntensity:0})}}`)
  const samples = {}
  for (const mode of ['off', 'left', 'right', 'both']) {
    await c.evaluate(`window.__lampMode='${mode}'`); await wait(300)
    const bytes = await screenshot('beam-' + mode)
    const { data } = await sharp(bytes).extract({ left: 450, top: 360, width: 380, height: 160 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let sum = 0
    for (let i = 0; i < data.length; i += 3) sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722
    samples[mode] = sum / (data.length / 3)
  }
  assert.ok(samples.left > samples.off + 2 && samples.right > samples.off + 2, 'Each headlight must separately light the rendered road')
  assert.ok(samples.both > Math.max(samples.left, samples.right), 'Both headlights contribute light')
  await c.evaluate('window.__lampRestore();delete window.__lampRestore')
  await key('KeyN')
  await until('window.__MOSPEADA__.rig.lighting.headlights.every(h=>h.light.intensity===0)')
  const day = await lamps()
  assert.ok([...day.headlights, ...day.amber].every(h => h.intensity === 0 && h.emission === 0))
  await screenshot('day-off')
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' && e.params.timestamp > began).map(e => e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  fs.writeFileSync(`${directory}/night-lights-validation.json`, JSON.stringify({ night, day, roadLuminance: samples, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ headlights: 2, amber: 2, roadLuminance: samples, dayOff: true, errors }, null, 2))
} finally {
  await c.evaluate(`if(window.__lampRestore){window.__lampRestore();delete window.__lampRestore}window.__MOSPEADA__.reset('highway');window.__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
