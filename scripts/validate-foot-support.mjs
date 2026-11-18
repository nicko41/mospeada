import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/foot'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const reuse = process.argv.includes('--reuse')
  const origin = await c.evaluate('performance.timeOrigin')
  if (!reuse) await c.send('Page.navigate', { url: 'http://127.0.0.1:5173' })
  for (let i = 0; i < 300; i++) {
    if (await c.evaluate(`(${reuse} || performance.timeOrigin!==${origin}) && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`).catch(() => false)) break
    await wait(250)
  }
  const report = { startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  for (const name of ['stopped', 'stopped-anime', 'after-coleada']) {
    report[name] = await c.evaluate(`(async()=>{
      const d=__MOSPEADA__;d.reset('highway');d.runtime.paused=true;const s=d.runtime.state;
      if('${name}'==='after-coleada'){
        const {advanceBike}=await import('/src/vehicle/bikePhysics.js');s.speed=20;s.parked=false;s.idleBlend=0;
        for(let i=0;i<66;i++)advanceBike(s,{handbrake:true,steer:1},1/120,d.rig.metrics,d.sample);
        for(let i=0;i<360;i++)advanceBike(s,{brake:1},1/120,d.rig.metrics,d.sample);
      }else{s.idleBlend=1;s.lean=-d.config.idleLean}
      d.rig.update(s,d.sample,d.config);__ANIME__.state.set({mode:'${name === 'stopped-anime' ? 'ANIME' : 'PBR'}'});d.setCameraMode(3);
      d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(.12,.85,0)));
      d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(2.5,1.35,2.9)));d.runtime.orbit.update();
      const leg=d.rig.legs[0],skin=d.rig.arms[0].skin,ankle=leg.hand.getWorldPosition(d.camera.position.clone());
      const h=.12,dx=(d.sample(ankle.x+h,ankle.z)-d.sample(ankle.x-h,ankle.z))/(2*h),dz=(d.sample(ankle.x,ankle.z+h)-d.sample(ankle.x,ankle.z-h))/(2*h);
      const roadNormal=d.camera.position.clone().set(-dx,1,-dz).normalize();
      const soleNormal=leg.soleNormal.clone().applyQuaternion(leg.hand.getWorldQuaternion(d.rig.root.quaternion.clone()));
      let minimum=Infinity,maximum=-Infinity;
      for(const index of leg.soleIndices){const p=skin.localToWorld(skin.getVertexPosition(index,d.camera.position.clone()));const height=p.y-d.sample(p.x,p.z);minimum=Math.min(minimum,height);maximum=Math.max(maximum,height)}
      return{idle:s.idleBlend,footReachError:leg.error,minimum,maximum,heelToeHeightDifference:maximum-minimum,normalDot:soleNormal.dot(roadNormal),samples:leg.soleIndices.length,handErrors:d.rig.arms.map(a=>a.error)};
    })()`)
    const p = report[name]
    assert.ok(p.minimum > -0.01 && p.maximum < 0.045 && p.heelToeHeightDifference < 0.025, name + ': ' + JSON.stringify(p))
    assert.ok(p.normalDot > 0.999 && p.footReachError < 0.015)
    assert.ok(p.handErrors.every(e => e < 0.005))
    await wait(300)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.evaluate(`__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
