import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/jump-compression',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expr){const end=Date.now()+300000;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(80)}throw Error('Startup timeout')}
async function frames(){await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
async function sample(name,seconds=0){
  if(seconds)await c.evaluate(`(()=>{const a=__MOSPEADA__.runtime.armorController;for(let i=0;i<${Math.round(seconds*120)};i++)a.update({rise:true},1/120)})()`)
  await frames()
  const row=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,i=r.scottInstance,a=r.armorController.state,p=r.probe.clone(),point=n=>i.bones.get('mixamorig'+n).getWorldPosition(p.clone()),knee=s=>{const h=point(s+'UpLeg'),k=point(s+'Leg'),f=point(s+'Foot');return( Math.PI-h.sub(k).angleTo(f.sub(k)))*180/Math.PI};return{name:${JSON.stringify(name)},phase:a.jump?.phase,launched:a.jump?.launched,hips:point('Hips').y,vy:a.vy,knees:['Left','Right'].map(knee),soles:i.mountedMotion.limbs.filter(l=>l.leg).map(l=>Math.min(...l.soleIds.map(id=>{const v=i.skins[0].mesh.localToWorld(i.skins[0].mesh.getVertexPosition(id,p.clone()));return v.y-__MOSPEADA__.sample(v.x,v.z)}))),attachments:i.armorArticulation.diagnostics.legs.map(x=>x.error),gl:__ANIME__.renderer.getContext().getError()}})()`)
  assert.equal(row.gl,0);assert.ok(row.attachments.every(x=>x<1e-6));rows.push(row);console.log(JSON.stringify(row))
  fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));return row
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__ANIME__.renderer.getContext().getError();__MOSPEADA__.reset("highway");Object.assign(__MOSPEADA__.runtime.state,{speed:22,idleBlend:0,parked:false});true')
  for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code:'KeyT',key:'t'})
  await until('__MOSPEADA__.runtime.armorController.active')
  await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,c=r.armorController,a=c.state,g=c.sample(50,-250);r.paused=true;Object.assign(a,{x:50,z:-250,y:g-a.soleOffset+.025,ground:g,groundSmooth:g,mode:'ARMOR_GROUND',yaw:0,speed:0,vx:0,vy:0,vz:0,jump:null,jumpHeld:false,groundLanding:null,grounded:true});c.camera.yaw=1.05;c.sync()})()`)
  await frames();const idle=await sample('standing'),load=await sample('compressed',.1667),push=await sample('extending',.1),launch=await sample('takeoff',.06),air=await sample('airborne-knees',.2)
  assert.ok(idle.hips-load.hips>.12,'Actual pelvis compression must be visible')
  assert.equal(load.launched,false);assert.equal(load.vy,0);assert.ok(load.knees.every(x=>x>40));assert.ok(load.soles.every(y=>y>=.0079&&y<.065))
  assert.ok(push.knees[0]<load.knees[0]);assert.equal(launch.launched,true);assert.ok(launch.vy>0);assert.ok(air.knees.every(x=>x>40))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({pass:true,rows},null,2)+'\n')
}finally{await c.send('Browser.close').catch(()=>{});c.close()}
