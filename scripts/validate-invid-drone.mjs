import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'

// Dedicated local Chrome on 9333; closes that browser on completion.
const c=await connect(),dir='artifacts/invid-drone',report={},wait=ms=>new Promise(r=>setTimeout(r,ms)),ev=code=>c.evaluate(code)
fs.mkdirSync(dir,{recursive:true})
async function until(code,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){if(await ev(code))return;await wait(150)}throw Error('Timed out: '+code)}
async function photo(name){fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
const mouse=(type,button,buttons)=>c.send('Input.dispatchMouseEvent',{type,button,buttons,x:640,y:400,clickCount:1})
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
 await c.send('Page.addScriptToEvaluateOnNewDocument',{source:'performance.setResourceTimingBufferSize(20000)'})
 await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest&intro=1'})
 await until("!!window.__MOSPEADA__?.runtime.stage3?.squad&&!!window.__FOREST_STAGE3_WORLD__&&window.__STREAMING__?.ready('stage3')&&!document.querySelector('#entry-preloader')")
 report.prepared=await ev(`(()=>{const a=__ANIME__,r=__MOSPEADA__.runtime,s=r.stage3.squad;return{batches:s.batches.length,instanced:s.batches.every(b=>b.isInstancedMesh),capacity:s.batches.map(b=>b.instanceMatrix.count),triangles:s.batches.map(b=>b.geometry.index.count/3),mapsShared:s.batches.every(b=>b.material===s.batches[0].material),streaming:{...a.effect.stats.streaming.stage3},requests:performance.getEntriesByType('resource').filter(e=>e.name.includes('/delivery/invid-drone.glb')).length,originalRequested:performance.getEntriesByType('resource').some(e=>e.name.includes('invid_drone.glb'))}})()`)
 report.prepared.registered=await ev('(()=>{const a=__ANIME__,s=__MOSPEADA__.runtime.stage3.squad;return s.root.children.length===3&&s.batches.every(b=>a.scene.getObjectById(b.id)===b)&&a.effect.bindings.filter(b=>s.batches.includes(b.object)).length===3})()')
 assert.equal(report.prepared.batches,3);assert.ok(report.prepared.instanced&&report.prepared.mapsShared&&report.prepared.registered);assert.deepEqual(report.prepared.capacity,[11,11,11]);assert.equal(report.prepared.requests,1);assert.equal(report.prepared.originalRequested,false)
 await ev(`(async()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,{FOREST_STAGE3:S,stage3PathX,stage3Yaw}=await import('/src/world/forest/forestStage3Config.js'),{playerCombat}=await import('/src/player/playerCombat.js');const z=S.triggerZ-2;r.resetAt({x:stage3PathX(z),z,yaw:stage3Yaw(z),label:'Drone QA'});r.keys={};r.state.speed=0;r.state.parked=true;r.paused=false;playerCombat.playerHealth=10000;window.__DRONE_QA__={playerCombat};return true})()`)
 await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV'})
 await until('__MOSPEADA__.runtime.stage3.encounter.drones.filter(d=>d.spawned).length===2',20000)
 await wait(700)
 report.firstWave=await ev(`(()=>{const r=__MOSPEADA__.runtime,e=r.stage3.encounter;return{phase:e.phase,enemyShots:e.enemyShots,counts:r.stage3.squad.batches.map(b=>b.count),flightLoop:!!r.stage3.flightAudio.loop,audioState:__SFX__.audioContext.state}})()`)
 assert.equal(report.firstWave.phase,'active');assert.equal(report.firstWave.counts.reduce((a,b)=>a+b),2);assert.ok(report.firstWave.flightLoop);assert.equal(report.firstWave.audioState,'running');await photo('01-native-first-wave')
 // A stationary visual fixture isolates real mouse aiming/firing from route
 // movement. Targeting, the three-hit rule, VFX and sound remain native.
 await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,e=r.stage3.encounter,q=__DRONE_QA__;q.move=e.move;e.reset();e.phase='active';e.waveIndex=0;e.move=()=>{};const drone=e.drones[0];drone.spawned=drone.initialized=true;drone.position.set(r.state.x+.3,r.state.height+3,r.state.z-16);q.drone=drone;r.combatVFX.clear();d.setCameraMode(0);r.cameraController.reset(r.state);q.explosions=0;q.play=__SFX__.play;__SFX__.play=function(name,options){if(name==='droneExplosion')q.explosions++;return q.play.call(this,name,options)};return true})()`)
 await mouse('mouseMoved','none',0);await mouse('mousePressed','right',2)
 await until('__MOSPEADA__.runtime.gallant.aimLock.target===__DRONE_QA__.drone',15000)
 await photo('02-native-model-lock')
 await mouse('mousePressed','left',3);await until('__DRONE_QA__.drone.dead',15000);await mouse('mouseReleased','left',2);await mouse('mouseReleased','right',0)
 report.destroyed=await ev(`(()=>{const r=__MOSPEADA__.runtime,e=r.stage3.encounter;return{hp:__DRONE_QA__.drone.hp,shots:e.shots,kills:e.kills,explosions:__DRONE_QA__.explosions}})()`)
 assert.deepEqual(report.destroyed,{hp:0,shots:3,kills:1,explosions:1})
 await wait(600);report.hidden=await ev(`({counts:__MOSPEADA__.runtime.stage3.squad.batches.map(b=>b.count),flightLoop:!!__MOSPEADA__.runtime.stage3.flightAudio.loop})`)
 assert.ok(report.hidden.counts.every(n=>n===0));assert.equal(report.hidden.flightLoop,false);await photo('03-native-destruction')
 report.reused=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,e=r.stage3.encounter,s=r.stage3.squad,q=__DRONE_QA__;r.paused=true;const buffers=s.batches.map(b=>b.instanceMatrix.array),maps=s.batches.map(b=>b.material.map),levels=[];for(const distance of[10,30,90]){e.reset();e.phase='active';e.waveIndex=0;for(let i=0;i<3;i++){const drone=e.drones[i];drone.spawned=true;drone.position.copy(d.camera.position);drone.position.z-=distance;drone.position.x+=i*2}s.update(e,r.state,d.camera.position);levels.push(s.batches.map(b=>b.count))}e.move=q.move;e.reset();s.update(e,r.state,d.camera.position);__SFX__.play=q.play;return{levels,pooled:s.batches.every((b,i)=>b.instanceMatrix.array===buffers[i]&&b.material.map===maps[i]),empty:s.batches.every(b=>b.count===0),requests:performance.getEntriesByType('resource').filter(e=>e.name.includes('/delivery/invid-drone.glb')).length,gl:__ANIME__.renderer.getContext().getError()}})()`)
 report.logs=c.events.filter(e=>e.method==='Log.entryAdded'||e.method==='Runtime.consoleAPICalled').filter(e=>e.params.entry?.level==='error'||e.params.entry?.level==='warning'||['error','warning','warn'].includes(e.params.type)).map(e=>e.params.entry?.text||e.params.args?.map(a=>a.value||a.description).join(' ')).slice(-30)
 assert.deepEqual(report.reused.levels,[[3,0,0],[0,3,0],[0,0,3]]);assert.ok(report.reused.pooled&&report.reused.empty);assert.equal(report.reused.requests,1);assert.equal(report.reused.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 if(!process.env.MOSPEADA_KEEP_QA)await c.send('Browser.close').catch(()=>{});c.close()
}
