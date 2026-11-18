import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/refinements'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
async function until(expression) {
  for (let i = 0; i < 600; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(250) }
  throw Error('Timed out: ' + expression)
}
async function key(code, down) { await c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code.slice(3).toLowerCase() }) }
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await until(`!!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`)
  const startupGLError = await c.evaluate('__ANIME__.renderer.getContext().getError()')
  const report = await c.evaluate(`(async()=>{
    const {advanceBike,createBikeState}=await import('/src/vehicle/bikePhysics.js');
    const {reverseFootTarget}=await import('/src/vehicle/riderMotion.js');const d=__MOSPEADA__,frames={},jump=[],road={};
    const record=(name,s)=>frames[name]=structuredClone(s);
    function setup(speed,place='highway'){d.reset(place);d.runtime.paused=true;const s=d.runtime.state;s.speed=speed;s.parked=false;s.idleBlend=0;return s}
    let s=setup(12);record('neutral',s);advanceBike(s,{boost:true,throttle:1},1/120,d.rig.metrics,d.sample);record('boost-kick',s);
    for(let i=0;i<24;i++)advanceBike(s,{throttle:1},1/120,d.rig.metrics,d.sample);record('boost-crouch',s);
    for(const speed of [8,20,40,80]){
      s=createBikeState({x:50,z:-104,yaw:0},d.rig.metrics,d.sample);s.speed=speed;s.parked=false;s.idleBlend=0;
      let peak=-Infinity,gap=0;for(let i=0;i<1200&&s.z< -20;i++){
        advanceBike(s,{},1/120,d.rig.metrics,d.sample);gap=Math.max(gap,s.frontAirGap,s.rearAirGap);
        if(s.height>peak){peak=s.height;if(speed===80)record('fast-jump',s)}
      }jump.push({speed,peak,gap});
    }
    s=setup(0);
    for(let i=0;i<600;i++){
      advanceBike(s,{brakeReverse:true},1/120,d.rig.metrics,d.sample);if(s.reverseBlend<.99)continue;
      const left=reverseFootTarget(s,'Left',d.config),right=reverseFootTarget(s,'Right',d.config);
      if(left.lift<.001&&right.lift>.04&&!frames['reverse-left-plant'])record('reverse-left-plant',s);
      if(right.lift<.001&&left.lift>.04&&!frames['reverse-right-plant'])record('reverse-right-plant',s);
    }
    for(const place of ['highway','rough']){
      s=setup(20,place);let low=Infinity,high=-Infinity,grounded=true;
      for(let i=0;i<360;i++){
        advanceBike(s,{},1/120,d.rig.metrics,d.sample);grounded&&=s.frontGrounded&&s.rearGrounded;
        if(i<90)continue;const offset=s.height-(s.frontTarget+s.rearTarget)/2;
        if(offset<low){low=offset;record(place+'-compression',s)}high=Math.max(high,offset);
      }road[place]={low,high,span:high-low,grounded,surface:s.frontContact.surface};
    }
    window.__DRIVING_REFINEMENT_FRAMES__=frames;return{jump,road};
  })()`)
  report.startupGLError = startupGLError
  for (let i = 1; i < report.jump.length; i++) assert.ok(report.jump[i].peak > report.jump[i - 1].peak + 0.25, JSON.stringify(report.jump))
  assert.equal(report.road.highway.surface, 'asphalt'); assert.equal(report.road.rough.surface, 'dirt')
  assert.ok(report.road.highway.grounded && report.road.rough.grounded)
  assert.ok(report.road.rough.span > report.road.highway.span * 2)
  report.poses = {}
  for (const name of ['neutral', 'boost-kick', 'boost-crouch', 'fast-jump', 'reverse-left-plant', 'reverse-right-plant', 'highway-compression', 'rough-compression']) {
    report.poses[name] = await c.evaluate(`(()=>{
      const d=__MOSPEADA__,r=d.rig;d.runtime.state=structuredClone(__DRIVING_REFINEMENT_FRAMES__['${name}']);d.runtime.paused=true;const s=d.runtime.state;
      r.update(s,d.sample,d.config);d.setCameraMode(3);d.runtime.orbit.target.copy(r.root.localToWorld(d.camera.position.clone().set(0,1.05,0)));
      d.camera.position.copy(r.root.localToWorld(d.camera.position.clone().set(3.4,1.65,.5)));d.runtime.orbit.update();
      const local=bone=>r.body.worldToLocal(bone.getWorldPosition(d.camera.position.clone())).toArray();
      const recoil=(s.x-r.root.position.x)*Math.sin(s.yaw)+(s.z-r.root.position.z)*Math.cos(s.yaw);
      return{hips:local(r.bones.get('Hips')),neck:local(r.bones.get('Neck')),recoil,handErrors:r.arms.map(a=>a.error),
        contact:[r.articulation.frontContactError,r.articulation.rearContactError],legs:r.legs.map(a=>({side:a.side,error:a.error,foot:a.hand.getWorldPosition(d.camera.position.clone()).toArray()}))};
    })()`)
    const p = report.poses[name]
    assert.ok(p.handErrors.every(e => e < 0.01) && p.legs.every(l => l.error < 0.02), name + ': ' + JSON.stringify(p))
    if (name !== 'fast-jump') assert.ok(p.contact.every(e => Math.abs(e) < 0.025))
    await wait(250)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  assert.ok(report.poses['boost-kick'].recoil > 0.03)
  assert.ok(report.poses['boost-kick'].hips[2] < report.poses.neutral.hips[2] - 0.005)
  assert.ok(report.poses['boost-crouch'].neck[2] > report.poses.neutral.neck[2] + 0.06)
  assert.ok(report.poses['boost-crouch'].hips[1] < report.poses.neutral.hips[1] - 0.02)
  await c.evaluate(`{const d=__MOSPEADA__;d.reset('highway');d.runtime.state.speed=15;d.runtime.state.parked=false;d.runtime.state.idleBlend=0;d.setCameraMode(0)}`)
  await key('KeyS', true)
  await until('__MOSPEADA__.runtime.state.speed<-.15 && __MOSPEADA__.runtime.state.reverseBlend>.9')
  report.keyboard = await c.evaluate('({speed:__MOSPEADA__.runtime.state.speed,phase:__MOSPEADA__.runtime.state.reversePhase,reverseBlend:__MOSPEADA__.runtime.state.reverseBlend})')
  await key('KeyS', false); await until('__MOSPEADA__.runtime.state.speed===0')
  await c.evaluate(`__MOSPEADA__.reset('highway')`); await key('KeyQ', true); await wait(350)
  assert.equal(await c.evaluate('__MOSPEADA__.runtime.state.speed'), 0); await key('KeyQ', false)
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, poses: Object.keys(report.poses) }, null, 2))
} finally {
  for (const code of ['KeyS', 'KeyQ']) await key(code, false).catch(() => {})
  await c.evaluate(`delete window.__DRIVING_REFINEMENT_FRAMES__;__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
