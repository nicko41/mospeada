import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/landing'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const origin = await c.evaluate('performance.timeOrigin')
  await c.send('Page.reload')
  for (let i = 0; i < 300; i++) {
    if (await c.evaluate(`performance.timeOrigin!==${origin} && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`).catch(() => false)) break
    await wait(250)
  }
  const report = await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,frames={},contacts=[];
    __ANIME__.state.set({mode:'PBR'});d.reset('highway');d.runtime.paused=true;
    let s=d.runtime.state;s.speed=15;s.parked=false;s.idleBlend=0;
    frames.rest=structuredClone(s);
    s.frontSpring+=3;s.rearSpring+=3;s.height+=3;s.frontGrounded=s.rearGrounded=false;
    let contactTime=null,compression=0,rebound=0,secondCompression=0;
    for(let i=0;i<480;i++){
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      if(s.frontGrounded&&s.rearGrounded)contactTime??=i/120;
      if(contactTime===null)continue;
      if(!s.frontGrounded||!s.rearGrounded)throw Error('Wheel lost support during the chassis rebound');
      const t=i/120-contactTime,offset=(s.frontSpring-s.frontTarget+s.rearSpring-s.rearTarget)/2;
      if(offset<compression){compression=offset;frames.compression=structuredClone(s)}
      if(t>.15&&offset>rebound){rebound=offset;frames.rebound=structuredClone(s)}
      if(t>.35)secondCompression=Math.min(secondCompression,offset);
      if(i%3===0&&t<1.2){
        d.rig.update(s,d.sample,d.config);
        contacts.push({time:t,offset,front:d.rig.articulation.frontContactError,rear:d.rig.articulation.rearContactError,
          frontTravel:d.rig.articulation.frontTravel,rearTravel:d.rig.articulation.rearTravel,
          topError:Math.max(...d.rig.frontForks.map(f=>f.state.topError)),bottomError:Math.max(...d.rig.frontForks.map(f=>f.state.bottomError)),
          handError:Math.max(...d.rig.arms.map(a=>a.error))});
      }
    }
    frames.settled=structuredClone(s);
    const landingCounts=[s.frontLandingCount,s.rearLandingCount];
    d.reset('jump');s=d.runtime.state;s.speed=25;s.parked=false;s.idleBlend=0;
    let peak=0,departed=false;
    for(let i=0;i<1200;i++){
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      if(s.z> -134&&s.airborne){departed=true;const gap=Math.max(s.frontAirGap,s.rearAirGap);if(gap>peak){peak=gap;frames.jump=structuredClone(s)}}
      if(departed&&s.frontGrounded&&s.rearGrounded)break;
    }
    window.__HEAVY_LANDING_FRAMES__=frames;
    return{compression,rebound,secondCompression,landingCounts,contacts,realCrestPeak:peak,settledOffset:(frames.settled.frontSpring-frames.settled.frontTarget+frames.settled.rearSpring-frames.settled.rearTarget)/2};
  })()`)
  assert.ok(report.compression < -0.17 && report.rebound > 0.035 && report.secondCompression < -0.01)
  assert.deepEqual(report.landingCounts, [1, 1]); assert.ok(Math.abs(report.settledOffset) < 0.005)
  assert.ok(report.realCrestPeak > 3.5)
  for (const p of report.contacts) {
    assert.ok(Math.abs(p.front) < 0.025 && Math.abs(p.rear) < 0.025, JSON.stringify(p))
    assert.ok(p.topError < 1e-7 && p.bottomError < 1e-7 && p.handError < 0.05)
  }
  for (const name of ['rest', 'compression', 'rebound', 'settled', 'jump']) {
    await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.state=structuredClone(__HEAVY_LANDING_FRAMES__.${name});d.runtime.paused=true;d.rig.update(d.runtime.state,d.sample,d.config);d.setCameraMode(3);
      const p=d.runtime.state,ground=d.sample(p.x,p.z);d.runtime.orbit.target.set(p.x,ground+.95,p.z);
      const offset=d.camera.position.clone().set(3.8,1.3,.5).applyAxisAngle(d.camera.position.clone().set(0,1,0),p.yaw);d.camera.position.set(p.x,ground,p.z).add(offset);d.runtime.orbit.update()})()`)
    await wait(250)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, contacts: report.contacts.length }, null, 2))
} finally {
  await c.evaluate(`delete window.__HEAVY_LANDING_FRAMES__;__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
