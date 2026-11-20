import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/fast-rear-legs',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  const end=Date.now()+300000;let ready=false
  while(Date.now()<end){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.rear && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,s=d.runtime.state;d.runtime.paused=true;s.frontSpring+=2;s.rearSpring+=2;s.height+=2;s.frontGrounded=s.rearGrounded=false;s.airborne=true;s.riderStand=1;s.idleBlend=0;s.lean=0;d.rig.update(s,d.sample,d.config);f.entry.phase='transforming';f.entry.paused=true;f.entry.elapsed=1;f.entry.poseBlend=1;f.entry.actorOffset.set(0,0,0);Object.defineProperty(f.entry,'cameraProgress',{configurable:true,get:()=>null});return true})()`)
  for(const p of[.22,.3,.43,.61,.7,.85,1]){
    await c.evaluate(`__FRONT_BATTLOID__.store.seek(${p});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
    const row=await c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,i=__SCOTT_ORIGINAL__.instance,m=i.model,v=__MOSPEADA__.camera.position.clone(),point=n=>m.worldToLocal(i.bones.get(n).getWorldPosition(v.clone())).toArray();return{progress:f.store.snapshot().progress,legLift:f.entry.actorPose.legLift,leftKnee:point('mixamorigLeftLeg'),rightKnee:point('mixamorigRightLeg'),leftFoot:point('mixamorigLeftFoot'),rightFoot:point('mixamorigRightFoot'),wheelActive:f.wheels.applied,tankFold:f.effect.motionGroups.find(g=>g.role==='tank').tankStage.fold,cuffs:f.guards.fit,chest:f.effect.motionGroups.filter(g=>g.role==='carrier').map(g=>g.localBlend),rearError:${p>=.64?'Math.max(...f.rear.parts.filter(p=>!p.record.retract&&p.record.role!=="wheel-base").flatMap(p=>f.effect.anchorWorld.clone().multiply(p.target).elements.map((v,j)=>Math.abs(v-p.mesh.matrixWorld.elements[j]))))':'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
    assert.equal(row.gl,0);assert.equal(row.shader,'');assert.equal(row.cuffs,1);assert.ok(row.chest.every(v=>v===1));assert.ok(row.rearError<1e-6)
    assert.equal(row.wheelActive,p>.22);assert.equal(row.tankFold>0,p>.22)
    if(p>=.64&&p<=.85){assert.equal(row.legLift,1);assert.ok(row.leftKnee[1]>row.rightKnee[1]+.2);assert.ok(row.leftFoot[1]>row.rightFoot[1]+.2)}
    if(p===.43)assert.ok(Math.abs(row.legLift-.5)<1e-8,'Slower rise is only halfway through at 43 percent')
    if(p===.22||p===1)assert.equal(row.legLift,0)
    rows.push(row)
    for(const [view,offset]of[['side',[3.5,.45,.2]],['rear',[.6,.55,-3.6]]]){
      await c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`);await wait(100)
      fs.writeFileSync(dir+'/'+p+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({progress:r.progress,legLift:r.legLift,kneeHeightDifference:r.leftKnee[1]-r.rightKnee[1],bootHeightDifference:r.leftFoot[1]-r.rightFoot[1],rearError:r.rearError})),null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
