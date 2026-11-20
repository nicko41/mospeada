import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/chest-carry',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.suspension && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);true')
  // Freeze the cinematic camera only inside this inspection browser, so the
  // side/front screenshots are not replaced by the normal automatic orbit.
  await c.evaluate('Object.defineProperty(__FRONT_BATTLOID__.entry,"cameraProgress",{configurable:true,get:()=>null});true')
  const inspectionOnly=process.env.MOSPEADA_CHEST_INSPECTION_ONLY==='1'
  const cases=[['motorcycle',0,0,'idle'],['boost-carry',0,0,'boost'],['torso-start',0,.01,'airpose'],['torso-middle',0,.5,'airpose'],['torso-upright',0,1,'airpose'],['chest-settled',.22,1,'transforming'],['cuff-release',.35,1,'transforming'],['armor',1,1,'complete'],['departure',1,1,'complete'],['reverse',.11,1,'reversing'],['early-return',0,.5,'returning'],['restored',0,0,'idle']].filter(c=>!inspectionOnly||c[0].startsWith('torso-')||c[0]==='early-return')
  for(const [name,progress,pose,phase]of cases){
    await c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,e=f.entry;e.phase=${JSON.stringify(phase)};e.poseBlend=${pose};e.elapsed=1;e.boostAge=.07;e.time=${phase==='returning'?'.2':'0'};e.reverseMotion={turn:1,separate:1,chestLift:1,torsoFollow:0,progress:1};e.returnMotion={turn:1,separate:1,chestLift:1,torsoFollow:1};e.actorOffset.set(0,${name==='departure'?2:0},${name==='departure'?6:0});f.store.seek(${progress});return true})()`)
    await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,front=f.effect,s=f.suspension,r=f.rear,d=__MOSPEADA__,diff=(a,b)=>Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i]))),carriers=front.motionGroups.filter(g=>g.role==='carrier'),caps=r.originals.filter(p=>p.hideInArmor);let chainError=0;if(${progress<=.22&&phase!=='idle'})for(const group of s.groups){const guard=group.guard,carrier=guard.carrier,delta=d.rig.body.matrixWorld.clone().multiply(carrier.current).multiply(carrier.sourceBody.clone().invert()).multiply(d.rig.body.matrixWorld.clone().invert());for(const p of [...guard.parts,...group.parts])chainError=Math.max(chainError,diff(p.mesh.matrixWorld,delta.clone().multiply(p.mesh.parent.matrixWorld).multiply(p.matrix)))}const anchor=front.anchor.getWorldPosition(d.camera.position.clone()),far=[];if(${name==='departure'})for(const m of d.rig.surfaces){let n=m,visible=true;while(n){visible&&=n.visible;n=n.parent}if(!visible)continue;m.geometry.computeBoundingBox();const center=m.geometry.boundingBox.getCenter(d.camera.position.clone()).applyMatrix4(m.matrixWorld);if(center.distanceTo(anchor)>3)far.push({name:m.userData.sourcePiece,position:center.toArray()})}return{progress:${progress},phase:${JSON.stringify(phase)},pose:${pose},chestLift:f.entry.choreography?.chestLift||0,chainError,chestPoseError:${phase==='airpose'?'Math.max(...carriers.map(g=>diff(d.rig.body.matrixWorld.clone().multiply(g.current),front.anchor.matrixWorld.clone().multiply(g.targetChest))))':'0'},caps:caps.map(p=>({name:p.mesh.userData.sourcePiece,visible:p.mesh.visible})),far,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.ok(state.chainError<1e-6);assert.ok(state.chestPoseError<1e-6);assert.equal(state.caps.length,2)
    assert.ok(state.caps.every(p=>p.visible===(progress<=.22)));assert.equal(state.far.length,0,'No vehicle meshes are left behind Armor')
    assert.equal(state.gl,0);assert.equal(state.shader,'');rows.push({name,...state})
    for(const [view,offset]of[['side',[3.8,.5,.3]],['front',[1.6,.6,3.4]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(150)
      fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/'+(inspectionOnly?'inspection-validation':'visual-validation')+'.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({name:r.name,chainError:r.chainError,chestPoseError:r.chestPoseError,far:r.far.length})),null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
