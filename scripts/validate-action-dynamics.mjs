import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
import { createBikeState, advanceBike } from '../src/vehicle/bikePhysics.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const flat = () => 0, crest = (_x, z) => z < 5 ? 0 : z < 15 ? (z - 5) * 0.16 : z < 18 ? 1.6 : z < 28 ? 1.6 - (z - 18) * 0.16 : 0
const after = { jump: [] }
for (const speed of [20, 40, 60]) {
  const s = createBikeState({ x: 0, z: 0, yaw: 0 }, m, crest); s.speed = speed; s.parked = false
  let start = null, end = null, peak = 0, air = 0
  for (let i = 0; i < 600; i++) {
    advanceBike(s, {}, 1 / 120, m, crest); peak = Math.max(peak, s.frontAirGap, s.rearAirGap)
    if (s.airborne) { start ??= s.z; air += 1 / 120 }
    if (start !== null && s.frontGrounded && s.rearGrounded) { end = s.z; break }
  }
  assert.ok(end !== null && air > 1 && air < 1.6 && end - start < 90)
  after.jump.push({ speed, start, end, distance: end - start, air, peak })
}
const b = createBikeState({ x: 0, z: 0, yaw: 0 }, m, flat); b.speed = 100 / 3.6; b.parked = false
let pitch = 0, ticks = 0
while (b.speed > 0 && ticks < 600) { advanceBike(b, { brake: 1 }, 1 / 120, m, flat); pitch = Math.max(pitch, b.pitch); ticks++ }
after.braking = { seconds: ticks / 120, distance: b.distance, pitchDegrees: pitch * 180 / Math.PI }
const before = fs.existsSync('.local/dynamics-before.json') ? JSON.parse(fs.readFileSync('.local/dynamics-before.json')) : null
const c = await connect(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), directory = 'artifacts/driving/action'
fs.mkdirSync(directory, { recursive: true })
async function until(expression) {
  for (let i = 0; i < 300; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(250) }
  throw Error('Timed out: ' + expression)
}
async function key(code, down) {
  await c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: { Space: ' ', KeyA: 'a', ShiftLeft: 'Shift' }[code] })
}
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const origin = await c.evaluate('performance.timeOrigin')
  await c.send('Page.reload')
  await until(`performance.timeOrigin!==${origin} && !!window.__MOSPEADA__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`)
  const generated = await c.evaluate(`(async()=>{
    const {advanceBike,createBikeState}=await import('/src/vehicle/bikePhysics.js'), d=__MOSPEADA__, frames={};
    const record=(name,s)=>{frames[name]=structuredClone(s)};
    function setup(speed){d.reset('highway');d.runtime.paused=true;const s=d.runtime.state;s.speed=speed;s.parked=false;s.idleBlend=0;s.frontAngularSpeed=speed/d.rig.metrics.frontRadius;s.rearAngularSpeed=speed/d.rig.metrics.rearRadius;return s}
    function run(s,input,seconds){for(let i=0;i<Math.round(seconds*120);i++)advanceBike(s,input,1/120,d.rig.metrics,d.sample)}
    let s=setup(20);record('neutral',s);
    s=setup(100/3.6);run(s,{brake:1},.45);record('brake',s);
    s=setup(12);run(s,{boost:true,throttle:1},.2);record('boost',s);
    for(const [name,steer]of [['coleada-left',1],['coleada-right',-1]]){s=setup(15);run(s,{handbrake:true,steer},.5);record(name,s)}
    s=setup(20);for(let i=0;i<120;i++){advanceBike(s,{handbrake:true},1/120,d.rig.metrics,d.sample);if(s.slip>.025&&!frames['wag-left'])record('wag-left',s);if(s.slip<-.07&&!frames['wag-right'])record('wag-right',s)}
    d.reset('jump');d.runtime.paused=true;s=d.runtime.state;s.speed=25;s.parked=false;s.idleBlend=0;
    let peak=0,air=false;
    for(let i=0;i<120*8;i++){
      const frontContacts=s.frontLandingCount,rearContacts=s.rearLandingCount;
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      const gap=Math.max(s.frontAirGap,s.rearAirGap);if(s.z> -134&&s.airborne){air=true;if(gap>peak){peak=gap;record('jump',s)}}
      if(air&&(s.frontLandingCount>frontContacts||s.rearLandingCount>rearContacts)&&!frames['first-impact'])record('first-impact',s);
      if(air&&s.frontGrounded&&s.rearGrounded){record('landed',s);break}
    }
    window.__ACTION_FRAMES__=frames;
    return Object.fromEntries(Object.entries(frames).map(([name,s])=>[name,{speed:s.speed,pitch:s.pitch,slip:s.slip,frontImpact:s.frontImpact,rearImpact:s.rearImpact,frontGrounded:s.frontGrounded,rearGrounded:s.rearGrounded,airGap:Math.max(s.frontAirGap,s.rearAirGap)}]));
  })()`)
  assert.ok(generated.jump && generated['first-impact'] && generated.landed)
  assert.ok(generated['first-impact'].frontGrounded || generated['first-impact'].rearGrounded)
  assert.ok(Math.max(generated['first-impact'].frontImpact, generated['first-impact'].rearImpact) > 0.9)
  const model = {}
  for (const name of ['neutral', 'brake', 'boost', 'coleada-left', 'coleada-right', 'wag-left', 'wag-right', 'jump', 'first-impact', 'landed']) {
    model[name] = await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.state=structuredClone(__ACTION_FRAMES__['${name}']);d.runtime.paused=true;d.rig.update(d.runtime.state,d.sample,d.config);d.setCameraMode(3);
      const target=d.rig.root.localToWorld(d.camera.position.clone().set(0,.95,0));d.runtime.orbit.target.copy(target);
      const offset=d.camera.position.clone().set(3.4,1.35,.5).applyAxisAngle(d.camera.position.clone().set(0,1,0),d.runtime.state.travelYaw);
      d.camera.position.copy(d.rig.root.position).add(offset);d.runtime.orbit.update();
      return {frontTravel:d.rig.articulation.frontTravel,rearTravel:d.rig.articulation.rearTravel,frontError:d.rig.articulation.frontContactError,rearError:d.rig.articulation.rearContactError,
        handErrors:d.rig.arms.map(a=>a.error),forkInsertion:d.rig.frontForks.map(f=>f.state.insertion),neckZ:d.rig.body.worldToLocal(d.rig.bones.get('Neck').getWorldPosition(d.camera.position.clone())).z};})()`)
    assert.ok(model[name].handErrors.every(error => error < 0.05), name + ' wrist reach')
    if (generated[name].frontGrounded) assert.ok(Math.abs(model[name].frontError) < 0.035, name + ' front tire')
    if (generated[name].rearGrounded) assert.ok(Math.abs(model[name].rearError) < 0.035, name + ' rear tire')
    assert.ok(model[name].forkInsertion.every(insertion=>insertion>0.035))
    await wait(350)
    fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    if (name === 'boost') {
      await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await wait(350)
      fs.writeFileSync(`${directory}/boost-anime.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      await c.evaluate(`__ANIME__.state.set({mode:'PBR'})`)
    }
  }
  assert.ok(model.boost.neckZ > model.neutral.neckZ + 0.06)
  assert.ok(model.brake.neckZ > model.neutral.neckZ + 0.025)
  // Exercise the game's real input path and collision-aware simulation too.
  await c.evaluate(`{const d=__MOSPEADA__;d.reset('highway');d.runtime.state.speed=15;d.runtime.state.parked=false;d.runtime.state.idleBlend=0;d.setCameraMode(0)}`)
  await key('Space', true); await key('KeyA', true)
  await until('__MOSPEADA__.runtime.state.handbrake>.9 && Math.abs(__MOSPEADA__.runtime.state.slip)>.1')
  const keyboard = await c.evaluate('({handbrake:__MOSPEADA__.runtime.state.handbrake,slip:__MOSPEADA__.runtime.state.slip,rearAngularSpeed:__MOSPEADA__.runtime.state.rearAngularSpeed})')
  await key('Space', false); await key('KeyA', false)
  await c.evaluate(`{const d=__MOSPEADA__;d.reset('highway');d.runtime.state.speed=12;d.runtime.state.parked=false;d.runtime.state.idleBlend=0}`)
  await key('ShiftLeft', true)
  await until('__MOSPEADA__.runtime.state.boostCount===1 && __MOSPEADA__.runtime.state.boostBlend>.6')
  keyboard.boost = await c.evaluate('({count:__MOSPEADA__.runtime.state.boostCount,blend:__MOSPEADA__.runtime.state.boostBlend,pitch:__MOSPEADA__.runtime.state.pitch})')
  await key('ShiftLeft', false)
  const errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(errors.shader, ''); assert.equal(errors.gl, 0)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify({ before, after, generated, model, keyboard, errors },null,2)+'\n')
  console.log(JSON.stringify({ before, after, keyboard, errors },null,2))
} finally {
  for (const code of ['Space', 'KeyA', 'ShiftLeft']) await key(code, false).catch(()=>{})
  await c.evaluate(`delete window.__ACTION_FRAMES__;__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(()=>{})
  c.close()
}
