import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { connect } from './browser-cdp.mjs'

const c = await connect(), dir = 'artifacts/exhaust-bursts', wait = ms => new Promise(r => setTimeout(r, ms))
const report = {}
async function capture(name) { await wait(200); fs.writeFileSync(`${dir}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
async function simulate(frames, input) {
  return c.evaluate(`(async()=>{
    const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,sc=__SCOTT_ORIGINAL__,s=d.runtime.state;
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js');
    for(let i=0;i<${frames};i++){
      advanceBike(s,${JSON.stringify(input)},1/60,d.rig.metrics,d.sample); d.rig.update(s,d.sample,d.config);
      const wheels=__CYCLONE_WEATHERING__.effect.contacts.update(s);
      fx.ejecta.prepare(1/60,wheels,s,fx.store.snapshot(),1,5,1,1/60);
      fx.engine.prepare(1/60,s,${JSON.stringify(input)},fx.engineStore.snapshot(),5,1,1/60);
      fx.dust.update(1/60,wheels.rear,s,fx.store.snapshot(),5,1,1/60,fx.vfx);
      if(i%6===0)updateScottGameplay(sc.instance,sc.authored,[...sc.source.animations,...sc.authored.clips],d.runtime,sc.wrapper.current,0);
    }
    const v=d.camera.position.clone();d.setCameraMode(3);
    d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,.77,-1.05)));
    d.camera.position.copy(d.rig.root.localToWorld(v.set(2.3,1.35,-3.1)));d.runtime.orbit.update();
    return {speed:s.speed,emitted:fx.engine.movingEmitted,records:fx.engine.riding.records.map(r=>({active:r.system.particleNum,burst:r.cycle.bursts,remaining:r.cycle.remaining,power:r.cycle.power,inertia:r.inertia.toArray(),direction:r.direction.toArray()}))};
  })()`)
}
try {
  for (let i=0;i<150;i++) { if(await c.evaluate('!!window.__MOSPEADA_VFX__?.engine && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false)) break; await wait(200) }
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');
    d.runtime.paused=true;d.runtime.state=createBikeState({x:65,z:-78.25,yaw:-Math.PI/2},d.rig.metrics,d.sample);
    const s=d.runtime.state;s.speed=16;s.idleBlend=0;s.parked=false;
    d.rig.update(s,d.sample,d.config);fx.engineStore.reset();__ANIME__.state.set({mode:'ANIME'});
    fx.engine.systems.forEach(ps=>ps.restart());fx.engine.riding.records.forEach(r=>{r.cycle.reset();r.initialized=false});
    fx.engine.riding.prepare(1/60,s,{throttle:0},fx.engineStore.snapshot(),5,1,1/60);
  })()`)
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'n',code:'KeyN'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'n',code:'KeyN'})
  await wait(1200)
  report.birth=await simulate(3,{throttle:1});await capture('01-burst-birth')
  report.expansion=await simulate(4,{throttle:1});await capture('02-burst-expansion')
  report.tail=await simulate(5,{throttle:1});await capture('03-burst-tail')
  report.release=await simulate(35,{throttle:0});await capture('04-release')
  assert.ok(report.expansion.emitted>0 && report.expansion.records.some(r=>r.active>0))
  assert.ok(report.release.records.every(r=>r.active===0))
  // Capture a fresh burst in each mode and verify actual rendered pixels.
  await c.evaluate('__MOSPEADA_VFX__.engine.riding.records.forEach(r=>{r.cycle.wait=0;r.cycle.remaining=0;r.cycle.previousLoad=0})')
  report.second=await simulate(6,{throttle:1})
  for(const r of report.second.records){assert.equal(r.direction[1],0);assert.equal(r.inertia[1],0)}
  await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1,-1)));d.camera.position.copy(d.rig.root.localToWorld(v.set(4,1,-1)));d.runtime.orbit.update()})()`)
  await capture('05-horizontal-side')
  report.render=await c.evaluate(`(()=>{
    const a=__ANIME__,e=__MOSPEADA_VFX__.engine,g=a.renderer.getContext(),out={};
    const read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p};
    for(const mode of['PBR','ANIME']){e.riding.batch.visible=true;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const on=read();e.riding.batch.visible=false;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const off=read();let pixels=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])pixels++;out[mode]={pixels,gl:g.getError(),error:a.state.snapshot().error}}e.riding.batch.visible=true;return out;
  })()`)
  for(const result of Object.values(report.render)){assert.ok(result.pixels>20);assert.equal(result.gl,0);assert.equal(result.error,'')}
  await c.evaluate('__ANIME__.state.set({mode:"PBR"})');await capture('05-pbr');await c.evaluate('__ANIME__.state.set({mode:"ANIME"})')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'m',code:'KeyM'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'m',code:'KeyM'});await wait(1600);await capture('06-night')
  report.integrity=await c.evaluate('({batches:__MOSPEADA_VFX__.vfx.renderer.batches.length,systems:__MOSPEADA_VFX__.vfx.renderer.systemToBatchIndex.size,bones:__SCOTT_ORIGINAL__.instance.bones.size,clips:__SCOTT_ORIGINAL__.source.animations.length,error:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.deepEqual(report.integrity,{batches:6,systems:13,bones:24,clips:16,error:'',gl:0})
  const preserved=JSON.parse(fs.readFileSync(`${dir}/preserved-systems.json`,'utf8'))
  report.preserved=Object.fromEntries(Object.entries(preserved).map(([p,h])=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')===h]));assert.ok(Object.values(report.preserved).every(Boolean))
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
} finally { await c.evaluate('__MOSPEADA__.runtime.paused=true;__ANIME__.state.set({mode:"ANIME"})').catch(()=>{}); c.close() }
