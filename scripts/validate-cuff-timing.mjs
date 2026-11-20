import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/cuff-timing',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.frame && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);Object.defineProperty(__FRONT_BATTLOID__.entry,"cameraProgress",{configurable:true,get:()=>null});true')
  for(const [name,time,progress,phase]of[['chest-arrived',0,0,'airpose'],['cuffs-start',.06,0,'airpose'],['cuffs-mid',.14,0,'airpose'],['cuffs-fitted',.26,0,'airpose'],['torso-upright',.4,0,'airpose'],['assembly',0,.22,'transforming'],['reverse',0,.12,'reversing']]){
    await c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,e=f.entry,t=Math.min(1,${time}/.4);e.phase=${JSON.stringify(phase)};e.time=${time};e.poseBlend=${phase==='airpose'?'t*t*(3-2*t)':'1'};e.elapsed=1;e.actorOffset.set(0,0,0);e.reverseMotion={turn:1,separate:1,chestLift:1,cuffs:1,progress:1};f.store.seek(${progress});return true})()`)
    await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,diff=(a,b)=>Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i])));return{phase:f.entry.phase,progress:f.store.snapshot().progress,torso:f.entry.poseBlend,cuffs:f.entry.choreography.cuffs,fit:f.guards.fit,clock:f.guards.progress,guardError:${time>=.26||phase==='transforming'?'Math.max(...f.guards.groups.map(g=>diff(g.current,g.bone.matrixWorld.clone().multiply(g.targetInBone))))':'0'},suspensionError:${time>=.26||phase==='transforming'?'Math.max(...f.suspension.parts.map(p=>diff(p.mesh.matrixWorld,f.effect.anchorWorld.clone().multiply(p.target))))':'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.ok(state.guardError<1e-6&&state.suspensionError<1e-6);assert.equal(state.gl,0);assert.equal(state.shader,'')
    if(name==='cuffs-fitted'){assert.equal(state.progress,0);assert.equal(state.fit,1);assert.ok(state.torso<1)}
    if(name==='cuffs-start')assert.ok(state.fit>0)
    rows.push({name,time,...state})
    for(const [view,offset]of[['side',[3.6,.5,.25]],['front',[1.4,.55,3.2]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(120)
      fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/visual-validation.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({name:r.name,time:r.time,mainProgress:r.progress,fit:r.fit,torso:r.torso})),null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
