import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
await import('./validate-gallant-aim-lock.mjs')
const c=await connect(),dir='artifacts/cuff-missiles',wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ev=code=>c.evaluate(code),report={}
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=30){for(let i=0;i<seconds*20;i++){if(await ev(code))return;await wait(50)}throw Error('Timed out: '+code)}
async function key(code,key){await c.send('Input.dispatchKeyEvent',{type:'keyDown',code,key});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code,key})}
async function capture(name){fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
 await ev(`(()=>{const r=__MOSPEADA__.runtime,p=r.desertPatrol;window.__MISSILE_QA__={p,originalUpdate:p.update};p.update=()=>{};for(const s of p.scouts)s.view.root.visible=false;r.randEscape.protected=true;r.state.speed=18;r.state.parked=false;r.state.idleBlend=0;r.paused=false;r.keys={};return true})()`)
 await key('KeyT','t');await until('__MOSPEADA__.runtime.armorController.active',50)
 await wait(1500)
 await ev(`(()=>{const q=__MISSILE_QA__,r=__MOSPEADA__.runtime,a=r.armorController.state;Object.assign(a,{yaw:Math.PI,vx:0,vy:0,vz:0,speed:0,jump:null,groundLanding:null});r.armorController.camera.yaw=Math.PI;r.armorController.camera.pitch=.02;r.armorController.camera.intro=1;r.armorController.sync();q.m=r.gallant.missiles;q.v=r.missileVFX;q.pool=q.v.system.particles.slice();q.buffer=q.v.glows.instanceMatrix;q.material=q.v.material;q.origLaunch=q.m.launch;q.births=[];q.pose=r.scottInstance.missilePose;q.originalPoseApply=q.pose.apply;q.pose.apply=function(...args){const result=q.originalPoseApply.apply(this,args);if(this.active&&this.launcher.side==="Left"){if(!this.fired&&this.age>=.30&&!q.windupPhoto){q.windupPhoto=true;r.paused=true}if(this.fired&&this.age-this.firedAt>=.23&&!q.openPhoto){q.openPhoto=true;r.paused=true}}return result};q.m.launch=function(...args){const ok=q.origLaunch.apply(this,args);if(ok){const slot=4-this.remaining-1,l=this.launchers[slot],p=l.mesh.localToWorld(l.local.clone());q.births.push({slot,error:this.records[slot].position.distanceTo(p),name:l.mesh.name,side:l.side,alignment:r.scottInstance.missilePose.diagnostics.barrelAlignment,origin:p.toArray()});if(slot===0)r.paused=true}return ok};q.select=index=>{for(const s of q.p.scouts)s.view.root.visible=false;const s=q.p.scouts[index],a=r.armorController.state;Object.assign(s,{dead:false,health:16,hits:0,meleeEnabled:true,mode:'flight',yaw:0,pitch:0,bank:0});s.view.root.visible=true;s.position.set(a.x,__MOSPEADA__.sample(a.x,a.z-28)+1,a.z-28);s.position.y=Math.max(s.position.y,a.y+1.5-s.height*.55);s.view.motion.reset();q.p.applyView(s);s.view.motion.update(s,.016,__MOSPEADA__.sample);s.view.motion.sync();q.target=s;r.gallant.aimLock.clear()};q.select(1);return true})()`)
 await wait(300)
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:711,y:402,button:'right',buttons:2,clickCount:1})
 report.shots=[]
 for(let slot=0;slot<4;slot++){
  if(slot)await ev(`__MISSILE_QA__.select(${slot+1});true`)
  await until('__MOSPEADA__.runtime.gallant.aimLock.target===__MISSILE_QA__.target')
  await key('KeyQ','q')
  if(slot===1){await until('__MISSILE_QA__.windupPhoto&&__MOSPEADA__.runtime.paused');await capture('05-left-arm-raised-and-legs-flexed');await ev('__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.gallant.aiming=true;true')}
  await until(`__MISSILE_QA__.m.stats.launched===${slot+1}`)
  if(slot===1){await until('__MISSILE_QA__.openPhoto&&__MOSPEADA__.runtime.paused');await capture('06-left-launch-legs-open-and-extended');await ev('__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.gallant.aiming=true;true')}
  if(slot===0){await capture('01-cuff-launch-white-smoke');await ev('(()=>{const q=__MISSILE_QA__,r=__MOSPEADA__.runtime;for(let i=0;i<36;i++){q.m.step(1/120,r.gallant.hitscan,q.v,t=>r.combatVFX.destroyTarget(t));__MOSPEADA_VFX__.vfx.update(1/120)}q.v.present(q.m.records,__MOSPEADA__.camera);return true})()');await capture('02-guided-wave-and-white-wake');await ev('__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.gallant.aiming=true;true')}
  await until('__MISSILE_QA__.target.dead',8)
  const shot=await ev('({health:__MISSILE_QA__.target.health,hits:__MISSILE_QA__.target.hits,remaining:__MISSILE_QA__.m.remaining,smoke:__MISSILE_QA__.v.system.particleNum,explosions:__MOSPEADA__.runtime.combatVFX.stats.explosions})');assert.equal(shot.health,0);assert.equal(shot.hits,1);assert.equal(shot.remaining,3-slot);report.shots.push(shot)
  if(slot===0)await capture('03-single-hit-invid-destruction')
  await wait(550)
 }
 await ev('__MISSILE_QA__.select(5);true');await until('__MOSPEADA__.runtime.gallant.aimLock.target===__MISSILE_QA__.target');await key('KeyQ','q');await wait(800)
 report.empty=await ev('({launched:__MISSILE_QA__.m.stats.launched,health:__MISSILE_QA__.target.health,noAmmoUI:!document.querySelector(".cuff-missile-ammo")})');assert.equal(report.empty.launched,4);assert.equal(report.empty.health,16);assert.equal(report.empty.noAmmoUI,true)
 await capture('04-four-launchers-empty')
 report.resources=await ev('({births:__MISSILE_QA__.births,poolReused:__MISSILE_QA__.v.system.particles.every(p=>__MISSILE_QA__.pool.includes(p)),bufferReused:__MISSILE_QA__.v.glows.instanceMatrix===__MISSILE_QA__.buffer,materialReused:__MISSILE_QA__.v.material===__MISSILE_QA__.material,particles:__MISSILE_QA__.v.system.particleNum,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error})');assert.equal(report.resources.births.length,4);assert.ok(report.resources.births.every(b=>b.error<1e-7));assert.ok(report.resources.poolReused&&report.resources.bufferReused&&report.resources.materialReused);assert.equal(report.resources.gl,0);assert.equal(report.resources.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:711,y:402,button:'right',buttons:0,clickCount:1}).catch(()=>{});await ev('if(window.__MISSILE_QA__){const q=__MISSILE_QA__;q.p.update=q.originalUpdate;if(q.origLaunch)q.m.launch=q.origLaunch;if(q.originalPoseApply)q.pose.apply=q.originalPoseApply;__MOSPEADA__.runtime.gallant.aiming=false;__MOSPEADA__.runtime.paused=true};true').catch(()=>{});c.close()}
