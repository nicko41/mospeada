import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/return-flight',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
async function until(expression,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const r=await bounded(c.evaluate(expression),90000);if(r)return r;await wait(80)}throw Error('Flight milestone timed out: '+expression)}
async function keyT(){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key:'t',code:'KeyT'})}
async function capture(name){
  for(const [view,offset]of[['side',[3.8,.4,.15]],['rear',[.8,.55,-3.8]]]){
    await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(100)
    fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
  }
}
try{
  await until('!!window.__FRONT_BATTLOID__?.frame && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")',300000)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('Object.defineProperty(__FRONT_BATTLOID__.entry,"cameraProgress",{configurable:true,get:()=>null});__FRONT_BATTLOID__.entry.reset();__MOSPEADA__.reset("highway");__MOSPEADA__.runtime.state.speed=28;__MOSPEADA__.runtime.state.parked=false;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.keys.KeyW=true;true')
  await keyT();await until(`(()=>{if(__FRONT_BATTLOID__.entry.phase!=='complete')return false;__MOSPEADA__.runtime.paused=true;return true})()`)
  await c.evaluate(`(()=>{
    const d=__MOSPEADA__,f=__FRONT_BATTLOID__,original=f.store.advance.bind(f.store);window.__RETURN_CHECK__={rows:[],seen:[],due:null,landings:d.runtime.state.frontLandingCount};
    f.store.advance=(dt,duration)=>{
      original(dt,duration);const e=f.entry,s=d.runtime.state,p=f.store.snapshot().progress,q=window.__RETURN_CHECK__,vfx=window.__MOSPEADA_VFX__?.armorBoost;
      const row={phase:e.phase,time:e.time,progress:p,pose:e.poseBlend,tuck:e.actorPose.returnTuck??0,limbs:['Left','Right'].map(side=>{const b=__SCOTT_ORIGINAL__.instance.bones,point=n=>b.get('mixamorig'+side+n).getWorldPosition(d.camera.position.clone()),hip=point('UpLeg'),knee=point('Leg'),foot=point('Foot'),elbow=point('ForeArm'),hand=point('Hand'),q=__SCOTT_ORIGINAL__.instance.model.getWorldQuaternion(d.camera.quaternion.clone()).invert();return{side,kneeFlex:180-hip.clone().sub(knee).angleTo(foot.clone().sub(knee))*180/Math.PI,forearm:hand.sub(elbow).applyQuaternion(q).normalize().toArray()}}),dt,duration,airborne:s.airborne,height:s.height,velocity:s.verticalVelocity,riderStand:s.riderStand,returnTilt:e.returnTilt,bodyTilt:s.pitch-d.rig.body.rotation.x,frontCompression:s.frontTarget-s.frontSpring,rearCompression:s.rearTarget-s.rearSpring,frontImpact:s.frontImpact,rearImpact:s.rearImpact,landings:s.frontLandingCount,offset:e.actorOffset.toArray(),cuffs:f.guards.fit,hydraulics:d.rig.hydraulics.map(h=>h.state.length),boost:vfx?.level,direction:vfx?.direction.toArray(),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error};q.rows.push(row);
      let name=null;
      if(e.phase==='returnboost'&&e.time>=.04)name='boost';
      else if(e.phase==='reversing'&&p<=.7&&p>.3)name='assembly';
      else if(e.phase==='reversing'&&p<=.3)name='last-pieces';
      else if(e.phase==='returnpose'&&e.time>=.06)name='jump-pose';
      else if(e.phase==='falling'&&s.airborne)name='falling';
      else if(e.phase==='idle'&&s.frontLandingCount>q.landings&&row.frontCompression>.06)name='landing';
      if(name&&!q.seen.includes(name)){q.seen.push(name);q.due=name;d.runtime.paused=true;e.pause()}
    };return true
  })()`)
  await keyT();await c.evaluate('__MOSPEADA__.runtime.paused=false;true')
  for(const expected of ['boost','assembly','last-pieces','jump-pose','falling','landing']){
    const name=await until('window.__RETURN_CHECK__?.due');assert.equal(name,expected)
    await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
    await capture(name)
    await c.evaluate('window.__RETURN_CHECK__.due=null;if(__FRONT_BATTLOID__.entry.phase!=="idle")__FRONT_BATTLOID__.entry.resume();else __FRONT_BATTLOID__.entry.paused=false;__MOSPEADA__.runtime.paused=false;true')
  }
  // Let the landing spring rebound and settle, then stop both simulation and audio.
  await until('window.__RETURN_CHECK__.rows.filter(r=>r.phase==="idle").length>25')
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  const report=await c.evaluate('window.__RETURN_CHECK__'),rows=report.rows,assembly=rows.filter(r=>r.phase==='reversing')
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n')
  assert.ok(assembly.length>2);assert.ok(assembly.every(r=>r.pose===1&&r.airborne&&r.duration===1&&r.tuck===1));assert.ok(assembly.every(r=>r.limbs.every(l=>l.kneeFlex>80&&l.kneeFlex<135&&l.forearm[2]>.6)), 'Both legs tucked and forearms forward throughout assembly')
  assert.ok(rows.filter(r=>r.phase==='returnboost'||r.phase==='reversing').every(r=>r.returnTilt===0&&Math.abs(r.bodyTilt)<1e-6),'Scott and Armor stay upright until assembly is complete')
  assert.ok(rows.filter(r=>r.returnTilt>0).every(r=>r.progress===0&&r.pose<1),'Rear settles only while Scott adopts the jump pose on the completed bike')
  assert.ok(rows.some(r=>r.phase==='returnpose'&&r.bodyTilt>0&&r.pose<1))
  assert.ok(rows.filter(r=>r.phase==='idle').every(r=>r.returnTilt===0&&Math.abs(r.bodyTilt)<1e-6),'Normal orientation returns before landing settles')
  assert.ok(rows.filter(r=>r.pose<1).every(r=>r.progress===0),'Jump pose starts only after the last piece has returned')
  assert.ok(rows.some(r=>r.phase==='falling'&&r.progress===0&&r.pose===0&&r.riderStand>.95))
  assert.ok(rows.some(r=>r.frontCompression>.06&&r.landings>report.landings),'Existing suspension must absorb the real fall')
  assert.ok(rows.some(r=>r.phase==='returnboost'&&r.direction?.[1]<-.99&&r.boost>0))
  assert.ok(rows.every(r=>r.gl===0&&r.shader===''))
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  console.log(JSON.stringify({captures:report.seen,samples:rows.length,assemblySeconds:assembly.reduce((a,r)=>a+r.dt,0),noseUpDegrees:Math.max(...rows.map(r=>r.bodyTilt))*180/Math.PI,maxHeight:Math.max(...rows.map(r=>r.height)),maxCompression:Math.max(...rows.map(r=>r.frontCompression)),jumpAfterAssembly:true,landed:true},null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
