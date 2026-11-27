import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),report={},dir='artifacts/combat-performance',wait=ms=>new Promise(r=>setTimeout(r,ms)),requests=[]
fs.mkdirSync(dir,{recursive:true});await c.send('Network.enable')
const remove=c.onEvent(e=>{if(e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/lock/lock-on-target'))requests.push(e.params.request.url)})
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error('Timed out: '+expression)}
async function mouse(type,button,buttons){return c.send('Input.dispatchMouseEvent',{type,x:640,y:450,button,buttons,clickCount:1})}
try{
 await until("!!window.__ARMOR_COMBAT__&&!!window.__FRONT_BATTLOID__&&!document.querySelector('#entry-preloader')",120000)
 await c.evaluate('__MOSPEADA__.reset();true')
 await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyV',key:'v'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyV',key:'v'})
 await until("__SFX__.audioContext?.state==='running'")
 await mouse('mousePressed','right',2);await wait(700)
 await c.evaluate(`(async()=>{
  const [{loadGLTF},{createScoutView},{DesertScoutPatrol},{registerMeleeTarget},T]=await Promise.all([import('/src/loading/resources.js'),import('/src/world/forest/invidScoutAsset.js'),import('/src/world/forest/DesertScoutPatrol.js'),import('/src/player/meleeWorld.js'),import('/node_modules/.vite/deps/three.js')]);
  const d=__MOSPEADA__,r=d.runtime,asset=await loadGLTF('/delivery/invid-scout.glb?rig=flight-v4-leg-seam'),view=createScoutView(asset.scene,0,asset.animations),patrol=new DesertScoutPatrol([view],d.sample,()=>.5),target=patrol.scouts[0];
  const ahead=d.camera.getWorldDirection(new T.Vector3()).multiplyScalar(22).add(d.camera.position);target.position.set(ahead.x,d.sample(ahead.x,ahead.z),ahead.z);Object.assign(target,{health:16,dead:false,meleeEnabled:true,mode:'flight',evading:false,yaw:r.state.yaw+Math.PI,pitch:0,bank:0});view.root.visible=true;patrol.phase='active';patrol.applyView(target);view.motion.update(target,1/60,d.sample);view.motion.sync();__ANIME__.scene.add(view.root);r.desertPatrol=patrol;
  const q=window.__TARGET_LOCK_QA__={target,view,patrol,remove:registerMeleeTarget(target),audioPlay:__SFX__.play,shot:r.combatVFX.shot,voices:[],contacts:[],points:[],running:true};
  __SFX__.play=function(name,options){const source=q.audioPlay.call(this,name,options);if(name==='targetLock')q.voices.push(source);return source};
  r.combatVFX.shot=function(weapon,result,encounter){q.shot.call(this,weapon,result,encounter);if(result.hit===target){q.contacts.push({joint:this.contactJoint,point:this.contactPoint.toArray(),exact:this.contactExact});q.points.push(result.point.toArray())}};
  let last=performance.now();const tick=now=>{if(!q.running)return;view.motion.update(target,Math.min(.05,(now-last)/1000),d.sample);view.motion.sync();last=now;requestAnimationFrame(tick)};requestAnimationFrame(tick);return true
 })()`)
 await c.evaluate(`(()=>{const q=__TARGET_LOCK_QA__,r=__MOSPEADA__.runtime;q.lockTimes=[];q.fxTimes=[];q.lockPoint=r.gallant.lockShots.point;r.gallant.lockShots.point=function(...args){const t=performance.now();const result=q.lockPoint.apply(this,args);q.lockTimes.push(performance.now()-t);return result};const shot=r.combatVFX.shot;r.combatVFX.shot=function(...args){const t=performance.now();const result=shot.apply(this,args);q.fxTimes.push(performance.now()-t);return result};return true})()`);const initialRequests=requests.length
 await until('__ARMOR_COMBAT__.aimLock.target===__TARGET_LOCK_QA__.target')
 await wait(300);report.acquiring=await c.evaluate(`({ready:__ARMOR_COMBAT__.aimLock.ready,sounds:__TARGET_LOCK_QA__.voices.length,stroke:getComputedStyle(document.querySelector('.armor-reticle')).borderTopWidth})`)
 assert.equal(report.acquiring.ready,false);assert.equal(report.acquiring.sounds,0);assert.equal(report.acquiring.stroke,'2px')
 await until("document.querySelector('.armor-reticle')?.dataset.lockReady==='true'")
 await c.evaluate(`for(const a of document.getAnimations())if(a.animationName?.startsWith('target-lock-')){a.pause();a.currentTime=150};true`)
 fs.writeFileSync(dir+'/red-lock-digital.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 report.ready=await c.evaluate(`(()=>{const q=__TARGET_LOCK_QA__,e=document.querySelector('.armor-reticle');return{sounds:q.voices.length,duration:q.voices[0]?.buffer.duration,loop:q.voices[0]?.loop,rate:q.voices[0]?.playbackRate.value,volume:__SFX__.getVolume('targetLock'),color:getComputedStyle(e).color,animations:document.getAnimations().filter(a=>a.animationName?.startsWith('target-lock-')).map(a=>a.animationName)}})()`)
 assert.equal(report.ready.sounds,1);assert.equal(report.ready.loop,false);assert.equal(report.ready.rate,1);assert.equal(report.ready.volume,.5);assert.equal(report.ready.color,'rgb(255, 59, 50)');assert.equal(report.ready.animations.length,2)
 await c.evaluate(`for(const a of document.getAnimations())if(a.animationName?.startsWith('target-lock-'))a.finish();true`)
 await wait(600);assert.equal(await c.evaluate('__TARGET_LOCK_QA__.voices.length'),1)
 await mouse('mouseReleased','right',0);await wait(200);await mouse('mousePressed','right',2)
 await until('__ARMOR_COMBAT__.aimLock.ready');assert.equal(await c.evaluate('__TARGET_LOCK_QA__.voices.length'),1)
 await mouse('mousePressed','left',3);await until('__TARGET_LOCK_QA__.target.hits>=8')
 fs.writeFileSync(dir+'/varied-hits.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await until('__TARGET_LOCK_QA__.target.dead');await mouse('mouseReleased','left',2)
 report.fire=await c.evaluate(`(()=>{const q=__TARGET_LOCK_QA__;return{hits:q.target.hits,health:q.target.health,sounds:q.voices.length,contacts:q.contacts,joints:[...new Set(q.contacts.map(p=>p.joint))],uniquePoints:new Set(q.points.map(p=>p.map(n=>n.toFixed(2)).join(','))).size}})()`)
 assert.equal(report.fire.hits,16);assert.equal(report.fire.health,0);assert.equal(report.fire.sounds,1);assert.ok(report.fire.uniquePoints>=8);assert.ok(report.fire.contacts.every(p=>p.exact));assert.ok(report.fire.joints.length>=3)
 report.cpu=await c.evaluate('({lockMs:__TARGET_LOCK_QA__.lockTimes,contactAndFXMs:__TARGET_LOCK_QA__.fxTimes})');
 report.newRequests=requests.length-initialRequests;assert.equal(report.newRequests,0)
 report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/native-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 await mouse('mouseReleased','left',0).catch(()=>{});await mouse('mouseReleased','right',0).catch(()=>{})
 await c.evaluate(`if(window.__TARGET_LOCK_QA__){const q=__TARGET_LOCK_QA__;q.running=false;q.remove();__SFX__.play=q.audioPlay;__MOSPEADA__.runtime.combatVFX.shot=q.shot;__ANIME__.scene.remove(q.view.root);q.view.motion.dispose();delete __MOSPEADA__.runtime.desertPatrol};true`).catch(()=>{})
 remove();await c.send('Browser.close').catch(()=>{});c.close()
}
