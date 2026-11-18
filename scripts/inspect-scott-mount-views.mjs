import fs from 'node:fs'
import { connect } from './browser-cdp.mjs'
const c = await connect(), wait = ms => new Promise(r => setTimeout(r, ms)), directory = 'artifacts/scott-mount-rebuild'
try {
  await c.send('Page.bringToFront'); await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.reload', { ignoreCache: true })
  await wait(300)
  for (let i = 0; i < 500; i++) { if (await c.evaluate('!!window.__SCOTT_ORIGINAL__?.authored.data.rightLegCorrection && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(() => false)) break; await wait(200) }
  for (const [view, position] of [['side', [3.3, 1.4, .2]], ['rear', [.2, 1.45, -3.3]]]) for (const [label, time] of [['stand', 0], ['prepare', .55], ['lift', 1.12], ['cross-mid', 1.42], ['cross', 1.72], ['sit-mid', 2.15], ['ride', 2.5]]) {
    await c.evaluate(`__SCOTT_ORIGINAL__.playback.select('Cyclone_Mount');__SCOTT_ORIGINAL__.playback.scrub(${time}/2.5)`)
    for (let i = 0; i < 100; i++) { if (await c.evaluate('__SCOTT_ORIGINAL__.instance.lastSeek===__SCOTT_ORIGINAL__.playback.snapshot().seekRequest')) break; await wait(100) }
    await c.evaluate(`(()=>{const d=__MOSPEADA__,b=d.rig.body,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(b.localToWorld(v.set(0,1.0,-.15)));d.camera.position.copy(b.localToWorld(v.fromArray(${JSON.stringify(position)})));d.runtime.orbit.update()})()`)
    await wait(150)
    fs.writeFileSync(`${directory}/${view}-${label}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  console.log(await c.evaluate('({clip:__SCOTT_ORIGINAL__.instance.clip,scale:__MOSPEADA__.rig.presentationScale,error:__ANIME__.state.snapshot().error})'))
} finally { await c.evaluate('__SCOTT_ORIGINAL__.playback.select("Cyclone_RidingPose")').catch(() => {}); c.close() }
