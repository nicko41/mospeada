import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/camera-presence',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expr){const end=Date.now()+300000;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(80)}throw Error('Milestone timeout: '+expr)}
async function frames(n=2){await c.evaluate(`new Promise(r=>{let n=${n};const tick=()=>--n<=0?r():requestAnimationFrame(tick);requestAnimationFrame(tick)})`)}
async function pressT(){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code:'KeyT',key:'t'})}
async function shot(name){
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames()
  const row=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,cam=__ANIME__.camera,a=r.armorController,orbit=r.orbit,scott=__SCOTT_ORIGINAL__,p=cam.position.clone(),bounds={minY:Infinity,maxY:-Infinity,minX:Infinity,maxX:-Infinity};cam.updateMatrixWorld(true);const meshes=[...r.vehicleRig.surfaces,...scott.instance.skins.map(x=>x.mesh)];for(const m of meshes){let n=m,visible=true;while(n){visible&&=n.visible;n=n.parent}if(!visible)continue;const count=m.geometry.attributes.position.count;for(let i=0;i<count;i++){m.getVertexPosition(i,p);m.localToWorld(p);p.project(cam);if(p.z< -1||p.z>1)continue;bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x)}}return{name:${JSON.stringify(name)},fov:cam.fov,distance:cam.position.distanceTo(orbit.target),heightOffset:cam.position.y-orbit.target.y,projectedHeight:bounds.maxY-bounds.minY,bounds,scottScale:scott.wrapper.current.scale.toArray(),bikeScale:r.vehicleRig.root.scale.toArray(),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.equal(row.gl,0);assert.equal(row.shader,'');rows.push(row);console.log(JSON.stringify(row))
  fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));return row
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")')
  await c.evaluate('__ANIME__.renderer.getContext().getError()')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.reset("rough");true');await frames(30);const bike=await shot('cyclone-wide')
  await c.evaluate('Object.assign(__MOSPEADA__.runtime.state,{speed:22,idleBlend:0,parked:false});__MOSPEADA__.runtime.paused=false;true');await pressT()
  await until('__MOSPEADA__.runtime.armorController.active');await frames(70)
  await c.evaluate('(()=>{const r=__MOSPEADA__.runtime,a=r.armorController,s=a.state,g=a.sample(50,-250);Object.assign(s,{x:50,z:-250,y:g-s.soleOffset+.8,yaw:0,vx:0,vy:0,vz:0,speed:0,boostBlend:0});a.sync()})()');await frames(50)
  const armor=await shot('armor-hero');assert.ok(armor.projectedHeight>bike.projectedHeight*1.4);assert.ok(armor.heightOffset<0);assert.ok(armor.fov<bike.fov)
  assert.deepEqual(armor.scottScale,bike.scottScale);assert.deepEqual(armor.bikeScale,bike.bikeScale)
  await pressT();await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await until('__MOSPEADA__.runtime.transformEntry.phase==="idle"');await frames(30)
  const back=await shot('cyclone-restored');assert.ok(back.fov>armor.fov);assert.equal(back.fov,bike.fov)
  assert.equal(c.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0)
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({pass:true,rows},null,2)+'\n')
}finally{await c.send('Browser.close').catch(()=>{});c.close()}
