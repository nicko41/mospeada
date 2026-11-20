import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { connect } from './browser-cdp.mjs'
const c = await connect(), dir = 'artifacts/engine-vfx', wait = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expression) { for(let i=0;i<600;i++){if(await c.evaluate(expression).catch(()=>false))return;await wait(200)}throw Error('Timeout: '+expression) }
async function capture(name) { await wait(300);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64')) }
async function view(position=[4.5,1.8,-5.5],target=[0,.8,-1.8]) { await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(target)})));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`) }
const road={x:65,z:-78.25,yaw:-Math.PI/2}, crest={x:50,z:-160,yaw:0}
async function setup(start=road,speed=0,clear=true) { await c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState(${JSON.stringify(start)},d.rig.metrics,d.sample);const s=d.runtime.state;s.speed=${speed};s.idleBlend=${speed===0?1:0};s.parked=${speed===0};s.frontAngularSpeed=s.speed/d.rig.metrics.frontRadius;s.rearAngularSpeed=s.speed/d.rig.metrics.rearRadius;d.runtime.paused=true;d.rig.update(s,d.sample,d.config);__CYCLONE_WEATHERING__.effect.contacts.update(s);if(${clear}){for(const ps of fx.vfx.renderer.systemToBatchIndex.keys())ps.restart();for(const b of fx.vfx.renderer.batches)b.update();fx.engine.activity=0;fx.engine.boostLevel=0;fx.engine.clock=0;fx.engine.records.forEach(r=>r.initialized=false)}})()`) }
async function simulate(seconds,input={},advance=true,untilAir=false) {
  return c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,sc=__SCOTT_ORIGINAL__,{advanceBike}=await import('/src/vehicle/bikePhysics.js'),{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js');const s=d.runtime.state,before={...fx.engine.emitted};let frames=0;for(let i=0;i<${Math.ceil(seconds*60)};i++){if(${advance})advanceBike(s,${JSON.stringify(input)},1/60,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);const wheels=__CYCLONE_WEATHERING__.effect.contacts.update(s);fx.ejecta.prepare(1/60,wheels,s,fx.store.snapshot(),1,5,1,1/60);fx.engine.prepare(1/60,s,${JSON.stringify(input)},fx.engineStore.snapshot(),5,1,1/60);fx.dust.update(1/60,wheels.rear,s,fx.store.snapshot(),5,1,1/60,fx.vfx);if(i%6===0)updateScottGameplay(sc.instance,sc.authored,[...sc.source.animations,...sc.authored.clips],d.runtime,sc.wrapper.current,0);frames++;if(${untilAir}&&s.z>-134&&s.airborne)break}return{emitted:Object.fromEntries(Object.entries(fx.engine.emitted).map(([k,v])=>[k,v-before[k]])),records:fx.engine.records.map(r=>({id:r.id,active:r.system.particleNum,rate:r.desired,quota:r.quota,position:r.current.toArray(),direction:r.direction.toArray()})),speed:s.speed,yaw:s.yaw,height:s.height,airborne:s.airborne,grounded:[s.frontGrounded,s.rearGrounded],boostTime:s.boostTime,boostCount:s.boostCount,frames}})()`)
}
try {
  await until('!!window.__MOSPEADA_VFX__?.engine && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  assert.equal(await c.evaluate('__ANIME__.state.snapshot().error'),'')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA_VFX__.engineStore.reset();__ANIME__.state.set({mode:"ANIME"})')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'n',code:'KeyN'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'n',code:'KeyN'})
  const report={}
  await setup();report.idle=await simulate(.6,{},false);await view([1.8,1.1,-2.1],[0,.73,-.72]);await capture('01-idling-exhausts')
  await setup();report.acceleration=await simulate(2,{throttle:1});await view([2.8,1.3,-3],[0,.8,-.7]);await capture('02-acceleration-exhausts')
  assert.ok(report.acceleration.emitted.exhaust>report.idle.emitted.exhaust&&report.acceleration.emitted.boost===0)
  await setup(road,20);report.cruise=await simulate(1.5,{},false);await view();await capture('03-cruise')
  await setup(road,18);report.boost=await simulate(.48,{boost:true,throttle:1});await view([5.5,2,-6.5],[0,.8,-3]);await capture('04-boost-anime')
  assert.ok(report.boost.emitted.core>30&&report.boost.emitted.plume>50&&report.boost.boostTime>0)
  await c.evaluate('__ANIME__.state.set({mode:"PBR"})');await capture('05-boost-pbr');await c.evaluate('__ANIME__.state.set({mode:"ANIME"})')
  report.boostPixels=await c.evaluate(`(()=>{const a=__ANIME__,e=__MOSPEADA_VFX__.engine,g=a.renderer.getContext(),read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p},out={};for(const mode of['PBR','ANIME']){for(const b of e.batches)b.visible=true;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const on=read();for(const b of e.batches)b.visible=false;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const off=read();let n=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])n++;out[mode]=n}for(const b of e.batches)b.visible=true;return out})()`)
  assert.ok(report.boostPixels.PBR>300&&report.boostPixels.ANIME>300)
  report.cutoff=await simulate(.1,{brake:1});assert.equal(report.cutoff.boostTime,0)
  report.tail=await simulate(.45,{brake:1});await view([5,1.7,-6],[0,.8,-2.5]);await capture('06-emission-off-tail-persists')
  assert.equal(report.tail.emitted.boost,0);assert.ok(report.tail.records.find(r=>r.id==='plume').active>0)
  report.stopping=await simulate(.85,{brake:1});await capture('07-stopped-tail')
  assert.equal(report.stopping.speed,0)
  report.dissipated=await simulate(4,{},false);assert.equal(report.dissipated.records.find(r=>r.id==='plume').active,0)
  await setup(road,5);report.curve=await simulate(.52,{throttle:1,boost:true,steer:1});await view([5,2,-5.8],[0,.8,-2]);await capture('08-boost-turn')
  assert.ok(Math.abs(report.curve.yaw-road.yaw)>.03&&report.curve.emitted.boost>0)
  await setup(crest,25);report.takeoff=await simulate(5,{throttle:.2},true,true);assert.equal(report.takeoff.airborne,true)
  report.airBoost=await simulate(.3,{boost:true,throttle:.2});await view([4.5,2,-5.5],[0,.7,-1.5]);await capture('09-airborne-boost')
  assert.ok(report.airBoost.airborne&&report.airBoost.emitted.boost>0)
  report.worldSpace=await c.evaluate(`(()=>{const d=__MOSPEADA__,e=__MOSPEADA_VFX__.engine,p=e.records[3].system.particles[0],before=p.position.clone(),s=d.runtime.state;s.x+=3;s.yaw+=.7;d.rig.update(s,d.sample,d.config);e.prepare(0,s,{},__MOSPEADA_VFX__.engineStore.snapshot(),5,1,.016);return{particleDisplacement:p.position.distanceTo(before),emitterMoved:e.records[3].current.distanceTo(e.records[3].previous),allWorld:e.systems.every(ps=>ps.worldSpace)}})()`)
  assert.equal(report.worldSpace.particleDisplacement,0);assert.ok(report.worldSpace.emitterMoved>1&&report.worldSpace.allWorld)
  // Real keyboard event reaches the existing boost physics and the VFX hook.
  await c.evaluate('__MOSPEADA__.reset("highway");__MOSPEADA_VFX__.engine.systems.forEach(ps=>ps.restart())')
  const before=await c.evaluate('__MOSPEADA_VFX__.engine.emitted.boost')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft'})
  await until(`__MOSPEADA_VFX__.engine.emitted.boost>${before}`)
  report.shift=await c.evaluate('({boostCount:__MOSPEADA__.runtime.state.boostCount,emitted:__MOSPEADA_VFX__.engine.emitted.boost,active:__MOSPEADA_VFX__.engine.records[3].system.particleNum})')
  assert.equal(report.shift.boostCount,1)
  await c.openSettings('VFX · terreno')
  await c.evaluate('__MOSPEADA__.runtime.paused=true')
  await until('!!document.querySelector(".engine-vfx-controls")')
  await c.evaluate('document.querySelectorAll(".engine-vfx-controls").forEach(d=>d.open=true)');await capture('10-engine-controls')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'m',code:'KeyM'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'m',code:'KeyM'});await wait(2800)
  report.night=await c.evaluate(`(()=>{const a=__ANIME__,out={};for(const mode of['PBR','ANIME']){a.effect.render({...a.state.snapshot(),mode,compare:false},0);out[mode]={gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error}}return out})()`)
  for(const v of Object.values(report.night)){assert.equal(v.gl,0);assert.equal(v.shader,'')}
  report.integrity=await c.evaluate('({batches:__MOSPEADA_VFX__.vfx.renderer.batches.length,systems:__MOSPEADA_VFX__.vfx.renderer.systemToBatchIndex.size,engineBatches:__MOSPEADA_VFX__.engine.batches.size,bones:__SCOTT_ORIGINAL__.instance.bones.size,originalClips:__SCOTT_ORIGINAL__.source.animations.length,geometry:__MOSPEADA__.rig.surfaces.length,sockets:__MOSPEADA_VFX__.engine.sockets.exhausts.map(s=>({position:s.bodyPosition.toArray(),direction:s.bodyDirection.toArray()})),provisional:__MOSPEADA_VFX__.engine.sockets.provisional.toArray()})')
  assert.equal(report.integrity.batches,6);assert.equal(report.integrity.systems,13);assert.equal(report.integrity.engineBatches,3);assert.equal(report.integrity.bones,24);assert.equal(report.integrity.originalClips,16)
  const preserved=JSON.parse(fs.readFileSync(`${dir}/preserved-systems.json`,'utf8'))
  report.preserved=Object.fromEntries(Object.entries(preserved).map(([p,h])=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')===h]));assert.ok(Object.values(report.preserved).every(Boolean))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
} finally {
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft'}).catch(()=>{})
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'n',code:'KeyN'}).catch(()=>{});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'n',code:'KeyN'}).catch(()=>{})
  await c.evaluate('document.querySelector(".ride-settings-heading button")?.click();__MOSPEADA_VFX__.engineStore.reset();__MOSPEADA_VFX__.engine.systems.forEach(ps=>ps.restart());__ANIME__.state.set({mode:"ANIME"});__MOSPEADA__.reset("highway")').catch(()=>{});c.close()
}
