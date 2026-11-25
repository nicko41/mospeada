import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/gallant-aim-lock',wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ev=code=>c.evaluate(code)
fs.mkdirSync(dir,{recursive:true})
try{
 let ready=false;for(let i=0;i<720;i++){if(await ev('!!window.__MOSPEADA__?.runtime.gallant?.aimLock&&!!window.__FOREST_STAGE4__&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}await wait(250)}assert.ok(ready)
 await ev(`(async()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();w.updateClimax(2430,2485);d.runtime.resetAt(w.startAt(900));d.runtime.pendingDefeatRetry=true;d.runtime.paused=false;d.runtime.keys={};window.__AIM_LOCK_QA__={};return true})()`)
 let battle=false;for(let i=0;i<400;i++){if(await ev('window.__DESERT_SCOUTS__?.climax?.scouts.length===15&&!__MOSPEADA__.runtime.pendingDefeatRetry&&__DESERT_SCOUTS__.actorState===__MOSPEADA__.runtime.state&&__MOSPEADA__.runtime.climaxSequence.phase==="battle"')){battle=true;break}await wait(50)}assert.ok(battle,'Native preparation builds the fifteen-Scout battle')
 const report=await ev(`(()=>{const q=__AIM_LOCK_QA__,d=__MOSPEADA__,r=d.runtime,p=r.desertPatrol,c=r.gallant;q.p=p;q.originalUpdate=p.update;p.update=()=>{};q.scout=p.scouts[0];q.state=r.state;q.cameraMode=r.cameraMode;const s=q.scout;for(const other of p.scouts)other.view.root.visible=other===s;s.position.set(r.state.x+.3,d.sample(r.state.x,r.state.z-18)+1,r.state.z-18);Object.assign(s,{dead:false,health:16,hits:0,meleeEnabled:true,mode:'flight',yaw:0,pitch:0,bank:0,charging:false});s.cannonFlash.fill(0);s.view.root.visible=true;s.view.motion.reset();p.applyView(s);s.view.motion.update(s,.016,d.sample);s.view.motion.sync();r.randEscape.protected=true;r.state.yaw=Math.PI;r.state.speed=0;r.keys={};c.aiming=c.firing=false;c.aimLock.clear();q.shots=c.shots;const rect=__ANIME__.renderer.domElement.getBoundingClientRect();return{count:p.scouts.length,squads:__DESERT_SCOUTS__.squads.length,total:r.climaxSequence.objective(r.randEscape).total,text:r.climaxSequence.objective(r.randEscape).text,x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`)
 assert.equal(report.count,15);assert.equal(report.squads,4);assert.equal(report.total,15);assert.match(report.text,/15 Invid/)
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:report.x,y:report.y})
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:report.x,y:report.y,button:'right',buttons:2,clickCount:1})
 let locked=false;for(let i=0;i<80;i++){if(await ev('__MOSPEADA__.runtime.gallant.aimLock.target===__AIM_LOCK_QA__.scout&&document.querySelector(".armor-reticle")?.dataset.locked==="true"')){locked=true;break}await wait(50)}assert.ok(locked,'Real right mouse input acquires and marks the Scout')
 await wait(550)
 report.locked=await ev('({target:__MOSPEADA__.runtime.gallant.aimLock.target.id,marker:document.querySelector(".armor-reticle").dataset.locked,health:__AIM_LOCK_QA__.scout.health})')
 await ev(`(()=>{const q=__AIM_LOCK_QA__;q.scout.position.x+=2;q.p.applyView(q.scout);q.scout.view.motion.sync();return true})()`);await wait(100)
 report.tracking=await ev('({same:__MOSPEADA__.runtime.gallant.aimLock.target===__AIM_LOCK_QA__.scout,error:Math.abs(__MOSPEADA__.runtime.gallant.aimLock.point.x-__AIM_LOCK_QA__.scout.position.x)})');assert.ok(report.tracking.same&&report.tracking.error<.01)
 const screenshot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(dir+'/01-locked-scout-reticle.png',Buffer.from(screenshot.data,'base64'))
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:report.x,y:report.y,button:'left',buttons:3,clickCount:1})
 let killed=false;for(let i=0;i<160;i++){if(await ev('__AIM_LOCK_QA__.scout.dead')){killed=true;break}await wait(50)}
 report.firing=await ev('({dead:__AIM_LOCK_QA__.scout.dead,hits:__AIM_LOCK_QA__.scout.hits,shots:__MOSPEADA__.runtime.gallant.shots-__AIM_LOCK_QA__.shots,locked:!!__MOSPEADA__.runtime.gallant.aimLock.target})');assert.ok(killed,'Sixteen real muzzle shots destroy the locked Scout');assert.equal(report.firing.hits,16);assert.equal(report.firing.locked,false)
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:report.x,y:report.y,button:'left',buttons:2,clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:report.x,y:report.y,button:'right',buttons:0,clickCount:1})
 report.gl=await ev('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{for(const button of ['left','right'])await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:711,y:402,button,buttons:0,clickCount:1}).catch(()=>{});await ev('if(window.__AIM_LOCK_QA__?.p){const q=__AIM_LOCK_QA__;q.p.update=q.originalUpdate;__MOSPEADA__.runtime.gallant.aiming=__MOSPEADA__.runtime.gallant.firing=false;__MOSPEADA__.runtime.gallant.aimLock.clear();__MOSPEADA__.runtime.paused=true};true').catch(()=>{});c.close()}
