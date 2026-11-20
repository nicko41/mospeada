import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/return-seat',wait=ms=>new Promise(r=>setTimeout(r,ms)),rows=[]
fs.mkdirSync(dir,{recursive:true})
async function until(expr,ms=180000){const end=Date.now()+ms;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(80)}throw Error('Timeout: '+expr)}
async function frames(n){await c.evaluate(`new Promise(resolve=>{let left=${n};const tick=()=>--left<=0?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick)})`)}
async function press(code,key){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code,key})}
async function snapshot(name){
  const row=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,s=r.state,i=__SCOTT_ORIGINAL__.instance,e=r.transformEntry,m=i.mountedMotion;return{name:${JSON.stringify(name)},phase:e.phase,poseBlend:e.poseBlend,returnFlight:e.returnFlight,clip:i.clip,riderStand:s.riderStand,airborne:s.airborne,frontGrounded:s.frontGrounded,rearGrounded:s.rearGrounded,baseHip:m.originals.find(x=>x.b.name==='mixamorigHips').p.toArray(),hip:i.bones.get('mixamorigHips').position.toArray()}})()`)
  rows.push(row);console.log(JSON.stringify(row));return row
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")',300000)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.reset("rough");Object.assign(__MOSPEADA__.runtime.state,{speed:22,idleBlend:0,parked:false});true')
  await frames(30);const baseline=await snapshot('riding-before')
  for(const mode of ['ARMOR_HOVER','ARMOR_GROUND']){
    await press('KeyT','t');await until('__MOSPEADA__.runtime.armorController.active')
    // Keep the cinematic departure inside the existing rendered test terrain.
    await c.evaluate('(()=>{const a=__MOSPEADA__.runtime.armorController,s=a.state,g=a.sample(50,-250);if(!Number.isFinite(g))throw Error("Missing test terrain");Object.assign(s,{x:50,z:-250,y:g-s.soleOffset+.8,yaw:0,vx:0,vy:0,vz:0,speed:0});a.sync()})()')
    if(mode==='ARMOR_GROUND'){
      await press('KeyG','g');await until('__MOSPEADA__.runtime.armorController.state.grounded')
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'})
      await frames(90)
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'})
    }
    await frames(45);await press('KeyT','t')
    await until('__FRONT_BATTLOID__.entry.phase==="falling"')
    await snapshot(mode+'-falling')
    await until('__FRONT_BATTLOID__.entry.phase==="idle"&&__MOSPEADA__.runtime.state.frontGrounded&&__MOSPEADA__.runtime.state.rearGrounded&&!__MOSPEADA__.runtime.state.airborne')
    await until('__MOSPEADA__.runtime.state.riderStand<.001');await frames(60)
    const seated=await snapshot(mode+'-landed')
    assert.equal(seated.clip,'Cyclone_RidingPose');assert.equal(seated.poseBlend,0);assert.equal(seated.returnFlight,false)
    assert.ok(seated.baseHip.every((v,j)=>Math.abs(v-baseline.baseHip[j])<1e-6),'Exact authored riding pelvis must be restored')
    fs.writeFileSync(`${dir}/${mode}-landed.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await c.evaluate('Object.assign(__MOSPEADA__.runtime.state,{speed:22,idleBlend:0,parked:false});true')
  }
  assert.equal(c.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0)
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({pass:true,rows},null,2)+'\n')
  console.log('PASS: Hover and Ground return to the exact seated base after landing')
}finally{await Promise.race([c.send('Browser.close').catch(()=>{}),wait(10000)]);c.close()}
