import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),ev=code=>c.evaluate(code),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/downhill-and-flanking'
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=120){for(let i=0;i<seconds*10;i++){if(await ev(code).catch(()=>false))return;await wait(100)}throw Error('Timed out: '+code)}
try{
 await until('!!window.__MOSPEADA__?.runtime.transformEntry&&window.__ANIME__?.state.snapshot().ready&&!!window.__DESERT_SCOUTS__')
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});r.resetAt(w.startAt(900));r.paused=true;return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const formation=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,p=r.desertPatrol,w=__FOREST_STAGE4__.world,s=__DESERT_SCOUTS__.player,T=d.camera.position.constructor;p.reset();s.yaw=Math.PI;p.update(.05,s,d.camera,w,{allowAttack:false});const old=p.scouts.map(s=>s.position.clone());let maxStep=0;for(let i=0;i<600;i++){p.update(.05,s,d.camera,w,{allowAttack:false});for(const scout of p.scouts){maxStep=Math.max(maxStep,scout.position.distanceTo(old[scout.id]));old[scout.id].copy(scout.position)}}const forward=new T(Math.sin(s.yaw),0,Math.cos(s.yaw));return{rigTestId:p.rigTestId,rigTestStarted:p.rigTestStarted,maxStep,along:p.scouts.map(v=>v.position.clone().sub(new T(s.x,s.height,s.z)).dot(forward)),count:p.scouts.length}})()`)
 assert.equal(formation.rigTestId,-1);assert.equal(formation.rigTestStarted,false);assert.ok(formation.maxStep<4);assert.ok(formation.along.some(v=>v>12)&&formation.along.some(v=>v< -12))
 // Real long descent on the rendered final desert terrain. The same input
 // handler and physics/director used by a normal T press run the conversion.
 const start=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;w.requestClimax();for(let i=0;i<100&&!w.climaxPlain.ready;i++)w.updateClimax(2500,2555);w.updateClimax(2500,2555);r.resetAt(w.startAt(2500));r.state.speed=30;r.state.parked=false;r.state.idleBlend=0;r.paused=true;return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const downhill=await ev(`new Promise((resolve,reject)=>{const d=__MOSPEADA__,r=d.runtime,entry=r.transformEntry,report={start:{z:r.state.z,height:r.state.height,pitch:r.state.pitch},phases:[]};let frames=0;function tick(){const p=r.desertPatrol;p?.stopCombat();if(p)for(const s of p.scouts)s.cooldown=Infinity;const e=r.transformEntry;if(report.phases.at(-1)?.phase!==e.phase)report.phases.push({phase:e.phase,time:e.elapsed,pitch:r.state.pitch,rear:r.state.rearGrounded});if(e.phase==='complete'&&r.armorController.active){r.paused=true;r.keys={};resolve({...report,elapsed:e.elapsed,armor:true,end:{z:r.state.z,height:r.state.height,pitch:r.state.pitch}})}else if(++frames>1200||e.elapsed>4.5)reject(Error('Downhill conversion stalled: '+JSON.stringify(report)));else requestAnimationFrame(tick)}r.keys={KeyW:true};r.paused=false;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyT',key:'t'}));requestAnimationFrame(tick)})`)
 assert.ok(Math.abs(downhill.start.pitch)>.03);assert.ok(downhill.phases.some(p=>p.phase==='boost'&&Math.abs(p.pitch)>.03));assert.ok(downhill.armor&&downhill.elapsed<4.5)
 await wait(100);fs.writeFileSync(dir+'/downhill-armor-complete.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(errors,[])
 const report={formation,downhill,errors};fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={}};true').catch(()=>{});c.close()}
