import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/rear-battloid',report=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
async function capture(name){fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))}
async function view(rear=false){await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'));await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),target=f.effect.anchor.getWorldPosition(v).add(v.clone().set(0,-.4,0));d.setCameraMode(3);d.runtime.orbit.target.copy(target);d.camera.position.copy(target).add(v.set(${rear?'1.3,.6,-3.3':'3.4,.4,.2'}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(150)}
try{
  let ready=false;for(let i=0;i<160;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.rear && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await bounded(c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false}))
  await c.openSettings('Clima');await bounded(c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`));await c.closeSettings()
  await bounded(c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;true'))
  for(const [name,p]of[['covers-arrived',.48],['arms-down',.62],['legs-extending',.8],['armor-ready',1]]){
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${p});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,r=f.rear,pose=f.entry.actorPose;return{progress:f.store.snapshot().progress,arms:pose.arms,legs:pose.legs,endpointError:${p===1?'Math.max(...r.parts.filter(p=>!p.record.retract).flatMap(p=>f.effect.anchorWorld.clone().invert().multiply(p.mesh.matrixWorld).elements.map((v,i)=>Math.abs(v-p.target.elements[i]))))':'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.ok(state.endpointError<1e-7);assert.equal(state.gl,0);assert.equal(state.shader,'');report.push({name,...state})
    await view();await capture(`${name}-side`);await view(true);await capture(`${name}-rear`)
  }
  await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,d=__MOSPEADA__;f.entry.state=d.runtime.state;f.entry.phase='transforming';f.entry.paused=false;f.entry.afterPhysics(1/60,d.rig.metrics,d.config);return true})()`))
  assert.equal(await bounded(c.evaluate('__FRONT_BATTLOID__.entry.phase')),'armorboost')
  await bounded(c.evaluate(`(async()=>{const f=__FRONT_BATTLOID__,d=__MOSPEADA__,fx=__MOSPEADA_VFX__,sc=__SCOTT_ORIGINAL__,{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js');for(let i=0;i<8;i++){f.frame?.restore();f.suspension?.restore();f.wheels?.restore();f.guards?.restore();f.rear.restore();f.effect.restore();f.entry.beforePhysics({},1/60);f.entry.afterPhysics(1/60,d.rig.metrics,d.config);d.rig.update(d.runtime.state,d.sample,d.config);updateScottGameplay(sc.instance,sc.authored,[...sc.source.animations,...sc.authored.clips],d.runtime,sc.wrapper.current,1/60);f.frame?.apply(f.entry.actorOffset);f.effect.apply(1,f.entry.choreography);f.rear.apply(1);f.guards?.apply(1,f.entry.choreography);f.wheels?.apply(1);f.suspension?.apply(1);fx.armorBoost.prepare(1/60,f.entry,f.rear,5);fx.vfx.update(1/60)}return true})()`))
  await view();await capture('rear1-boost-side')
  const boost=await bounded(c.evaluate(`({phase:__FRONT_BATTLOID__.entry.phase,offset:__FRONT_BATTLOID__.entry.actorOffset.toArray(),emitted:__MOSPEADA_VFX__.armorBoost.emitted,projectedChest:__FRONT_BATTLOID__.effect.anchor.getWorldPosition(__MOSPEADA__.camera.position.clone()).project(__MOSPEADA__.camera).toArray(),gl:__ANIME__.renderer.getContext().getError()})`))
  assert.equal(boost.phase,'armorboost');assert.ok(boost.emitted>30);assert.ok(boost.offset[1]>.5);assert.equal(boost.gl,0);report.push(boost)
  assert.ok(Math.abs(boost.projectedChest[0])<1&&Math.abs(boost.projectedChest[1])<1,'Armored rider remains in view')
  await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,d=__MOSPEADA__;for(let i=0;i<50;i++){f.entry.beforePhysics({},1/60);f.entry.afterPhysics(1/60,d.rig.metrics,d.config)}return true})()`))
  await view();await capture('armor-departure-side')
  assert.equal(await bounded(c.evaluate('__FRONT_BATTLOID__.entry.phase')),'complete')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/choreography-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
