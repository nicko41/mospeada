import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect({port:9334}),ev=code=>c.evaluate(code),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/desert-combat-polish/collision'
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=120){for(let i=0;i<seconds*20;i++){if(await ev(code).catch(()=>false))return;await wait(50)}throw Error('Timed out: '+code)}
const frames=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))')
try{
 await until('!!window.__MOSPEADA__?.runtime.scottInstance?.hitMotion&&!!window.__DESERT_SCOUTS__&&!document.querySelector("#entry-preloader")')
 await ev('(()=>{__FOREST_OPENING__?.finish();const d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});d.runtime.resetAt(w.startAt(900));d.runtime.paused=true;return true})()');await frames()
 await ev('(async()=>{const d=__MOSPEADA__,r=d.runtime,s=r.state,p=__DESERT_SCOUTS__.opening,{playerCombat}=await import("/src/player/playerCombat.js");p.reset();p.phase="active";const target=p.scouts[0];target.position.set(s.x+Math.sin(s.yaw)*5,d.sample(s.x,s.z),s.z+Math.cos(s.yaw)*5);target.meleeEnabled=true;target.view.root.visible=true;target.mode="ground";target.yaw=s.yaw+Math.PI;p.applyView(target);window.__COLLISION_QA__={target,health:playerCombat.playerHealth,playerCombat,update:p.update,initial:{x:s.x,z:s.z}};p.update=()=>{};r.paused=false;s.speed=12;r.keys.KeyW=true;return true})()')
 await until('__MOSPEADA__.runtime.scottInstance.hitMotion.knockedDown',15)
 await until('__MOSPEADA__.runtime.scottInstance.hitMotion.age>.48',15)
 const report=await ev('(()=>{const d=__MOSPEADA__,r=d.runtime,q=__COLLISION_QA__,h=r.scottInstance.hitMotion;r.paused=true;r.keys={};return{variant:r.scottInstance.modelComparison.variant,knockedDown:h.knockedDown,phase:h.diagnostics.phase,kind:h.diagnostics.kind,riderMode:r.state.riderMode,speed:r.state.speed,boost:r.state.boostTime,health:q.playerCombat.playerHealth,initialHealth:q.health,distanceToInvid:Math.hypot(r.state.pedestrian.x-q.target.position.x,r.state.pedestrian.z-q.target.position.z),minimumDistance:Math.min(q.target.radius,q.target.height*.29)+.23}})()')
 assert.equal(report.variant,'v3');assert.ok(report.knockedDown);assert.equal(report.kind,'scout-body');assert.equal(report.riderMode,'onFoot');assert.equal(report.speed,0);assert.equal(report.health,report.initialHealth);assert.ok(report.distanceToInvid>=report.minimumDistance-.01)
 await ev('(()=>{const d=__MOSPEADA__,p=d.runtime.state.pedestrian;d.setCameraMode(3);d.runtime.orbit.enableDamping=false;d.runtime.orbit.maxDistance=30;d.runtime.orbit.target.set(p.x,p.ground+.8,p.z);d.camera.position.set(p.x+7,p.ground+3,p.z+6);d.runtime.orbit.update();return true})()');await frames()
 const url=await ev('(()=>{const a=__ANIME__;a.effect.render(a.state.snapshot(),1);return a.renderer.domElement.toDataURL("image/png")})()');fs.writeFileSync(dir+'/v3-back-fall.png',Buffer.from(url.split(',')[1],'base64'))
 await ev('__MOSPEADA__.runtime.paused=false;true');await until('!__MOSPEADA__.runtime.scottInstance.hitMotion.knockedDown',15)
 report.recovered=await ev('(()=>{const r=__MOSPEADA__.runtime;r.paused=true;return !r.scottInstance.hitMotion.knockedDown&&!__COLLISION_QA__.playerCombat.dead})()');assert.ok(report.recovered)
 report.gl=await ev('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2));console.log(report)
}finally{await ev('(()=>{if(window.__COLLISION_QA__)__DESERT_SCOUTS__.opening.update=__COLLISION_QA__.update;return true})()').catch(()=>{});c.close()}
