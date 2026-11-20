import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/front-battloid'
const report={}
async function capture(name){await wait(250);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function seek(p){await c.evaluate(`__FRONT_BATTLOID__.store.seek(${p})`);await wait(150)}
async function view(position){await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1.1,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`)}
try{
  for(let i=0;i<200;i++){if(await c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false))break;await wait(200)}
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.store.reset()')
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings();await wait(1400)
  await view([2.6,1.55,2.5]);await capture('01-motorcycle')
  await c.evaluate(`window.__FRONT_TEST_BASE__={state:JSON.stringify(__MOSPEADA__.runtime.state),bones:[...__SCOTT_ORIGINAL__.instance.bones.values()].map(b=>b.matrix.toArray()),meshes:__MOSPEADA__.rig.surfaces.map(m=>({mesh:m,geometry:m.geometry,parent:m.parent,matrix:m.matrix.toArray(),visible:m.visible}))};true`)
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'t',code:'KeyT'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'t',code:'KeyT'})
  report.key=await c.evaluate('__FRONT_BATTLOID__.store.snapshot()');assert.equal(report.key.phase,'idle');assert.equal(report.key.playing,false)
  await wait(150);assert.equal(await c.evaluate('__FRONT_BATTLOID__.store.snapshot().progress'),0)
  await seek(.5);await capture('02-midpoint')
  await seek(1);await capture('03-battloid-front');await view([2.6,1.55,-2.5]);await capture('04-battloid-rear')
  report.destination=await c.evaluate(`(()=>{const e=__FRONT_BATTLOID__.effect,inv=e.anchorWorld.clone().invert();let error=0;for(const p of e.parts){if(!p.target)continue;const m=inv.clone().multiply(p.mesh.matrixWorld);error=Math.max(error,...m.elements.map((v,i)=>Math.abs(v-p.target.elements[i])))}return{error,visible:e.parts.filter(p=>p.mesh.visible).length,total:e.parts.length}})()`)
  assert.ok(report.destination.error<1e-7)
  await c.evaluate('Object.assign(__MOSPEADA__.runtime.state,{x:68,z:-81,yaw:.8})');await wait(200)
  report.moved=await c.evaluate(`(()=>{const e=__FRONT_BATTLOID__.effect,inv=e.anchorWorld.clone().invert();return Math.max(...e.parts.filter(p=>p.target).flatMap(p=>inv.clone().multiply(p.mesh.matrixWorld).elements.map((v,i)=>Math.abs(v-p.target.elements[i]))))})()`)
  assert.ok(report.moved<1e-7)
  // Return the simulation state without changing its integration logic.
  await c.evaluate('Object.assign(__MOSPEADA__.runtime.state,JSON.parse(__FRONT_TEST_BASE__.state))');await wait(150)
  await c.openSettings('Transformación');await capture('05-controls')
  // This validator isolates mesh interpolation. The gameplay entry and its
  // gated inspection buttons are exercised by validate-transform-entry.mjs.
  await c.closeSettings();await seek(0)
  report.restoration=await c.evaluate(`(()=>{const b=__FRONT_TEST_BASE__,rig=__MOSPEADA__.rig;return{state:JSON.stringify(__MOSPEADA__.runtime.state)===b.state,bones:JSON.stringify([...__SCOTT_ORIGINAL__.instance.bones.values()].map(n=>n.matrix.toArray()))===JSON.stringify(b.bones),meshes:b.meshes.every(p=>p.mesh.geometry===p.geometry&&p.mesh.parent===p.parent&&p.mesh.visible===p.visible&&JSON.stringify(p.mesh.matrix.toArray())===JSON.stringify(p.matrix)),originalClips:__SCOTT_ORIGINAL__.source.animations.length,shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()}})()`)
  assert.deepEqual(report.restoration,{state:true,bones:true,meshes:true,originalClips:16,shader:'',gl:0})
  await view([2.6,1.55,2.5]);await capture('06-reverted')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/visual-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{
  await c.evaluate('__FRONT_BATTLOID__?.store.reset()').catch(()=>{})
  // Always terminate the isolated, muted verification browser.
  await c.send('Browser.close').catch(()=>{});c.close()
}
