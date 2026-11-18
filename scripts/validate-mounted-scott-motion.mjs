import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c = await connect(), directory = 'artifacts/gameplay-restored/rider', wait = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  await c.send('Page.bringToFront')
  for (let i = 0; i < 300; i++) { if (await c.evaluate('!!window.__SCOTT_ORIGINAL__?.instance.mountedMotion && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(() => false)) break; await wait(200) }
  await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,frames={};
    d.reset('highway');d.runtime.paused=true;let s=d.runtime.state;s.speed=15;s.idleBlend=0;frames.riding=structuredClone(s);
    d.reset('highway');s=d.runtime.state;s.idleBlend=1;frames.stopped=structuredClone(s);
    for(const [label,input,count]of [['wheelie',{wheelie:true},300],['boost',{throttle:1,boost:true},12],['braking',{brakeReverse:true},36],['dab-left',{handbrake:true,steer:1},66],['dab-right',{handbrake:true,steer:-1},66]]){
      d.reset('highway');s=d.runtime.state;s.speed=20;s.parked=false;s.idleBlend=0;
      for(let i=0;i<count;i++)advanceBike(s,input,1/120,d.rig.metrics,d.sample);frames[label]=structuredClone(s);
    }
    d.reset('jump');s=d.runtime.state;s.speed=25;s.parked=false;s.idleBlend=0;let peak=0,departed=false;
    for(let i=0;i<1200;i++){
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      if(s.z>-134&&s.airborne){departed=true;const gap=Math.max(s.frontAirGap,s.rearAirGap);if(gap>peak){peak=gap;frames.jump=structuredClone(s)}}
      if(departed&&s.frontGrounded&&s.rearGrounded){for(let j=0;j<90;j++){advanceBike(s,{},1/120,d.rig.metrics,d.sample);if(j===8)frames.landing=structuredClone(s)}frames.settled=structuredClone(s);break}
    }
    window.__MOUNTED_MOTION_FRAMES__=frames;
  })()`)
  const report = { startup: { gl: await c.evaluate('__ANIME__.renderer.getContext().getError()') } }
  for (const label of ['riding', 'stopped', 'boost', 'braking', 'jump', 'wheelie', 'landing', 'settled', 'dab-left', 'dab-right']) {
    await c.evaluate(`(async()=>{const d=__MOSPEADA__,a=__SCOTT_ORIGINAL__,{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js');d.runtime.state=structuredClone(__MOUNTED_MOTION_FRAMES__[${JSON.stringify(label)}]);d.rig.update(d.runtime.state,d.sample,d.config);d.runtime.paused=false;for(let i=0;i<8;i++)updateScottGameplay(a.instance,a.authored,[...a.source.animations,...a.authored.clips],d.runtime,a.wrapper.current,.1);d.runtime.paused=true})()`)
    await wait(300)
    await c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.rig,b=r.body,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(b.localToWorld(v.set(0,1,-.12)));d.camera.position.copy(b.localToWorld(v.set(${label === 'dab-right' ? -3.2 : 3.2},1.25,.15)));d.runtime.orbit.update()})()`)
    await wait(150)
    report[label] = await c.evaluate('structuredClone(__SCOTT_ORIGINAL__.instance.mountedMotion.diagnostics)')
    report[label].gl = await c.evaluate('__ANIME__.renderer.getContext().getError()')
    assert.equal(report[label].gl, 0, label + ' render error')
    assert.ok(report[label].handError < .012 && report[label].footError < .015, label + ' limb targets')
    fs.writeFileSync(`${directory}/${label}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  for (const foot of Object.values(report.riding.feet)) assert.ok(foot.sole[1] < foot.stripBottom && foot.sole[1] > foot.stripBottom - .03)
  assert.ok(report.jump.head.neckChange < .08 && report.jump.head.headChange < .12, 'Jump head follows torso with a small upward glance')
  assert.ok(report.wheelie.head.lookDown > .6 && report.wheelie.head.neckChange < .3 && report.wheelie.head.headChange < .43, 'Wheelie gaze is shared across neck and head')
  for (const foot of Object.values(report.wheelie.feet)) assert.ok(foot.toeDown > .2 && foot.toeDown <= .25)
  assert.ok(report.jump.stand > .95 && report.jump.standHeight > .15)
  for (const side of ['Left', 'Right']) {
    const distance = Math.hypot(...report.jump.feet[side].sole.map((x, i) => x - report.riding.feet[side].sole[i]))
    assert.ok(distance < .01, side + ' boot fixed on the lower support in the jump')
  }
  assert.ok(report.boost.boost > .2 && report.braking.brake > .7)
  assert.ok(report['dab-left'].feet.Left.groundBlend > .7 && report['dab-right'].feet.Right.groundBlend > .7)
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ cases: Object.keys(report), supportHeight: report.riding.feet.Right.sole[1], stripeBottom: report.riding.feet.Right.stripBottom, jumpStand: report.jump.standHeight, maxHandError: Math.max(...Object.values(report).filter(x => 'handError' in x).map(x => x.handError)), errors: report.errors }, null, 2))
} finally { await c.evaluate('delete window.__MOUNTED_MOTION_FRAMES__;__MOSPEADA__.reset("highway")').catch(() => {}); c.close() }
