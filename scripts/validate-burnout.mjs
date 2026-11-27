import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),report={},dir='artifacts/burnout',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error('Timed out: '+expression)}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code.slice(3).toLowerCase()})}
async function tap(code){await key(code,true);await key(code,false)}
async function sample(){return c.evaluate(`(()=>{const d=__MOSPEADA__,s=d.runtime.state,e=__CYCLONE_ENGINE_AUDIO__,v=__MOSPEADA_VFX__,w=d.runtime.weathering.contacts.wheels;return{...s.burnout,speed:s.speed,yaw:s.yaw,yawRate:s.yawRate,lean:s.lean,frontSpin:s.frontAngularSpeed,rearSpin:s.rearAngularSpeed,grounded:s.frontGrounded&&s.rearGrounded,logicalFront:[s.x+Math.sin(s.yaw)*d.rig.metrics.frontZ,s.z+Math.cos(s.yaw)*d.rig.metrics.frontZ],front:w.front.position.toArray(),rear:w.rear.position.toArray(),surface:w.rear.surface,dustRate:v.dust.response.rate,dustActive:v.dust.system.particleNum,emitted:v.dust.emitted,tracks:v.tracks.stats.emitted,trackActive:v.tracks.stats.active,rpm:e.model.output.rpm,engineRate:e.loop.playbackRate.value,sameEngine:e.loop===__BURNOUT_QA__.source}})()`)}
try{
 console.log('Waiting for gameplay preparation')
 await until("!!window.__CYCLONE_ENGINE_AUDIO__&&!!window.__MOSPEADA_VFX__&&!document.querySelector('#entry-preloader')",120000)
 await c.evaluate(`(async()=>{__MOSPEADA__.reset();(await import('/src/world/weatherState.js')).weatherState.setPreset('sunny');(await import('/src/vfx/vfxState.js')).vfxState.set({humidity:.1});return true})()`)
 await tap('KeyV');await until('!!__CYCLONE_ENGINE_AUDIO__.loop');await wait(400)
 await c.evaluate(`window.__BURNOUT_QA__={source:__CYCLONE_ENGINE_AUDIO__.loop};true`)
 console.log('Testing stationary and directional burnout')
 await key('KeyW',true);await key('KeyS',true);await until("__MOSPEADA__.runtime.state.burnout.phase==='holding'");await wait(1300)
 report.hold=await sample();assert.equal(report.hold.speed,0);assert.equal(report.hold.frontSpin,0);assert.ok(report.hold.rearSpin>45);assert.ok(report.hold.rpm>7000);assert.ok(report.hold.sameEngine);assert.ok(report.hold.grounded)
 await key('KeyA',true);await wait(150);report.turnStart=await sample();await wait(800);report.turn=await sample()
 assert.equal(report.turn.phase,'holding');assert.ok(Math.abs(report.turn.yawRate)>Math.abs(report.turnStart.yawRate));assert.ok(Math.abs(report.turn.lean)>.08)
 report.frontAnchorError=Math.hypot(...report.turn.logicalFront.map((v,i)=>v-report.hold.logicalFront[i]));assert.ok(report.frontAnchorError<1e-7)
 report.renderedFrontError=Math.hypot(report.turn.front[0]-report.hold.front[0],report.turn.front[2]-report.hold.front[2]);assert.ok(report.renderedFrontError<.22)
 assert.ok(report.turn.tracks>report.hold.tracks);assert.ok(report.turn.dustActive>0)
 await key('KeyA',false);await wait(30);report.inertia=await sample();assert.ok(Math.abs(report.inertia.yawRate)>.1)
 fs.writeFileSync(dir+'/01-directional-asphalt.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 // Reorient with the opposite steering control before testing the launch,
 // keeping its path along the highway rather than into its guardrail.
 await key('KeyD',true);await until(`__MOSPEADA__.runtime.state.yaw<${report.hold.yaw+.28}`);await key('KeyD',false)
 await wait(650)
 report.exit=await c.evaluate(`(async()=>{const s=__MOSPEADA__.runtime.state;window.__BURNOUT_QA__.exitStart={x:s.x,z:s.z,yaw:s.yaw};return __BURNOUT_QA__.exitStart})()`)
 await key('KeyS',false)
 console.log('Testing traction recovery')
 report.acceleration=await c.evaluate(`(async()=>{const s=__MOSPEADA__.runtime.state;let previous=s.speed,last=performance.now(),max=0;const end=last+1600;while(performance.now()<end){await new Promise(requestAnimationFrame);const now=performance.now();if(now>last)max=Math.max(max,(s.speed-previous)/((now-last)/1000));previous=s.speed;last=now}return{maximum:max,speed:s.speed,phase:s.burnout.phase,yaw:s.yaw,blocked:s.blocked}})()`)
 assert.equal(report.acceleration.phase,'idle');assert.ok(report.acceleration.speed>5);assert.ok(report.acceleration.maximum<13)
 report.running=await sample();assert.ok(report.running.sameEngine);await key('KeyW',false)
 await c.evaluate('__MOSPEADA__.reset("rough");true');await wait(400)
 console.log('Testing dirt contact and dust')
 await key('KeyW',true);await key('KeyS',true);await until("__MOSPEADA__.runtime.state.burnout.phase==='holding'");await wait(1500)
 report.dirt=await sample();assert.equal(report.dirt.surface,'dirt');assert.ok(report.dirt.dustRate>report.hold.dustRate*3);assert.ok(report.dirt.dustActive>20);assert.ok(report.dirt.trackActive>0);assert.ok(report.dirt.sameEngine)
 fs.writeFileSync(dir+'/02-dirt-dust-contact.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await key('KeyW',false);await key('KeyS',false);await until("__MOSPEADA__.runtime.state.burnout.phase==='idle'")
 report.stopped=await sample();assert.equal(report.stopped.rearSpin,0)
 report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 for(const code of ['KeyW','KeyS','KeyA','KeyD'])await key(code,false).catch(()=>{})
 await c.send('Browser.close').catch(()=>{});c.close()
}
