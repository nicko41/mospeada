import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/wheelie-impact'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  await c.send('Page.bringToFront')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 240; i++) {
    if (await c.evaluate('!!window.__MOSPEADA__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(() => false)) break
    await wait(250)
  }
  const report = { startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  Object.assign(report, await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,frames={},contacts=[],turns=[];
    for(const[name,steer]of[['left',1],['right',-1]]){
      d.reset('highway');d.runtime.paused=true;const s=d.runtime.state;s.speed=35;s.parked=false;s.idleBlend=0;
      for(let i=0;i<240;i++)advanceBike(s,{wheelie:true,steer},1/120,d.rig.metrics,d.sample);
      d.rig.update(s,d.sample,d.config);frames[name]=structuredClone(s);
      turns.push({side:name,angle:d.rig.articulation.frontSteer,groundSteer:s.steer,lean:s.lean,hands:d.rig.arms.map(a=>a.error),legs:d.rig.legs.map(a=>a.error),rearError:d.rig.articulation.rearContactError});
    }
    d.runtime.state=structuredClone(frames.left);const s=d.runtime.state,beforeLandingCount=s.frontLandingCount;
    let contact=null,compression=0,rebound=-Infinity,dive=0;
    for(let i=0;i<300;i++){
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      if(!frames.descending&&s.wheelieAngle<.45)frames.descending=structuredClone(s);
      if(s.wheelieLandingSpeed>0){contact={time:(i+1)/120,speed:s.wheelieLandingSpeed};frames.contact=structuredClone(s)}
      const offset=s.frontSpring-s.frontTarget;
      if(contact){
        if(offset<compression){compression=offset;frames.compression=structuredClone(s)}
        dive=Math.min(dive,s.height-(s.frontTarget+s.rearTarget)/2);
        if((i+1)/120-contact.time>.15&&offset>rebound){rebound=offset;frames.rebound=structuredClone(s)}
        if(i%3===0){d.rig.update(s,d.sample,d.config);contacts.push({time:(i+1)/120,front:d.rig.articulation.frontContactError,rear:d.rig.articulation.rearContactError,frontTravel:d.rig.articulation.frontTravel,topError:Math.max(...d.rig.frontForks.map(f=>f.state.topError)),bottomError:Math.max(...d.rig.frontForks.map(f=>f.state.bottomError)),handError:Math.max(...d.rig.arms.map(a=>a.error)),legError:Math.max(...d.rig.legs.map(a=>a.error))})}
      }
    }
    frames.settled=structuredClone(s);window.__WHEELIE_IMPACT_FRAMES__=frames;
    return{turns,contact,compression,rebound,dive,landingCount:s.frontLandingCount-beforeLandingCount,contacts};
  })()`))
  assert.ok(report.turns[0].angle > 0.50 && report.turns[1].angle < -0.50)
  for (const turn of report.turns) {
    assert.ok(Math.abs(turn.groundSteer) < 0.012)
    assert.ok([...turn.hands, ...turn.legs].every(error => error < 0.025), JSON.stringify(turn))
    assert.ok(Math.abs(turn.rearError) < 0.025)
  }
  assert.ok(report.contact.time > 0.3 && report.contact.time < 0.45)
  assert.ok(report.compression < -0.14 && report.rebound > 0.025 && report.dive < -0.08)
  assert.equal(report.landingCount, 1)
  for (const point of report.contacts) {
    assert.ok(Math.abs(point.front) < 0.025 && Math.abs(point.rear) < 0.025, JSON.stringify(point))
    assert.ok(point.topError < 1e-7 && point.bottomError < 1e-7)
    assert.ok(point.handError < 0.025 && point.legError < 0.025, JSON.stringify(point))
  }
  for (const name of ['left', 'right', 'descending', 'contact', 'compression', 'rebound', 'settled']) {
    await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.state=structuredClone(__WHEELIE_IMPACT_FRAMES__.${name});d.runtime.paused=true;
      const s=d.runtime.state;d.rig.update(s,d.sample,d.config);d.setCameraMode(3);
      d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0,1,0)));
      d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(3.4,1.5,1.4)));d.runtime.orbit.update();})()`)
    await wait(220)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    if (['left', 'compression'].includes(name)) {
      await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await wait(220)
      fs.writeFileSync(directory + '/' + name + '-anime.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      await c.evaluate(`__ANIME__.state.set({mode:'PBR'})`)
    }
  }
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, contacts: report.contacts.length }, null, 2))
} finally {
  await c.evaluate(`delete window.__WHEELIE_IMPACT_FRAMES__;__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
