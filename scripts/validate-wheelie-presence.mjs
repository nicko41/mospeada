import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/actions'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
const key = (type, code, key, modifiers = 0) => c.send('Input.dispatchKeyEvent', { type, code, key, modifiers })
async function inputReady(field, value) {
  for (let i = 0; i < 50; i++) {
    if (await c.evaluate(`__MOSPEADA__.runtime.input.${field}===${JSON.stringify(value)}`)) return
    await wait(100)
  }
  throw Error('Input did not reach the simulation: ' + field)
}
const report = {}
try {
  await c.send('Page.bringToFront')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  for (let i = 0; i < 240; i++) {
    if (await c.evaluate('!!window.__MOSPEADA__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(() => false)) break
    await wait(250)
  }
  report.startupGLError = await c.evaluate('__ANIME__.renderer.getContext().getError()')
  await c.evaluate(`__MOSPEADA__.reset('highway');__MOSPEADA__.runtime.paused=true;Object.assign(__MOSPEADA__.runtime.state,{speed:8,parked:false,idleBlend:0});window.__ACTION_TEST__={}`)
  await key('keyDown', 'ControlLeft', 'Control', 2); await inputReady('wheelie', true)
  report.wheelie = await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,s=d.runtime.state;
    const input={...d.runtime.input};
    for(let i=0;i<480;i++)advanceBike(s,input,1/120,d.rig.metrics,d.sample);
    d.rig.update(s,d.sample,d.config);__ACTION_TEST__.wheelie=structuredClone(s);
    const held={angle:s.wheelieAngle,remaining:s.wheelieRemaining,rearError:d.rig.articulation.rearContactError,frontGap:d.rig.articulation.frontContactError,hands:d.rig.arms.map(a=>a.error),legs:d.rig.legs.map(a=>a.error)};
    for(let i=0;i<480;i++)advanceBike(s,input,1/120,d.rig.metrics,d.sample);
    __ACTION_TEST__.expired=structuredClone(s);
    return{keyboardActive:input.wheelie,held,expired:{angle:s.wheelieAngle,time:s.wheelieTime,exhausted:s.wheelieExhausted,frontGrounded:s.frontGrounded,rearGrounded:s.rearGrounded}};
  })()`)
  assert.equal(report.wheelie.keyboardActive, true)
  assert.ok(report.wheelie.held.angle > 0.85 && report.wheelie.held.angle <= 0.86)
  assert.ok(Math.abs(report.wheelie.held.remaining - 2) < 1e-7)
  assert.ok(Math.abs(report.wheelie.held.rearError) < 0.01 && report.wheelie.held.frontGap > 1)
  assert.ok([...report.wheelie.held.hands, ...report.wheelie.held.legs].every(n => n < 0.025))
  assert.equal(report.wheelie.expired.angle, 0); assert.equal(report.wheelie.expired.time, 6)
  assert.equal(report.wheelie.expired.exhausted, true); assert.equal(report.wheelie.expired.frontGrounded, true)
  await key('keyUp', 'ControlLeft', 'Control'); await wait(50)
  await c.evaluate(`__MOSPEADA__.reset('highway')`)
  await key('keyDown', 'KeyF', 'f'); await key('keyUp', 'KeyF', 'f')
  await c.evaluate('__MOSPEADA__.runtime.paused=true')
  report.dismount = await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,s=d.runtime.state;
    const requested=s.riderMode;
    for(let i=0;i<60;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);
    __ACTION_TEST__.transition=structuredClone(s);
    for(let i=0;i<110;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);
    d.rig.update(s,d.sample,d.config);__ACTION_TEST__.onfoot=structuredClone(s);
    return{requested,mode:s.riderMode,blend:s.dismountBlend,position:s.pedestrian,hands:d.rig.arms.map(a=>a.onFootError),legs:d.rig.legs.map(a=>a.onFootError)};
  })()`)
  assert.ok(['stopping', 'dismounting'].includes(report.dismount.requested))
  assert.equal(report.dismount.mode, 'onFoot'); assert.equal(report.dismount.blend, 1)
  assert.ok([...report.dismount.hands, ...report.dismount.legs].every(n => n < 0.01), JSON.stringify(report.dismount))
  await key('keyDown', 'KeyW', 'w'); await inputReady('walkForward', 1)
  report.walk = await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,s=d.runtime.state;
    const input={...d.runtime.input},old={x:s.x,z:s.z,p:{...s.pedestrian}},errors=[0,0],soleMinimum=[Infinity,Infinity],soleMaximum=[-Infinity,-Infinity];
    for(let i=0;i<72;i++){
      advanceBike(s,input,1/120,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);
      for(const[j,l]of d.rig.legs.entries()){
        errors[j]=Math.max(errors[j],l.onFootError);
        if(!s.pedestrian.feet[l.side])continue;
        let clearance=Infinity;
        for(const index of l.soleContactIndices){const v=d.rig.arms[0].skin.localToWorld(d.rig.arms[0].skin.getVertexPosition(index,d.camera.position.clone()));clearance=Math.min(clearance,v.y-d.sample(v.x,v.z))}
        soleMinimum[j]=Math.min(soleMinimum[j],clearance);soleMaximum[j]=Math.max(soleMaximum[j],clearance);
      }
      if(i===40)__ACTION_TEST__.walk=structuredClone(s);
    }
    // Stop at a nearby point, with both feet settling into the standing pose.
    for(let i=0;i<2;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);
    return{keyboardActive:input.walkForward===1,bikeMovement:Math.hypot(s.x-old.x,s.z-old.z),distance:Math.hypot(s.pedestrian.x-old.p.x,s.pedestrian.z-old.p.z),errors,soleMinimum,soleMaximum};
  })()`)
  assert.equal(report.walk.keyboardActive, true); assert.equal(report.walk.bikeMovement, 0)
  assert.ok(report.walk.distance > 0.9)
  assert.ok(report.walk.errors.every(n => n < 0.015), JSON.stringify(report.walk))
  assert.ok(report.walk.soleMinimum.every(n => n > -0.005) && report.walk.soleMaximum.every(n => n < 0.015), JSON.stringify(report.walk))
  await key('keyUp', 'KeyW', 'w')
  await c.evaluate('__MOSPEADA__.runtime.paused=false')
  await key('keyDown', 'KeyF', 'f'); await key('keyUp', 'KeyF', 'f')
  await c.evaluate('__MOSPEADA__.runtime.paused=true')
  report.remount = await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,s=d.runtime.state;
    const requested=s.riderMode;
    for(let i=0;i<160;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);
    d.rig.update(s,d.sample,d.config);__ACTION_TEST__.mounted=structuredClone(s);
    return{requested,mode:s.riderMode,blend:s.dismountBlend,hands:d.rig.arms.map(a=>a.error),legs:d.rig.legs.map(a=>a.error)};
  })()`)
  assert.equal(report.remount.requested, 'mounting'); assert.equal(report.remount.mode, 'mounted')
  assert.equal(report.remount.blend, 0); assert.ok([...report.remount.hands, ...report.remount.legs].every(n => n < 0.025))

  for (const name of ['wheelie', 'expired', 'transition', 'onfoot', 'walk', 'mounted']) {
    await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.state=structuredClone(__ACTION_TEST__.${name});d.runtime.paused=true;const s=d.runtime.state;d.rig.update(s,d.sample,d.config);d.setCameraMode(3);
      d.runtime.orbit.target.set(s.x,s.height+1,s.z);d.camera.position.set(s.x-3.5,s.height+2,s.z+1.8);d.runtime.orbit.update();})()`)
    await wait(180)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    if (['wheelie', 'onfoot'].includes(name)) {
      await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await wait(200)
      fs.writeFileSync(directory + '/' + name + '-anime.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      await c.evaluate(`__ANIME__.state.set({mode:'PBR'})`)
    }
  }
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await key('keyUp', 'ControlLeft', 'Control').catch(() => {})
  await key('keyUp', 'KeyW', 'w').catch(() => {})
  await c.evaluate(`delete window.__ACTION_TEST__;__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
