import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),ev=code=>c.evaluate(code),dir='artifacts/progressive-ambush',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=90){for(let i=0;i<seconds*10;i++){if(await ev(code))return;await wait(100)}throw Error('Timed out: '+code)}
async function screenshot(name){fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
 await until('!!window.__MOSPEADA__?.runtime.gallant&&!!window.__DESERT_SCOUTS__&&!document.querySelector("#entry-preloader")')
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();w.updateClimax(2430,2485);r.resetAt(w.startAt(900));r.pendingDefeatRetry=true;r.paused=false;return true})()`)
 await until('!!__DESERT_SCOUTS__.climax&&__DESERT_SCOUTS__.sequence.phase==="battle"&&!__MOSPEADA__.runtime.pendingDefeatRetry')
 const report={ambush:await ev(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,p=__DESERT_SCOUTS__.climax,w=__FOREST_STAGE4__.world;r.paused=true;r.keys={};r.combatVFX?.clear();p.startClimax(w);p.beginAmbush();r.randEscape.protected=true
  const before=p.scouts.map(s=>s.position.clone());p.previousPlayer.set(r.state.x,r.state.height,r.state.z)
  for(let i=0;i<200;i++)p.update(.05,r.state,d.camera,w,{allowAttack:false})
  return{count:p.scouts.length,activated:p.patrols.map(g=>g.activated),reserve:p.scouts.slice(10).map(s=>({shots:s.shots,focus:s.focus,damage:s.meleeEnabled})),secondTravel:p.scouts.slice(5,10).map(s=>s.position.distanceTo(before[s.id])),batches:w.climaxPlain.scenery.meshes.length,instanced:w.climaxPlain.scenery.meshes.every(m=>m.isInstancedMesh),far:d.camera.far,gl:__ANIME__.renderer.getContext().getError()}
 })()`)}
 assert.equal(report.ambush.count,15);assert.deepEqual(report.ambush.activated,[true,true,false]);assert.ok(report.ambush.reserve.every(s=>!s.damage&&s.shots===0&&s.focus===null));assert.ok(report.ambush.secondTravel.every(d=>d>200));assert.equal(report.ambush.batches,4);assert.ok(report.ambush.instanced);assert.equal(report.ambush.gl,0)
 await screenshot('01-desert-approaching-patrols')
 // A native mounted Gallant and real mouse input, with one stationary cube
 // fixture so only acquisition, tracking and muzzle damage are under test.
 const pointer=await ev(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,p=r.desertPatrol,e=r.stage3.encounter,c=r.gallant;window.__AMBUSH_QA__={p,update:p.update,e,move:e.move};p.stopCombat();p.update=()=>{};e.reset();e.phase='active';e.waveIndex=0;e.move=()=>{}
  const a=e.drones[0];a.spawned=a.initialized=true;a.position.set(r.state.x+.3,r.state.height+3.6,r.state.z-18);window.__AMBUSH_QA__.drone=a
  for(const scout of p.scouts)scout.view.root.visible=false
  c.aiming=c.firing=false;c.aimLock.clear();r.state.speed=0;r.state.yaw=Math.PI;r.paused=false;d.setCameraMode(0);r.cameraController.reset(r.state)
  const rect=__ANIME__.renderer.domElement.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}
 })()`)
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pointer})
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...pointer,button:'right',buttons:2,clickCount:1})
 await until('__MOSPEADA__.runtime.gallant.aimLock.target===__AMBUSH_QA__.drone',10)
 await ev('__AMBUSH_QA__.drone.position.x+=1.5;true');await wait(250)
 report.drone=await ev(`({locked:__MOSPEADA__.runtime.gallant.aimLock.target===__AMBUSH_QA__.drone,marker:document.querySelector('.armor-reticle').dataset.locked,trackingError:__MOSPEADA__.runtime.gallant.aimLock.point.distanceTo(__AMBUSH_QA__.drone.position)})`)
 assert.ok(report.drone.locked);assert.equal(report.drone.marker,'true');assert.equal(report.drone.trackingError,0)
 await screenshot('02-violet-drone-aim-lock')
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...pointer,button:'left',buttons:3,clickCount:1})
 await until('__AMBUSH_QA__.drone.dead',10)
 Object.assign(report.drone,await ev('({health:__AMBUSH_QA__.drone.hp,shots:__AMBUSH_QA__.e.shots,kills:__AMBUSH_QA__.e.kills,cleared:!__MOSPEADA__.runtime.gallant.aimLock.target})'))
 assert.equal(report.drone.health,0);assert.equal(report.drone.shots,3);assert.equal(report.drone.kills,1);assert.ok(report.drone.cleared)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{
 for(const button of ['left','right'])await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button,buttons:0,clickCount:1}).catch(()=>{})
 await ev(`(()=>{const r=window.__MOSPEADA__?.runtime,q=window.__AMBUSH_QA__;if(q){q.p.update=q.update;q.e.move=q.move;q.e.reset()}if(r){r.paused=true;r.gallant.aiming=r.gallant.firing=false;r.gallant.aimLock.clear()}return true})()`).catch(()=>{});c.close()
}
