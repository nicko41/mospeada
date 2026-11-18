import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c = await connect(), directory = 'artifacts/driving/actions'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  const report = await c.evaluate(`(()=>{
    const e=__ANIME__.effect,b=e.brush,store=b.store;
    store.set({enabled:true,automatic:true,speed:1,slow:false});
    const programs=__ANIME__.renderer.info.programs.length;
    const results=[0,5,25,45,70].map(speed=>{
      b.playing=false;b.manual=false;b.held=false;b.wait=1;b.progress=0;b.pauseVariation=1;
      b.lastPlay=store.snapshot().playRequest;b.lastScrub=store.snapshot().scrubRequest;
      let strokes=0,previous=false;
      for(let i=0;i<2400;i++){b.tick(1/120,true,1,speed);if(b.playing&&!previous)strokes++;previous=b.playing}
      return{speedKmh:speed*3.6,strokesIn20Seconds:strokes,pauseSeconds:b.pauseSeconds};
    });
    return{cadence:results,programsBefore:programs,programsAfter:__ANIME__.renderer.info.programs.length,panels:b.attachments.size};
  })()`)
  assert.equal(report.cadence[0].strokesIn20Seconds, 0)
  for (let i = 1; i < report.cadence.length; i++) assert.ok(report.cadence[i].strokesIn20Seconds > report.cadence[i - 1].strokesIn20Seconds)
  assert.ok(report.cadence.at(-1).pauseSeconds < 0.06)
  assert.equal(report.programsAfter, report.programsBefore)
  await c.evaluate(`(()=>{
    const d=__MOSPEADA__,b=__ANIME__.effect.brush;d.reset('highway');d.runtime.paused=true;d.setCameraMode(3);
    const s=d.runtime.state;s.speed=70;s.idleBlend=0;d.rig.update(s,d.sample,d.config);
    d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0,1,0)));
    d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(2.7,1.8,.4)));d.runtime.orbit.update();
    __ANIME__.state.set({mode:'ANIME'});b.playing=false;b.manual=false;b.held=false;b.wait=0;b.progress=0;
    b.tick(0,true,1,70);b.tick(.38,true,1,70);
  })()`)
  await wait(350)
  fs.writeFileSync(directory + '/speed-brush.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  report.stopped = await c.evaluate(`(()=>{const s=__MOSPEADA__.runtime.state,b=__ANIME__.effect.brush;s.speed=0;b.tick(1/120,true,1,0);return{playing:b.playing,progress:b.uniforms.uBrushProgress.value}})()`)
  assert.equal(report.stopped.playing, false); assert.equal(report.stopped.progress, -1)
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/speed-brush-validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.evaluate(`__ANIME__.effect.brush.store.reset();__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
