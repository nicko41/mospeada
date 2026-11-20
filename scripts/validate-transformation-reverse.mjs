// Exercise the actual R3F/physics loop, including the final boost offset.
// Earlier static seeks set actorOffset=0 and missed this regression.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/transformation-reverse',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
const expression=`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,e=f.entry,frame=f.frame,v=d.camera.position.clone(),anchor=f.effect.anchor.getWorldPosition(v).clone();let radius=0;for(const mesh of [...new Set([...d.rig.surfaces,...f.rear.parts.map(p=>p.mesh)])]){let n=mesh,visible=true;while(n){visible&&=n.visible;n=n.parent}if(!visible)continue;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const center=mesh.geometry.boundingBox.getCenter(v).applyMatrix4(mesh.matrixWorld);radius=Math.max(radius,center.distanceTo(anchor))}return{phase:e.phase,progress:f.store.snapshot().progress,pose:e.poseBlend,offset:e.actorOffset.toArray(),frameApplied:frame.applied,frameError:d.rig.root.getWorldPosition(v).sub(frame.origin).sub(frame.offset).length(),offsetError:frame.offset.distanceTo(e.actorOffset),lengths:d.rig.hydraulics.map(h=>h.state.length),radius,speed:d.runtime.state.speed,yaw:d.runtime.state.yaw,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`
async function snapshot(){
  const r=await bounded(c.evaluate(expression))
  assert.ok(r.frameError<1e-6&&r.offsetError<1e-6,JSON.stringify(r))
  assert.ok(r.lengths.every(l=>l<1.8),'Actuators must not span the old Motorcycle origin: '+JSON.stringify(r))
  assert.ok(r.radius<3.25,'Parts must remain near the rider while rebuilding: '+JSON.stringify(r))
  assert.equal(r.gl,0);assert.equal(r.shader,'')
  if(Math.hypot(...r.offset)>.01)assert.equal(r.frameApplied,true)
  rows.push(r);return r
}
async function until(predicate,timeout=45000){
  const end=Date.now()+timeout
  while(Date.now()<end){const r=await snapshot();if(predicate(r))return r;await wait(60)}
  throw Error('Actual animation did not reach the requested phase')
}
async function keyT(){await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'t',code:'KeyT'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'t',code:'KeyT'})}
async function pause(){await c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.pause();true');await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))}
async function resume(){await c.evaluate('__FRONT_BATTLOID__.entry.resume();__MOSPEADA__.runtime.keys.KeyW=true;__MOSPEADA__.runtime.paused=false;true')}
async function capture(name){
  for(const [view,offset]of[['side',[3.7,.55,.2]],['rear',[.9,.6,-3.9]]]){
    await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`))
    await wait(120);fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
  }
}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.frame && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__FRONT_BATTLOID__.entry.reset();__MOSPEADA__.reset("highway");__MOSPEADA__.runtime.state.speed=28;__MOSPEADA__.runtime.state.parked=false;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.keys.KeyW=true;__MOSPEADA__.runtime.paused=false;true')
  await keyT();const start=await until(r=>r.phase==='complete')
  assert.ok(Math.hypot(...start.offset)>7)
  await pause();await capture('armor-after-boost')
  await keyT();await c.evaluate('__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.keys.KeyW=true;true')
  for(const [name,target]of[['reverse-095',.95],['reverse-085',.85],['reverse-065',.65],['reverse-045',.45],['reverse-020',.2]]){
    const r=await until(r=>r.phase==='reversing'&&r.progress<=target)
    assert.ok(r.speed>1,'Reconstruction is checked while riding')
    await pause();await snapshot();await capture(name);await resume()
  }
  await until(r=>r.phase==='idle');await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await capture('restored-motorcycle')
  // Reverse again before the final impulse has finished, preserving its
  // partial displacement rather than testing only the completed endpoint.
  await c.evaluate('__MOSPEADA__.runtime.keys.KeyW=true;__MOSPEADA__.runtime.paused=false;true');await keyT()
  await until(r=>r.phase==='armorboost'&&Math.hypot(...r.offset)>1)
  await keyT();await until(r=>r.phase==='reversing'&&r.progress<.85);await pause();await capture('partial-boost-reverse');await resume()
  const end=await until(r=>r.phase==='idle');assert.equal(end.progress,0);assert.equal(Math.hypot(...end.offset),0);assert.equal(end.frameApplied,false)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/live-validation.json',JSON.stringify(rows,null,2)+'\n')
  console.log(JSON.stringify({samples:rows.length,maxFrameError:Math.max(...rows.map(r=>r.frameError)),maxHydraulicLength:Math.max(...rows.flatMap(r=>r.lengths)),maxAssemblyRadius:Math.max(...rows.map(r=>r.radius)),fullAndPartialBoostReversed:true,restored:true},null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
