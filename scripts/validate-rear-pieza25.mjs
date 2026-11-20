import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/rear-pieza25',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.rear && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;true')
  for(const [name,progress]of[['motorcycle',0],['tank-start',.22],['moving',.5],['armor',1],['departure',1],['reverted',0]]){
    await c.evaluate(`__FRONT_BATTLOID__.entry.actorOffset.set(0,${name==='departure'?2:0},${name==='departure'?6:0});true`)
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,r=f.rear,parts=r.parts.filter(p=>p.record.replacement),diff=(a,b)=>Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i])));return{progress:f.store.snapshot().progress,rearParts:r.parts.length,parts:parts.map(p=>({id:p.record.ids[0],sourceId:p.record.sourceId,visible:p.mesh.visible,reusesOriginal:p.mesh===p.source.mesh,position:p.mesh.getWorldPosition(r.a).toArray()})),endpointError:${progress===1?'Math.max(...parts.map(p=>diff(p.mesh.matrixWorld,f.effect.anchorWorld.clone().multiply(p.target))))':'0'},restored:${progress===0?'parts.every(p=>p.mesh.matrixAutoUpdate===p.source.auto&&p.mesh.matrix.elements.every((v,i)=>Math.abs(v-p.source.matrix.elements[i])<1e-8))':'true'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.equal(state.rearParts,32);assert.equal(state.parts.length,2);assert.ok(state.parts.every(p=>p.visible&&p.reusesOriginal));assert.ok(state.endpointError<1e-6);assert.equal(state.restored,true);assert.equal(state.gl,0);assert.equal(state.shader,'')
    if(name==='departure'){
      const before=rows.find(r=>r.name==='armor')
      for(let i=0;i<2;i++){const a=state.parts[i].position,b=before.parts[i].position;assert.ok(Math.abs(Math.hypot(...a.map((v,j)=>v-b[j]))-Math.hypot(2,6))<1e-5,'Both pieces follow the armored rider impulse')}
    }
    rows.push({name,...state})
    if(progress===.22)continue
    for(const [view,offset]of[['side',[3.4,.4,.25]],['rear',[.8,.5,-3.6]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.3,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(150)
      fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/visual-validation.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({name:r.name,parts:r.parts.length,endpointError:r.endpointError,restored:r.restored})),null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
