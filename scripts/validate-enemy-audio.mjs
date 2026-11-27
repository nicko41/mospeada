import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
try{
 for(let n=0;n<200;n++){if(await c.evaluate('!!window.__ENEMY_AUDIO_QA__'))break;await wait(100)}
 await c.send('Page.bringToFront');await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyV',key:'v',windowsVirtualKeyCode:86});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyV',key:'v',windowsVirtualKeyCode:86})
 for(let n=0;n<60;n++){if(await c.evaluate('__ENEMY_AUDIO_QA__.audio.audioContext.state==="running"'))break;await wait(50)}
 const report=await c.evaluate(`(()=>{
  const q=__ENEMY_AUDIO_QA__,a=q.audio,original=a.play,calls=[];a.play=function(name,options){const source=original.call(this,name,options);calls.push({name,loop:source?.loop,rate:source?.playbackRate.value,file:source?[...a.buffers].find(([,buffer])=>buffer===source.buffer)?.[0]:null});return source}
  const initialRequests=performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/sound/invid/')&&entry.name.endsWith('.mp3')).length
  const e=new q.CycloneShooterEncounter({onDestroyed:()=>a.play('droneExplosion')}),flight=new q.DroneFlightSound(a),listener={x:0,y:1,z:0},drone=e.drones[0]
  e.phase='active';drone.spawned=true;drone.position.set(0,1,-10);flight.update({encounter:e,listener});const source=flight.loop
  e.drones.forEach((drone,index)=>{drone.spawned=true;if(index)drone.position.set(0,3,-20)})
  for(let frame=0;frame<120;frame++)flight.update({encounter:e,listener})
  e.drones.slice(1).forEach(drone=>drone.spawned=false)
  const ray=new q.Ray(new q.Vector3(0,1,0),new q.Vector3(0,0,-1)),state={x:0,z:0,height:0,yaw:Math.PI}
  for(let hit=0;hit<3;hit++){e.fireCooldown=0;e.fire(ray,state)}e.fireCooldown=0;e.fire(ray,state)
  flight.update({encounter:e,listener});flight.update({encounter:e,listener,paused:true})
  e.reset();e.phase='active';e.drones[0].spawned=true;e.drones[0].position.set(0,1,-15);flight.update({encounter:e,listener})
  const reusedFlightBuffer=flight.loop?.buffer===source.buffer
  const patrol=new q.DesertScoutPatrol([{root:new q.Group()}],()=>0,()=>.5,{onDestroyed:()=>a.play('invidExplosion')}),direction=new q.Vector3(0,0,-1)
  for(const random of [.1,.5,.9]){patrol.reset();a.random=()=>random;patrol.scouts[0].meleeEnabled=true;patrol.scouts[0].receiveMissileHit(direction);patrol.scouts[0].receiveMissileHit(direction)}
  const result={calls,reusedFlightBuffer,flightVolume:a.getVolume('droneFlight'),explosionVolume:a.getVolume('droneExplosion'),buffers:a.buffers.size,files:[...a.buffers].map(([url,buffer])=>({url,duration:buffer.duration})),resources:q.resourceProgress.records().filter(record=>record.kind==='audio').map(record=>({url:record.url,state:record.state})),initialRequests,newRequests:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/sound/invid/')&&entry.name.endsWith('.mp3')).length-initialRequests}
  flight.dispose();a.play=original;return result
 })()`)
 assert.equal(report.buffers,6);assert.equal(report.initialRequests,6);assert.equal(report.newRequests,0);assert.ok(report.reusedFlightBuffer);assert.equal(report.flightVolume,1);assert.equal(report.explosionVolume,1)
 assert.equal(report.calls.filter(call=>call.name==='droneFlight').length,2);assert.equal(report.calls.filter(call=>call.name==='droneExplosion').length,1)
 const explosions=report.calls.filter(call=>call.name==='invidExplosion');assert.equal(explosions.length,3);assert.ok(explosions[0].file.endsWith('01-explode.mp3'));assert.ok(explosions[1].file.endsWith('02-explode.mp3'));assert.ok(explosions[2].file.endsWith('03-explode.mp3'))
 assert.ok(report.calls.every(call=>call.rate===1));assert.ok(report.files.every(file=>file.duration>0));assert.ok(report.resources.every(resource=>resource.state==='ready'))
 report.errors=c.events.filter(event=>event.method==='Runtime.exceptionThrown').map(event=>event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.mkdirSync('artifacts/enemy-audio',{recursive:true});fs.writeFileSync('artifacts/enemy-audio/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));console.log('Localhost HTTP status:',(await fetch('http://127.0.0.1:5173/')).status)
}finally{await c.send('Browser.close').catch(()=>{});c.close()}
