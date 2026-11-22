import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/retry-scout-balance',wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
fs.mkdirSync(dir,{recursive:true})
try{
 let ready=false;for(let i=0;i<720;i++){if(await c.evaluate('!!window.__MOSPEADA__?.runtime.retryDefeat&&!!window.__FOREST_STAGE4__&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}await wait(250)}assert.ok(ready)
 const report=await c.evaluate(`(async()=>{
  window.__FOREST_OPENING__?.finish();const {damagePlayer,playerCombat}=await import('/src/player/playerCombat.js'),{SCOUT_PATROL,SCOUT_ATTACK_DAMAGE}=await import('/src/world/forest/DesertScoutPatrol.js'),d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;
  const key=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true}));
  if(!w.bound)w.bind({x:0,y:0,z:-2400});const checkpoint=w.startAt(900);w.checkpoint=checkpoint;d.runtime.resetAt(checkpoint);r.paused=true;
  const state=r.state;damagePlayer(1000);const before={dead:playerCombat.dead,ready:r.defeat?.ready||false,paused:r.paused};key();
  const immediate={newState:r.state!==state,health:playerCombat.playerHealth,dead:playerCombat.dead,paused:r.paused,checkpoint:Math.abs(r.state.z-checkpoint.z)<.01};
  r.paused=true;damagePlayer(1000);r.defeat={age:0,ready:false};const button=document.querySelector('.ride-defeat-overlay button');r.retryDefeat();const command={health:playerCombat.playerHealth,dead:playerCombat.dead};
  r.paused=true;const live=r.state;key();const liveReset={newState:r.state!==live,health:playerCombat.playerHealth,paused:r.paused};
  if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();const climaxStart=w.prepareClimaxRetry(d.rig.metrics);if(climaxStart)r.resetAt(climaxStart);else r.resetAt(w.startAt(900));r.climaxSequence.phase='battle';r.paused=true;damagePlayer(1000);r.defeat={age:0,ready:false};key();
  window.__RETRY_QA__={playerCombat,damagePlayer,oldState:r.state};
  return{before,immediate,command,liveReset,climaxRequested:r.pendingDefeatRetry,balance:{damage:SCOUT_ATTACK_DAMAGE,health:SCOUT_PATROL.hitsToDown,cooldown:SCOUT_PATROL.playerHitCooldown,aimLead:SCOUT_PATROL.aimLead,attackInterval:SCOUT_PATROL.attackInterval,shotSpacing:SCOUT_PATROL.shotSpacing}};
 })()`)
 assert.ok(report.before.dead&&!report.before.ready&&report.before.paused);assert.ok(report.immediate.newState&&report.immediate.checkpoint&&!report.immediate.dead&&!report.immediate.paused);assert.equal(report.immediate.health,100);assert.equal(report.command.health,100);assert.ok(report.liveReset.newState&&!report.liveReset.paused);assert.ok(report.climaxRequested)
 let retried=false;for(let i=0;i<200;i++){if(await c.evaluate('!__MOSPEADA__.runtime.pendingDefeatRetry&&!__RETRY_QA__.playerCombat.dead&&__MOSPEADA__.runtime.state!==__RETRY_QA__.oldState')){retried=true;break}await wait(100)}assert.ok(retried,'Paused climax death also returns to its real checkpoint')
 report.climax=await c.evaluate('({health:__RETRY_QA__.playerCombat.playerHealth,paused:__MOSPEADA__.runtime.paused,resume:__MOSPEADA__.runtime.resumeClimaxCheckpoint||__MOSPEADA__.runtime.climaxSequence.active,z:__MOSPEADA__.runtime.state.z})');assert.equal(report.climax.health,100)
 await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={};true')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{c.close()}
