import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c = await connect(), wait = ms => new Promise(r => setTimeout(r, ms))
async function ready() { for (let i=0;i<500;i++) { if(await c.evaluate('!!window.__CYCLONE_WEATHERING__ && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false))return;await wait(200) }throw Error('Loading timeout') }
try {
  await ready()
  const report = await c.evaluate(`(async()=>{const d=__MOSPEADA__,w=__CYCLONE_WEATHERING__.effect,store=__CYCLONE_WEATHERING__.store,{createBikeState}=await import('/src/vehicle/bikePhysics.js'),{createSoilLoad,evolveSoil}=await import('/src/vehicle/weatheringModel.js');d.runtime.paused=true;store.reset();Object.assign(w.load,createSoilLoad());const setup=(x,z,yaw,speed)=>{const s=d.runtime.state=createBikeState({x,z,yaw},d.rig.metrics,d.sample);s.speed=speed;d.rig.update(s,d.sample,d.config);w.contacts.update(s);return s};const tick=(seconds,s)=>{const before=JSON.stringify(s);for(let i=0;i<seconds*10;i++)evolveSoil(w.load,w.contacts.wheels,s,store.snapshot(),1,.1,d.rig.metrics);if(before!==JSON.stringify(s))throw Error('Visual effect changed driving state');w.layer.update(w.load,store.snapshot());return{...w.load}};const result={};let s=setup(65,-78.25,-Math.PI/2,18);result.asphalt=tick(5,s);s=setup(16,-180,Math.PI,18);result.dirt=tick(25,s);s=setup(65,-78.25,-Math.PI/2,18);result.returnAsphalt=tick(10,s);s.speed=0;result.stopped=tick(5,s);result.legacySpray=!!d.scene.getObjectByName('Cyclone_wheel_spray');return result})()`)
  assert.ok(Object.values(report.asphalt).every(v=>v===0))
  assert.ok(report.dirt.frontMud>.25 && report.returnAsphalt.frontMud>report.dirt.frontMud*.97)
  assert.equal(report.legacySpray,false)
  await c.openSettings('Suciedad')
  await c.evaluate('__CYCLONE_WEATHERING__.store.soil()')
  await wait(400)
  report.reversibility = await c.evaluate(`(()=>{const a=__ANIME__,w=__CYCLONE_WEATHERING__.effect,g=a.renderer.getContext(),read=()=>{const b=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,b);return b},diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n},out={};for(const mode of['PBR','ANIME']){w.layer.uniforms.uSoilEnabled.value=0;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const clean=read();w.layer.uniforms.uSoilEnabled.value=1;a.effect.render({...a.state.snapshot(),mode,compare:false},1);const dirty=read();w.layer.uniforms.uSoilEnabled.value=0;a.effect.render({...a.state.snapshot(),mode,compare:false},1);out[mode]={changed:diff(clean,dirty),restored:diff(clean,read())}}w.layer.update(w.load,__CYCLONE_WEATHERING__.store.snapshot());out.gl=g.getError();return out})()`)
  for(const mode of ['PBR','ANIME']) assert.ok(report.reversibility[mode].changed>100 && report.reversibility[mode].restored===0)
  assert.equal(report.reversibility.gl,0)
  await c.evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Limpiar Cyclone").click()');await wait(350)
  assert.equal(await c.evaluate('Object.values(__CYCLONE_WEATHERING__.effect.load).every(v=>v===0)'),true)
  fs.mkdirSync('artifacts/weathering',{recursive:true});fs.writeFileSync('artifacts/weathering/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
} finally {
  await c.evaluate('document.querySelector(".ride-settings-heading button")?.click();__CYCLONE_WEATHERING__.store.clean();__CYCLONE_WEATHERING__.store.reset();__MOSPEADA__.reset("highway")').catch(()=>{});c.close()
}
