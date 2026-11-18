import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/rig-hybrid', began = Date.now()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms)), frames = []
async function screenshot(name) {
  await wait(200)
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
}
try {
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/rig-lab.html' })
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await wait(500)
  for (let i = 0; i < 100 && !await c.evaluate('!!window.__RIG_LAB__'); i++) await wait(150)
  for (const model of ['original', 'hybrid']) for (const pose of ['rest', 'arms', 'shoulders', 'knees', 'seated', 'driving', 'Running', 'Walking']) {
    await c.evaluate(`document.querySelector('#model').value='${model}';document.querySelector('#pose').value='${pose}';window.__RIG_LAB__.select()`)
    const state = await c.evaluate('window.__RIG_LAB__.snapshot()')
    assert.equal(state.model, model); assert.equal(state.pose, pose); assert.equal(state.bones.length, 24)
    assert.equal(state.meshes.length, model === 'hybrid' ? 19 : 1)
    assert.ok(!await c.evaluate('document.querySelector("#metrics").classList.contains("error")'))
    if (model === 'hybrid') assert.equal(state.meshes.filter(m => m.rigid).length, 17)
    await screenshot(`${model}-${pose.toLowerCase()}`)
    if (pose === 'driving' || pose === 'seated') {
      await c.evaluate('window.__RIG_LAB__.camera.position.set(3.6,1.7,.2);window.__RIG_LAB__.orbit.update()')
      await screenshot(`${model}-${pose}-side`)
    }
    frames.push(state)
  }
  await c.evaluate(`document.querySelector('#pose').value='rest';document.querySelector('#regions').checked=true;window.__RIG_LAB__.select()`)
  await screenshot('hybrid-region-map-front')
  await c.evaluate('window.__RIG_LAB__.view(true)'); await screenshot('hybrid-region-map-back')
  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown' && e.params.timestamp > began).map(e => e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length, 0)
  fs.writeFileSync(`${directory}/browser-validation.json`, JSON.stringify({ frames, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ cases: frames.length, rigidRegions: 17, bones: 24, errors }, null, 2))
  await c.evaluate(`document.querySelector('#pose').value='driving';document.querySelector('#regions').checked=false;window.__RIG_LAB__.select()`)
} finally { c.close() }
