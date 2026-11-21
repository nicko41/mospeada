import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), dir = 'artifacts/wheel-tracks', report = {}
fs.mkdirSync(dir, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function frames(n = 2) { return c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`) }
async function place(kind) {
  await c.evaluate(`(async()=>{
    const d=__MOSPEADA__,{forestPathX}=await import('/src/world/forest/forestSurface.js');
    let start={x:forestPathX(-18),z:-18,yaw:Math.atan2(forestPathX(-20)-forestPathX(-16),-4)};
    if(${JSON.stringify(kind)}==='grass')start={x:10,z:0,yaw:Math.PI};
    if(${JSON.stringify(kind)}==='sand'){
      const world=window.__FOREST_STAGE4__.world;
      if(!world.bound)world.bind({x:0,y:0,z:-2400});start={x:0,z:-3300,yaw:Math.PI,stage4:true};
    }
    d.runtime.resetAt(start);d.runtime.paused=true;d.runtime.state.speed=10;d.runtime.state.idleBlend=0;d.runtime.state.parked=false;
    __MOSPEADA_VFX__.tracks.clear();__MOSPEADA_VFX__.dust.clear();__MOSPEADA_VFX__.ejecta.clear();
    return true;
  })()`)
  await frames()
}
async function drive(kind) {
  return c.evaluate(`(async()=>{
    const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,{advanceBike}=await import('/src/vehicle/bikePhysics.js'),{forestPathX}=await import('/src/world/forest/forestSurface.js');
    const s=d.runtime.state,contacts=d.runtime.weathering.contacts;let maxStrength=0,cpu=0;
    for(let i=0;i<150;i++){
      const targetYaw=Math.atan2(forestPathX(s.z-6)-s.x,-6),error=Math.atan2(Math.sin(targetYaw-s.yaw),Math.cos(targetYaw-s.yaw));
      const steer=${JSON.stringify(kind)}==='dirt'||${JSON.stringify(kind)}==='mud'?Math.max(-1,Math.min(1,error*3)):0;
      advanceBike(s,{throttle:.3,steer,boost:i===125},1/60,d.rig.metrics,d.sample);
      d.rig.update(s,d.sample,d.config);const wheels=contacts.update(s);
      const surface=fx.surfaceFX.update(1/60,wheels,fx.store.snapshot(),true);
      if(${JSON.stringify(kind)}==='mud')surface.configs.front.humidity=surface.configs.rear.humidity=.9;
      const start=performance.now();fx.tracks.update(1/60,wheels,s,surface.configs,true,1);cpu+=performance.now()-start;
      maxStrength=Math.max(maxStrength,...['front','rear'].map(side=>surface.configs[side].humidity));
      fx.ejecta.prepare(1/60,surface.wheels,s,fx.store.snapshot(),0,4,1,1/60,surface.configs);
      fx.dust.update(1/60,surface.wheels.rear,s,surface.configs.rear,4,1,1/60,fx.vfx);
    }
    d.setCameraMode(3);d.runtime.orbit.target.set(s.x,s.height+.05,s.z+4);
    d.camera.position.set(s.x+4,s.height+5,s.z+9);d.runtime.orbit.update();
    return {kind:${JSON.stringify(kind)},stats:{...fx.tracks.stats},cpuMsPerUpdate:cpu/150,speed:s.speed,boostCount:s.boostCount,
      contacts:Object.fromEntries(Object.entries(contacts.wheels).map(([k,v])=>[k,{surface:v.surface,biome:v.biome,earthWeight:v.earthWeight}])),
      position:[s.x,s.height,s.z],buffers:fx.tracks.geometry.attributes.position.count,triangles:fx.tracks.geometry.drawRange.count/3};
  })()`)
}
async function capture(name) { await frames(); fs.writeFileSync(`${dir}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }

try {
  let ready = false
  for (let i = 0; i < 360; i++) {
    if (await c.evaluate('!!window.__MOSPEADA_VFX__?.tracks&&!!window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")')) { ready = true; break }
    await wait(250)
  }
  assert.ok(ready, 'Game and track renderer become ready')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  for (const kind of ['dirt', 'mud', 'grass', 'sand']) {
    await place(kind); report[kind] = await drive(kind)
    assert.ok(report[kind].stats.active > 20, `${kind} deposits persistent segments`)
    await capture(kind)
    report[kind].visiblePixels = await c.evaluate(`(()=>{
      const a=__ANIME__,mesh=__MOSPEADA_VFX__.tracks.root,g=a.renderer.getContext();
      const read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p};
      mesh.visible=true;a.effect.render(a.state.snapshot(),1);const on=read();
      mesh.visible=false;a.effect.render(a.state.snapshot(),1);const off=read();mesh.visible=true;
      let n=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])n++;return n;
    })()`)
    assert.ok(report[kind].visiblePixels > 40, `${kind} tracks are visible in the anime render`)
  }
  report.persistence = await c.evaluate(`(()=>{
    const fx=__MOSPEADA_VFX__,d=__MOSPEADA__,t=fx.tracks,before={...t.stats};
    t.update(1/60,d.runtime.weathering.contacts.wheels,d.runtime.state,{},false);
    return {before,after:{...t.stats},historyBroken:!t.history.front&&!t.history.rear};
  })()`)
  assert.equal(report.persistence.before.active, report.persistence.after.active)
  assert.ok(report.persistence.historyBroken)
  await place('dirt')
  await c.evaluate('__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.keys.KeyW=true')
  await frames(18)
  report.live = await c.evaluate('({active:__MOSPEADA_VFX__.tracks.stats.active,speed:__MOSPEADA__.runtime.state.speed})')
  assert.ok(report.live.active > 0, 'Normal gameplay frames deposit tracks through CycloneVFX')
  await c.evaluate('__MOSPEADA__.runtime.keys={}')
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 't', code: 'KeyT' })
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 't', code: 'KeyT' })
  await frames(4)
  report.transformation = await c.evaluate('({phase:__MOSPEADA__.runtime.transformEntry.phase,active:__MOSPEADA_VFX__.tracks.stats.active,broken:!__MOSPEADA_VFX__.tracks.history.front&&!__MOSPEADA_VFX__.tracks.history.rear})')
  assert.notEqual(report.transformation.phase, 'idle')
  assert.ok(report.transformation.active >= report.live.active && report.transformation.broken, 'Transformation preserves marks and breaks wheel histories')
  report.integrity = await c.evaluate('({gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error})')
  assert.equal(report.integrity.gl, 0); assert.equal(report.integrity.shader, '')
  report.errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.text)
  assert.deepEqual(report.errors, [])
  fs.writeFileSync(`${dir}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await c.evaluate('__MOSPEADA__.runtime.keys={};__MOSPEADA__.runtime.paused=true').catch(() => {}); c.close() }
