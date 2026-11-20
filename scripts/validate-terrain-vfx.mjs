import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { connect } from './browser-cdp.mjs'
const c = await connect(), dir = 'artifacts/terrain-vfx', wait = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(dir, { recursive: true })
async function until(expression) { for (let i=0;i<600;i++) { if(await c.evaluate(expression).catch(()=>false))return;await wait(200) }throw Error('Timeout: '+expression) }
async function capture(name) { await wait(300);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64')) }
async function view(position=[2.9,1.25,-3.5],target=[0,.7,-.3]) { await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(target)})));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`) }
async function setup(start,speed=0,clear=true) { await c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState(${JSON.stringify(start)},d.rig.metrics,d.sample);const s=d.runtime.state;s.speed=${speed};s.idleBlend=${speed===0?1:0};s.parked=${speed===0};s.frontAngularSpeed=s.speed/d.rig.metrics.frontRadius;s.rearAngularSpeed=s.speed/d.rig.metrics.rearRadius;d.runtime.paused=true;d.rig.update(s,d.sample,d.config);__CYCLONE_WEATHERING__.effect.contacts.update(s);if(${clear})for(const ps of fx.vfx.renderer.systemToBatchIndex.keys())ps.restart()})()`) }
async function simulate(seconds,input={},advance=true) {
  return c.evaluate(`(async()=>{const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,w=__CYCLONE_WEATHERING__.effect,sc=__SCOTT_ORIGINAL__,{advanceBike}=await import('/src/vehicle/bikePhysics.js'),{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js'),{evolveSoil}=await import('/src/vehicle/weatheringModel.js'),{evolveScottSoil}=await import('/src/vehicle/scottSoilModel.js');const s=d.runtime.state,before={...fx.ejecta.emitted};for(let i=0;i<${Math.ceil(seconds*60)};i++){if(${advance})advanceBike(s,${JSON.stringify(input)},1/60,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);const wheels=w.contacts.update(s);if(i%6===0){updateScottGameplay(sc.instance,sc.authored,[...sc.source.animations,...sc.authored.clips],d.runtime,sc.wrapper.current,0);evolveSoil(w.load,wheels,s,w.store||__CYCLONE_WEATHERING__.store.snapshot(),1,.1,d.rig.metrics,fx.store.snapshot().humidity);evolveScottSoil(w.scottLoad,w.scottLayer.sampleBody(),wheels,s,__CYCLONE_WEATHERING__.store.snapshot(),1,fx.store.snapshot().humidity,.1)}fx.ejecta.prepare(1/60,wheels,s,fx.store.snapshot(),1,4,1,1/60);fx.dust.update(1/60,wheels.rear,s,fx.store.snapshot(),4,1,1/60,fx.vfx)}w.layer.update(w.load,__CYCLONE_WEATHERING__.store.snapshot());w.scottLayer.update(w.scottLoad,__CYCLONE_WEATHERING__.store.snapshot());return{emitted:Object.fromEntries(Object.entries(fx.ejecta.emitted).map(([k,v])=>[k,v-before[k]])),active:fx.ejecta.systems.reduce((n,p)=>n+p.particleNum,0),surfaces:Object.fromEntries(Object.entries(w.contacts.wheels).map(([k,v])=>[k,v.surface])),bike:{...w.load},scott:{...w.scottLoad},bounces:fx.ejecta.bounces,speed:s.speed,mode:s.riderMode}})()`)
}
try {
  await until('!!window.__MOSPEADA_VFX__ && !!__CYCLONE_WEATHERING__.effect.scottLayer && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  assert.equal(await c.evaluate('__ANIME__.state.snapshot().error'),'')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA_VFX__.store.reset();__MOSPEADA_VFX__.store.set({humidity:.85});__CYCLONE_WEATHERING__.store.reset();__CYCLONE_WEATHERING__.store.cleanBoth();__ANIME__.state.set({mode:"ANIME"})')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'n',code:'KeyN'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'n',code:'KeyN'})
  const report={},road={x:65,z:-78.25,yaw:-Math.PI/2},dirt={x:16,z:-180,yaw:Math.PI}
  await setup(road);report.asphalt=await simulate(2.3,{throttle:1});await view();await capture('01-asphalt-water')
  assert.ok(report.asphalt.emitted.water>20);assert.equal(report.asphalt.emitted.mud+report.asphalt.emitted.earth,0)
  report.waterPixels=await c.evaluate(`(()=>{const a=__ANIME__,b=__MOSPEADA_VFX__.ejecta.records.find(r=>r.type==='water').batch,g=a.renderer.getContext(),read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p};b.visible=true;a.effect.render({...a.state.snapshot(),mode:'ANIME',compare:false},1);const on=read();b.visible=false;a.effect.render({...a.state.snapshot(),mode:'ANIME',compare:false},1);const off=read();let n=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])n++;b.visible=true;return n})()`)
  assert.ok(report.waterPixels>50,'Fine water must be visible against the wet road')
  await setup(road,22);report.asphaltSkid=await simulate(.5,{handbrake:true,steer:1});await view();await capture('02-asphalt-skid')
  assert.ok(report.asphaltSkid.emitted.water>0)
  await setup({x:50,z:-83.2,yaw:Math.PI},10);report.mixed=await simulate(.6,{},false);await view();await capture('03-mixed-contacts')
  assert.deepEqual(report.mixed.surfaces,{front:'dirt',rear:'asphalt'});assert.ok(report.mixed.emitted.water>0&&report.mixed.emitted.mud>0)
  await setup(dirt);report.mud=await simulate(2.3,{throttle:1});await view();await capture('04-mud-acceleration')
  assert.ok(report.mud.emitted.mud>report.mud.emitted.earth&&report.mud.emitted.water===0)
  await setup(dirt,18);report.mudSkid=await simulate(.5,{handbrake:true,steer:1});await view();await capture('05-mud-skid')
  // Accelerate only the deposition clock on a held real pose/contact for a
  // readable dirt inspection. Particle and driving clocks remain untouched.
  report.accumulated=await c.evaluate(`(async()=>{const d=__MOSPEADA__,w=__CYCLONE_WEATHERING__.effect,c=__CYCLONE_WEATHERING__.store.snapshot(),{evolveSoil}=await import('/src/vehicle/weatheringModel.js'),{evolveScottSoil}=await import('/src/vehicle/scottSoilModel.js');for(let i=0;i<250;i++){evolveSoil(w.load,w.contacts.wheels,d.runtime.state,c,1,.1,d.rig.metrics,.85);evolveScottSoil(w.scottLoad,w.scottLayer.sampleBody(),w.contacts.wheels,d.runtime.state,c,1,.85,.1)}return{bike:{...w.load},scott:{...w.scottLoad}}})()`)
  assert.ok(report.accumulated.scott.bootsMud>report.accumulated.scott.torsoMud)
  await setup(road,12);report.returnRoad=await simulate(1,{},false);await view();await capture('06-return-asphalt-dirty')
  assert.ok(report.returnRoad.scott.bootsMud>report.accumulated.scott.bootsMud*.98)
  await setup(road);report.stopped=await simulate(1,{},false);await view([2.6,1,.2],[0,.8,0]);await capture('07-inspection-anime')
  await c.evaluate('__ANIME__.state.set({mode:"PBR"})');await capture('08-inspection-pbr');await c.evaluate('__ANIME__.state.set({mode:"ANIME"})')
  // Freeze identical geometry and compare only Scott's material dirt uniform.
  report.scottPixels=await c.evaluate(`(()=>{const a=__ANIME__,w=__CYCLONE_WEATHERING__.effect,g=a.renderer.getContext(),read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p},out={};for(const mode of['PBR','ANIME']){w.scottLayer.uniforms.uSoilEnabled.value=1;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const dirty=read();w.scottLayer.uniforms.uSoilEnabled.value=0;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const clean=read();w.scottLayer.uniforms.uSoilEnabled.value=1;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const restored=read();let changed=0,returned=0;for(let i=0;i<dirty.length;i+=4){if(dirty[i]!==clean[i]||dirty[i+1]!==clean[i+1]||dirty[i+2]!==clean[i+2])changed++;if(dirty[i]!==restored[i]||dirty[i+1]!==restored[i+1]||dirty[i+2]!==restored[i+2])returned++}out[mode]={changed,returned}}return out})()`)
  for(const v of Object.values(report.scottPixels))assert.ok(v.changed>100&&v.returned===0)
  await c.evaluate('__MOSPEADA__.runtime.paused=false')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF'})
  await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});await wait(1000)
  report.walking=await c.evaluate('({mode:__MOSPEADA__.runtime.state.riderMode,clip:__SCOTT_ORIGINAL__.instance.clip,load:{...__CYCLONE_WEATHERING__.effect.scottLoad}})')
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});await c.evaluate('__MOSPEADA__.runtime.paused=true')
  await capture('09-scott-walking-dirty');assert.ok(/walk/i.test(report.walking.clip)&&report.walking.load.bootsMud>0)
  await c.openSettings('VFX · terreno')
  await until('!![...document.querySelectorAll("button")].find(b=>b.textContent==="Ensuciar ambos")')
  await c.evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Ensuciar ambos").click()');await wait(350)
  await capture('10-dirty-controls')
  assert.ok(await c.evaluate('__CYCLONE_WEATHERING__.effect.scottLoad.bootsMud>.5&&__CYCLONE_WEATHERING__.effect.load.frontMud>.5'))
  await c.evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Limpiar ambos").click()');await wait(350)
  assert.ok(await c.evaluate('Object.values(__CYCLONE_WEATHERING__.effect.load).every(v=>v===0)&&Object.values(__CYCLONE_WEATHERING__.effect.scottLoad).every(v=>v===0)'))
  report.integrity=await c.evaluate('({gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error,bones:__SCOTT_ORIGINAL__.instance.bones.size,clips:__SCOTT_ORIGINAL__.source.animations.length,batches:__MOSPEADA_VFX__.vfx.renderer.batches.length,systems:__MOSPEADA_VFX__.vfx.renderer.systemToBatchIndex.size,legacy:!!__MOSPEADA__.scene.getObjectByName("Cyclone_wheel_spray")})')
  assert.equal(report.integrity.gl,0);assert.equal(report.integrity.shader,'');assert.equal(report.integrity.bones,24);assert.equal(report.integrity.clips,16);assert.equal(report.integrity.batches,5);assert.equal(report.integrity.systems,11);assert.equal(report.integrity.legacy,false)
  const baseline=JSON.parse(fs.readFileSync('artifacts/terrain-vfx/preserved-dust.json','utf8'))
  report.dustPreserved=Object.entries(baseline).every(([path,hash])=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')===hash);assert.equal(report.dustPreserved,true)
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
} finally {
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'}).catch(()=>{})
  await c.evaluate('document.querySelector(".ride-settings-heading button")?.click();__CYCLONE_WEATHERING__.store.cleanBoth();__MOSPEADA_VFX__.store.reset();__ANIME__.state.set({mode:"ANIME"});__MOSPEADA__.reset("highway")').catch(()=>{});c.close()
}
