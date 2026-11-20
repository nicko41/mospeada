import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/suspension-hide',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.suspension && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}
  assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;true')
  for(const [name,progress]of[['motorcycle',0],['tank-dip-cuff-travel',.3],['cuff-travel',.42],['quick-stow',.465],['stowed',.48],['wheels-intermediate',.81],['armor',1],['reverted',0]]){
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,e=f.effect,s=f.suspension,tank=e.motionGroups.find(g=>g.role==='tank'),ids=new Set(e.data.tankAccessoryUpdate.pieceIds),parts=e.parts.filter(p=>p.record.pieceIds.some(id=>ids.has(id))),diff=(a,b)=>Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i])));return{progress:f.store.snapshot().progress,active:s.applied,parts:s.parts.length,groups:s.groups.length,displayPieces:parts.length,tankAttachmentError:${progress>0&&progress<=.86?'Math.max(...parts.map(p=>diff(p.mesh.matrixWorld,__MOSPEADA__.rig.body.matrixWorld.clone().multiply(tank.current).multiply(p.localFrom).multiply(p.bindGeometry))))':'0'},destinationError:${progress>=.48?'Math.max(...s.parts.map(p=>diff(p.mesh.matrixWorld,e.anchorWorld.clone().multiply(p.target))))':'0'},wheelDestinationError:${progress===1||progress===.81?`Math.max(...f.wheels.groups.map(g=>diff(g.world,e.anchorWorld.clone().multiply(g.targets.${progress===1?'final':'intermediate'}))))`:'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.equal(state.active,progress>.22);assert.equal(state.parts,26);assert.equal(state.groups,2);assert.ok(state.displayPieces>=16)
    assert.ok(state.tankAttachmentError<1e-6);assert.ok(state.destinationError<1e-6);assert.ok(state.wheelDestinationError<1e-6);assert.equal(state.gl,0);assert.equal(state.shader,'')
    rows.push({name,...state})
    for(const [view,offset]of[['side',[3.5,.5,.2]],['rear',[.8,.6,-3.6]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.3,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`))
      await wait(150)
      fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/visual-validation.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows,null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
