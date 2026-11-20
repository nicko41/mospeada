import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/scott-return-body',report=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
const frame=()=>bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
try{
  let ready=false
  for(let i=0;i<250;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__;f.entry.reset();d.reset('highway');d.runtime.paused=true;const s=d.runtime.state;s.speed=25;s.height+=3;s.frontSpring+=3;s.rearSpring+=3;s.airborne=true;s.frontGrounded=s.rearGrounded=false;s.riderStand=1;s.lean=s.bank=s.pitch=0;s.idleBlend=0;f.entry.returnFlight=true;f.entry.reverseMotion={progress:1,turn:1,separate:1,chestLift:1,torsoFollow:0,cuffs:1,mechanicalProgress:1};f.entry.paused=true;f.entry.state=s;Object.defineProperty(f.entry,'cameraProgress',{configurable:true,get:()=>null});window.__BODY_MECHANICS__=[];return true})()`)
  // Inspect secondary Armor motion with the same fixed assembly and base pose.
  await c.evaluate('__FRONT_BATTLOID__.entry.returnFlight=false;__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;__FRONT_BATTLOID__.store.seek(1);true');await frame()
  const idleBase=await c.evaluate('({q:[...__SCOTT_ORIGINAL__.instance.bones.values()].map(b=>b.quaternion.toArray()),pieces:__MOSPEADA__.rig.surfaces.map(m=>m.matrixWorld.toArray())})')
  const idleRows=[]
  for(const t of [2,5,9,14]){
    await c.evaluate('__SCOTT_ORIGINAL__.instance.armorIdle.weight=1;__SCOTT_ORIGINAL__.instance.armorIdle.time='+t+';true');await frame()
    const r=await c.evaluate('({q:[...__SCOTT_ORIGINAL__.instance.bones.values()].map(b=>b.quaternion.toArray()),pieces:__MOSPEADA__.rig.surfaces.map(m=>m.matrixWorld.toArray())})')
    assert.deepEqual(r.pieces,idleBase.pieces);idleRows.push(r.q)
  }
  fs.writeFileSync(dir+'/armor-idle.json',JSON.stringify({base:idleBase.q,samples:idleRows},null,2)+'\n')
  await c.evaluate('__FRONT_BATTLOID__.entry.returnFlight=true;true')
  const times=process.env.MOSPEADA_BODY_QUICK==='1'?[0,.12,.24,.32,.42,.52,.60,1.24,1.42]:[0,.12,.24,.42,.60,.78,.94,1.08,1.20,1.24,1.33,1.42]
  for(const t of times){
    await c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,e=f.entry,t=${t};e.phase=t<.24?'returnboost':t<1.24?'reversing':t<1.42?'returnpose':'falling';e.time=t<.24?t:t<1.24?t-.24:t-1.24;f.store.seek(t<.24?1:t<1.24?1-(t-.24):0);e.poseBlend=t<1.24?1:1-((x)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)})((t-1.24)/.18);return true})()`)
    await frame()
    if(t===0)await c.evaluate(`(()=>{const m=__SCOTT_ORIGINAL__.instance.returnMotion,original=m.apply.bind(m);m.apply=(e,front)=>{const meshes=[...__MOSPEADA__.rig.surfaces,...__FRONT_BATTLOID__.rear.parts.map(p=>p.mesh)],before=meshes.map(m=>m.matrixWorld.toArray());original(e,front);window.__BODY_MECHANICS__.push(Math.max(...meshes.flatMap((m,i)=>m.matrixWorld.elements.map((n,j)=>Math.abs(n-before[i][j])))))};return true})()`)
    const row=await c.evaluate(`(()=>{const i=__SCOTT_ORIGINAL__.instance,d=__MOSPEADA__,v=d.camera.position.clone(),point=n=>i.bones.get('mixamorig'+n).getWorldPosition(v.clone());return{time:${t},score:i.returnMotion.score,safety:i.returnMotion.safety,chest:__FRONT_BATTLOID__.entry.choreography.frontSequence,boostLegs:i.armorBoostMotion.weight,hips:point('Hips').toArray(),pose:[...i.bones].map(([name,b])=>({name,q:b.quaternion.toArray()})),handErrors:i.returnMotion.arms.map(a=>a.bone.getWorldPosition(v.clone()).distanceTo(a.target)),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
    assert.equal(row.gl,0);assert.equal(row.shader,'');report.push(row)
    if([0,.12,.24,.32,.42,.52,.60,.94,1.08,1.20,1.33,1.42].includes(t))for(const [view,offset]of [['side',[3.3,.25,.1]],['rear',[.6,.4,-3.4]]]){
      await c.evaluate(`(()=>{const d=__MOSPEADA__,i=__SCOTT_ORIGINAL__.instance,v=d.camera.position.clone(),center=i.bones.get('mixamorigSpine').getWorldPosition(v).clone().add(v.set(0,-.15,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`)
      await wait(80);fs.writeFileSync(`${dir}/${t.toFixed(2)}-${view}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  const mechanicalErrors=await c.evaluate('window.__BODY_MECHANICS__');assert.ok(mechanicalErrors.length>0&&mechanicalErrors.every(n=>n===0))
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({report,mechanicalErrors},null,2)+'\n')
  console.log(JSON.stringify({samples:report.length,mechanicalMovementFromBody:Math.max(...mechanicalErrors),maxHandErrorAfterReach:Math.max(...report.filter(r=>r.time>=1.20&&r.time<1.24).flatMap(r=>r.handErrors)),views:['side','rear'],glErrors:0},null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
