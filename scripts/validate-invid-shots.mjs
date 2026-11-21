import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/invid-eight-round-bursts',report={}
fs.mkdirSync(dir,{recursive:true})
const ev=code=>c.evaluate(code),wait=ms=>new Promise(r=>setTimeout(r,ms))
const frames=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))')
async function capture(name){await frames();fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
  let ready=false
  for(let i=0;i<480;i++){
    if(await ev('!!window.__MOSPEADA__?.runtime.combatVFX?.impacts.atlases.terrain&&!!window.__FOREST_STAGE4__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")')){ready=true;break}
    await wait(250)
  }
  assert.ok(ready,'Scene and terrain sprite finish preparing')
  await ev('window.__FOREST_OPENING__?.finish();true')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await ev(`(async()=>{const T=await import('/node_modules/.vite/deps/three.js'),d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});d.runtime.resetAt(w.startAt(900));d.runtime.paused=true;window.__SHOT_QA__={T,p:__DESERT_SCOUTS__.patrol,fx:d.runtime.combatVFX,weapon:d.runtime.gallant.weapon,w};return true})()`)
  await frames()
  await ev(`(()=>{const q=__SHOT_QA__,d=__MOSPEADA__,s=d.runtime.state;q.p.reset();q.p.phase='active';q.p.time=10;q.p.previousPlayer.set(s.x,s.height,s.z);q.fx.clear(true);q.fx.previousTime=10;
    for(const r of q.p.scouts){const x=s.x+(r.id-2)*6,z=s.z-22;r.position.set(x,d.sample(x,z)+3,z);r.meleeEnabled=true;r.yaw=0;r.pitch=r.bank=0;r.cooldown=Infinity;r.view.root.visible=true;q.p.applyView(r)}
    q.p.scouts[2].cooldown=0;d.setCameraMode(3);d.runtime.orbit.target.set(s.x,s.height+3,s.z-12);d.camera.position.set(s.x+6,s.height+7,s.z+5);d.runtime.orbit.update();
    q.rounds=[];q.groundHits=0;q.step=(dt)=>{const before=q.p.shots;q.p.update(dt,s,d.camera,q.w,{onImpact:b=>{q.groundHits++;q.fx.enemyWorldImpact(b.position,b.velocity)},onPlayerHit:b=>q.fx.enemyImpact(b.position,b.velocity)});if(q.p.shots>before)for(const b of q.p.bolts)if(b.active&&b.life>3.5-dt*1.1)q.rounds.push({time:q.p.time,side:b.launcher,round:b.burstRound,burst:b.burstId,vy:b.velocity.y});__MOSPEADA_VFX__.vfx.update(dt);q.fx.update(dt,q.p,q.weapon,d.camera)};return true})()`)
  report.blink=await ev(`(()=>{const q=__SHOT_QA__,a=__ANIME__,before=a.renderer.info.programs.length;for(let i=0;i<120&&!q.p.scouts[2].charging;i++)q.step(1/120);a.effect.render(a.state.snapshot(),1);const r=q.p.scouts[2],matrix=new q.T.Matrix4(),offsets=[];for(let i=0;i<q.fx.cannonFlashes.count;i++){q.fx.cannonFlashes.getMatrixAt(i,matrix);offsets.push(new q.T.Vector3().setFromMatrixPosition(matrix).distanceTo(r.view.muzzles[i].getWorldPosition(new q.T.Vector3())))}return {charging:r.charging,seconds:r.chargeLeft,shots:q.p.shots,discs:q.fx.cannonFlashes.count,offsets,programsAdded:a.renderer.info.programs.length-before}})()`)
  assert.equal(report.blink.shots,0);assert.equal(report.blink.discs,2);assert.ok(report.blink.seconds>=.04&&report.blink.seconds<=.08);assert.ok(report.blink.offsets.every(n=>Math.abs(n-.055)<1e-3))
  await capture('01-two-cannon-blink')
  report.projectile=await ev(`(()=>{const q=__SHOT_QA__,a=__ANIME__,before=a.renderer.info.programs.length;for(let i=0;i<30&&!q.p.shots;i++)q.step(1/120);const b=q.p.bolts.find(b=>b.active),r=q.p.scouts[2],sourceError=b.source.distanceTo(r.view.muzzles[b.launcher].getWorldPosition(new q.T.Vector3()));q.step(.025);a.effect.render(a.state.snapshot(),1);return {shots:q.p.shots,sourceError,speed:b.velocity.length(),halos:q.fx.ovals.count,cores:q.fx.ovalCores.count,beamStreaks:q.fx.shell.count,discs:q.fx.cannonFlashes.count,programsAdded:a.renderer.info.programs.length-before}})()`)
  assert.equal(report.projectile.shots,1);assert.ok(report.projectile.sourceError<1e-5);assert.ok(Math.abs(report.projectile.speed-42)<1e-5);assert.equal(report.projectile.halos,1);assert.equal(report.projectile.beamStreaks,0);assert.equal(report.projectile.discs,0)
  await capture('02-white-violet-oval')
  report.burst=await ev(`(()=>{const q=__SHOT_QA__,a=__ANIME__,before=a.renderer.info.programs.length;for(let i=0;i<240&&q.p.shots<8;i++)q.step(1/120);q.step(.1);a.effect.render(a.state.snapshot(),1);return {rounds:q.rounds.slice(),groundHits:q.groundHits,liveBolts:q.p.bolts.filter(b=>b.active).length,terrainSprites:q.fx.impacts.terrainSprites.count,programsAdded:a.renderer.info.programs.length-before}})()`)
  assert.equal(report.burst.rounds.length,8);assert.deepEqual(report.burst.rounds.map(b=>b.round),[0,1,2,3,4,5,6,7]);assert.ok(report.burst.rounds.every(b=>b.vy<0));assert.ok(report.burst.groundHits>0)
  for(let i=1;i<8;i++)assert.notEqual(report.burst.rounds[i].side,report.burst.rounds[i-1].side)
  assert.ok(report.burst.rounds[7].time-report.burst.rounds[0].time<1);assert.equal(report.burst.programsAdded,0)
  await capture('03-eight-round-ground-sweep')
  report.pause=await ev(`(()=>{const q=__SHOT_QA__;for(let i=0;i<480&&q.p.shots<9;i++)q.step(1/120);return {rounds:q.rounds.length,seconds:q.rounds[8].time-q.rounds[7].time}})()`)
  assert.equal(report.pause.rounds,9);assert.ok(report.pause.seconds>=2&&report.pause.seconds<2.6)
  report.impact=await ev(`(async()=>{const q=__SHOT_QA__,d=__MOSPEADA__,s=d.runtime.state,{launchEnergyProjectile,advanceEnergyProjectiles}=await import('/src/vehicle/EnergyProjectiles.js');q.p.bolts.forEach(b=>b.active=false);q.p.scouts[2].cooldown=Infinity;q.p.scouts[2].charging=false;q.fx.clear();const origin=new q.T.Vector3(s.x+3,s.height+7,s.z-9),to=origin.clone();to.y-=15;launchEnergyProjectile(q.p.bolts,origin,to,42,2);let hit=false;for(let i=0;i<50&&!hit;i++)advanceEnergyProjectiles(q.p.bolts,s,.02,{worldQuery:q.p.worldQuery,onWorldHit:b=>{hit=true;q.fx.enemyWorldImpact(b.position,b.velocity)}});q.fx.update(0,q.p,q.weapon,d.camera);return {hit,terrain:q.fx.impacts.terrainSprites.count,fire:q.fx.impacts.fire.count,rings:q.fx.impacts.rings.count,hitSparks:q.fx.systems[0].particleNum,atlas:[q.fx.impacts.atlases.terrain.image.width,q.fx.impacts.atlases.terrain.image.height]}})()`)
  assert.ok(report.impact.hit);assert.equal(report.impact.terrain,1);assert.equal(report.impact.fire,0);assert.equal(report.impact.rings,0);assert.equal(report.impact.hitSparks,0)
  await ev('__SHOT_QA__.fx.update(.105,__SHOT_QA__.p,__SHOT_QA__.weapon,__MOSPEADA__.camera);true')
  await capture('03-ground-dust-debris')
  report.animation=await ev(`(()=>{const q=__SHOT_QA__,a=__ANIME__,r=q.fx.impacts.records.find(r=>r.name==='invidGroundImpact'&&r.age<r.life),before=a.renderer.info.programs.length,frames=[];r.age=0;for(let i=0;i<12;i++){q.fx.update(i===0?0:.035,q.p,q.weapon,__MOSPEADA__.camera);frames.push(r.frame);a.effect.render(a.state.snapshot(),1)}q.fx.update(.1,q.p,q.weapon,__MOSPEADA__.camera);return {frames:[...new Set(frames)],programsAdded:a.renderer.info.programs.length-before,remaining:q.fx.impacts.stats.active,terrainRemaining:q.fx.impacts.terrainSprites.count}})()`)
  assert.equal(report.animation.frames.length,12);assert.equal(report.animation.programsAdded,0);assert.equal(report.animation.remaining,0)
  report.cadence=await ev(`(()=>{const q=__SHOT_QA__,s=__MOSPEADA__.runtime.state;q.p.reset();q.p.phase='active';q.p.previousPlayer.set(s.x,s.height,s.z);for(const r of q.p.scouts){r.position.set(s.x+(r.id-2)*6,s.height+3,s.z-32);r.yaw=0;r.cooldown=1+r.id*.3;r.meleeEnabled=true;r.view.root.visible=true;q.p.applyView(r)}const times=[];for(let i=0;i<1800;i++){const before=q.p.shots;q.p.update(1/60,s,__MOSPEADA__.camera,q.w);if(q.p.shots>before)times.push(q.p.time)}return {seconds:q.p.time,shots:q.p.shots,perScout:q.p.scouts.map(r=>r.shots),minSpacing:Math.min(...times.slice(1).map((t,i)=>t-times[i])),maxBolts:q.p.bolts.length}})()`)
  assert.ok(report.cadence.shots>200);assert.equal(report.cadence.maxBolts,64)
  report.integrity=await ev('({gl:__ANIME__.renderer.getContext().getError(),error:__ANIME__.state.snapshot().error,sceneLights:__SHOT_QA__.fx.root.children.filter(o=>o.isLight).length})')
  assert.equal(report.integrity.gl,0);assert.equal(report.integrity.error,'');assert.equal(report.integrity.sceneLights,0)
  report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{c.close()}
