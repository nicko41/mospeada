import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/cuff-smoke',report={},wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error('Timed out: '+expression)}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code.slice(3).toLowerCase()})}
async function tap(code){await key(code,true);await key(code,false)}
async function photo(name,wake=false){
 await c.evaluate(`(()=>{const q=__CUFF_SMOKE_QA__,d=__MOSPEADA__,m=d.runtime.gallant.missiles.records[0],T=q.T;q.cameraActive=d.runtime.armorController.camera.active;d.runtime.armorController.camera.active=false;const center=m.launchOrigin.clone();${wake?'center.lerp(m.position,.5)':''};const offset=new T.Vector3(...${wake?'[10,6,-2]':'[2.8,1.3,-2.7]'}).applyAxisAngle(new T.Vector3(0,1,0),d.runtime.armorController.state.yaw);d.camera.position.copy(center).add(offset);d.camera.lookAt(center);d.camera.updateMatrixWorld(true);return true})()`)
 await wait(100);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}
async function resume(stage){await c.evaluate(`__CUFF_SMOKE_QA__.stage=${JSON.stringify(stage)};__MOSPEADA__.runtime.armorController.camera.active=true;__MOSPEADA__.runtime.paused=false;true`)}
try{
 await until("!!window.__FRONT_BATTLOID__&&!!window.__ARMOR_COMBAT__&&!document.querySelector('#entry-preloader')",120000)
 await c.evaluate(`(async()=>{__MOSPEADA__.reset();(await import('/src/world/weatherState.js')).weatherState.setPreset('sunny');return true})()`)
 await tap('KeyV');await key('KeyW',true);await until('__MOSPEADA__.runtime.state.speed>5');await tap('KeyT');await key('KeyW',false)
 await until('__MOSPEADA__.runtime.armorController.active');await wait(800)
 await c.evaluate(`(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),{loadGLTF}=await import('/src/loading/resources.js'),{createScoutView}=await import('/src/world/forest/invidScoutAsset.js'),{DesertScoutPatrol}=await import('/src/world/forest/DesertScoutPatrol.js');
  const d=__MOSPEADA__,r=d.runtime,a=r.armorController.state,asset=await loadGLTF('/delivery/invid-scout.glb?rig=flight-v4-leg-seam'),view=createScoutView(asset.scene,0,asset.animations),p=new DesertScoutPatrol([view],d.sample,()=>.5),target=p.scouts[0];
  r.armorController.camera.yaw=a.yaw;r.armorController.camera.pitch=.02;r.armorController.camera.intro=1;
  target.position.set(a.x+Math.sin(a.yaw)*55,0,a.z+Math.cos(a.yaw)*55);target.position.y=Math.max(d.sample(target.position.x,target.position.z)+1,a.y+1.5-target.height*.55);Object.assign(target,{dead:false,health:16,hits:0,meleeEnabled:true,mode:'flight',yaw:a.yaw+Math.PI,pitch:0,bank:0,evading:false});view.root.visible=true;p.phase='active';p.applyView(target);view.motion.update(target,1/60,d.sample);view.motion.sync();__ANIME__.scene.add(view.root);r.desertPatrol=p;
  const v=r.missileVFX,q=window.__CUFF_SMOKE_QA__={T,target,view,stage:'waiting',start:v.startLaunch,present:v.present,pool:v.system.particles.slice(),buffer:v.batch.geometry.attributes.offset};
  v.startLaunch=function(...args){q.birthAnchorError=args[2].distanceTo(args[1].mesh.localToWorld(args[1].local.clone()));const result=q.start.apply(this,args);q.stage='birth';q.birthParticles=this.system.particleNum;r.paused=true;return result};
  v.present=function(records,camera,dt){const result=q.present.call(this,records,camera,dt);if(q.stage==='flight'&&records[0].active&&records[0].age>=.45){q.stage='wake';r.paused=true}return result};return true
 })()`)
 await wait(250);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:450,button:'right',buttons:2,clickCount:1})
 await until('__MOSPEADA__.runtime.gallant.aimLock.ready');await tap('KeyQ');await until("__CUFF_SMOKE_QA__.stage==='birth'")
 report.birth=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,v=r.missileVFX,m=r.gallant.missiles.records[0],l=r.gallant.missiles.launchers[0],p=l.mesh.localToWorld(l.local.clone());return{particles:v.system.particleNum,originError:__CUFF_SMOKE_QA__.birthAnchorError,currentCuffOffset:m.position.distanceTo(p),worldSpace:v.system.worldSpace,clouds:v.system.particles.slice(0,v.system.particleNum).filter(p=>p.cuffLaunch).length}})()`)
 assert.ok(report.birth.particles>=42);assert.ok(report.birth.originError<1e-7);assert.equal(report.birth.worldSpace,true)
 await photo('01-cuff-smoke-ball');await resume('flight');await until("__CUFF_SMOKE_QA__.stage==='wake'")
 report.wake=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,v=r.missileVFX,m=r.gallant.missiles.records[0],p=v.system.particles.slice(0,v.system.particleNum).filter(p=>!p.cuffLaunch);return{particles:v.system.particleNum,wakeParticles:p.length,age:m.age,distance:m.position.distanceTo(m.launchOrigin),wakeSpan:Math.max(...p.map(p=>p.position.distanceTo(m.launchOrigin)))-Math.min(...p.map(p=>p.position.distanceTo(m.launchOrigin))),samePool:v.system.particles.every(p=>__CUFF_SMOKE_QA__.pool.includes(p)),sameBuffer:v.batch.geometry.attributes.offset===__CUFF_SMOKE_QA__.buffer}})()`)
 assert.ok(report.wake.wakeParticles>20);assert.ok(report.wake.wakeSpan>6);assert.ok(report.wake.samePool&&report.wake.sameBuffer);assert.ok(report.wake.particles<=384)
 await photo('02-guided-smoke-wake',true);await resume('finishing');await until('__CUFF_SMOKE_QA__.target.dead')
 report.hit=await c.evaluate('({hits:__CUFF_SMOKE_QA__.target.hits,stats:__MOSPEADA__.runtime.gallant.missiles.stats})');assert.equal(report.hit.hits,1)
 await wait(2200);report.remainingSmoke=await c.evaluate('__MOSPEADA__.runtime.missileVFX.system.particleNum');assert.equal(report.remainingSmoke,0)
 report.flightSourceSHA256=crypto.createHash('sha256').update(fs.readFileSync('src/vehicle/CuffMissiles.js')).digest('hex');assert.equal(report.flightSourceSHA256,'43190d280834c6f4bb7c2de93760f6e3a267e22db623789a9e796ce788f71898')
 report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 await key('KeyW',false).catch(()=>{});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:450,button:'right',buttons:0,clickCount:1}).catch(()=>{})
 await c.evaluate(`if(window.__CUFF_SMOKE_QA__){const q=__CUFF_SMOKE_QA__,v=__MOSPEADA__.runtime.missileVFX;v.startLaunch=q.start;v.present=q.present;__ANIME__.scene.remove(q.view.root);q.view.motion.dispose();delete __MOSPEADA__.runtime.desertPatrol};true`).catch(()=>{})
 await c.send('Browser.close').catch(()=>{});c.close()
}
