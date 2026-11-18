import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c = await connect(), wait = ms => new Promise(r => setTimeout(r, ms)), directory = 'artifacts/scott-right-leg-roll'
async function ready(expression) { for (let i = 0; i < 500; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(150) } throw Error('Scott playback is not ready') }
async function select(clip, progress) {
  await c.evaluate(`__SCOTT_ORIGINAL__.playback.select(${JSON.stringify(clip)});__SCOTT_ORIGINAL__.playback.scrub(${progress})`)
  await ready(`__SCOTT_ORIGINAL__.instance.clip===${JSON.stringify(clip)}&&__SCOTT_ORIGINAL__.instance.lastSeek===__SCOTT_ORIGINAL__.playback.snapshot().seekRequest`)
}
async function shot(name, position) {
  await c.evaluate(`(()=>{const d=__MOSPEADA__,b=d.rig.body,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(b.localToWorld(v.set(0,1,-.15)));d.camera.position.copy(b.localToWorld(v.fromArray(${JSON.stringify(position)})));d.runtime.orbit.update()})()`)
  await wait(150)
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
try {
  await c.send('Page.bringToFront'); await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.reload', { ignoreCache: true }); await wait(300)
  await ready('!!window.__SCOTT_ORIGINAL__?.authored.data.rightLegCorrection && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  const report = await c.evaluate(`(()=>{const d=__SCOTT_ORIGINAL__;let m;d.source.scene.traverse(n=>{if(n.isSkinnedMesh)m=n});return{correction:d.authored.data.rightLegCorrection,bikeScale:__MOSPEADA__.rig.presentationScale,originalClips:d.source.animations.length,bones:d.instance.bones.size,originalGeometry:d.instance.skins[0].mesh.geometry===m.geometry,originalWeights:d.instance.skins[0].mesh.geometry.attributes.skinWeight===m.geometry.attributes.skinWeight,startupGL:__ANIME__.renderer.getContext().getError()}})()`)
  assert.equal(report.correction.sourceClip, 'Roll_Dodge_4'); assert.equal(report.correction.rightLegIK, false)
  assert.equal(report.originalClips, 16); assert.equal(report.bones, 24); assert.ok(report.originalGeometry && report.originalWeights)
  for (const clip of ['Cyclone_Mount', 'Cyclone_Dismount']) for (const [label, mountTime] of [['entry', .85], ['fold', 1.3], ['exit', 1.95]]) {
    await select(clip, (clip === 'Cyclone_Mount' ? mountTime : 2.5 - mountTime) / 2.5)
    await shot(`${clip}-${label}-side`, [3.3, 1.4, .2]); await shot(`${clip}-${label}-rear`, [.2, 1.45, -3.3])
  }
  // Compare the actual local bone values displayed by the game with the GLB.
  await select('Cyclone_Mount', 1.3 / 2.5)
  report.localPoseError = await c.evaluate(`(()=>{const d=__SCOTT_ORIGINAL__,r=d.authored.data.rightLegCorrection,t=1.3,x=(t-r.raised)/(r.crossed-r.raised),u=x*x*(3-2*x),sourceTime=2.18+(2.22-2.18)*u,clip=d.source.animations.find(c=>c.name==='Roll_Dodge_4');let error=0;for(const name of r.localBones){const original=clip.tracks.find(t=>t.name===name+'.quaternion').createInterpolant().evaluate(sourceTime),actual=d.instance.bones.get(name).quaternion.toArray();for(let i=0;i<4;i++)error=Math.max(error,Math.abs(actual[i]-original[i]))}return error})()`)
  // The independent clip is sampled at 60 Hz, with quaternion interpolation
  // between those keys; this tolerance covers that resampling, not extra IK.
  assert.ok(report.localPoseError < .0001)
  await select('Cyclone_Mount', 1)
  await c.evaluate('__SCOTT_ORIGINAL__.playback.step(-1)'); await wait(300)
  report.frameStep = await c.evaluate('__SCOTT_ORIGINAL__.instance.action.time')
  assert.ok(Math.abs(report.frameStep - (2.5 - 1 / 60)) < .001)
  await select('Cyclone_RidingPose', 0)
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyF', key: 'f' }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyF', key: 'f' })
  await ready('__SCOTT_ORIGINAL__.instance.clip==="Cyclone_Dismount"'); report.fKey = true
  await select('Cyclone_RidingPose', 0)
  await c.evaluate('__ANIME__.state.set({mode:"anime"})'); await wait(350)
  await shot('riding-pose-unchanged-anime', [3.3, 1.4, .2])
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(`${directory}/browser-validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await c.evaluate('__SCOTT_ORIGINAL__.playback.select("Cyclone_RidingPose")').catch(() => {}); c.close() }
