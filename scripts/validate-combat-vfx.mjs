import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/invid-integrated-destruction',report={}
fs.mkdirSync(dir,{recursive:true})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const frames=(n=2)=>c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)
const ev=code=>c.evaluate(code)
async function capture(name){await frames();fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function tick(seconds){return ev(`(()=>{const q=__COMBAT_QA__;for(let t=0;t<${seconds};t+=1/120){__MOSPEADA_VFX__.vfx.update(1/120);q.fx.update(1/120,q.p,q.weapon,__MOSPEADA__.camera)}return {...q.fx.impacts.stats}})()`)}
async function hit(id){return ev(`(()=>{const q=__COMBAT_QA__,r=q.p.scouts[${id}],from=new q.T.Vector3();q.weapon.getMuzzle(from);const to=r.position.clone();to.y+=2.8;const result=q.query.fire(new q.T.Ray(from,to.sub(from).normalize()));if(!result.hit)throw Error('Missed Scout '+${id});q.fx.shot(q.weapon,result,q.p);q.fx.update(0,q.p,q.weapon,__MOSPEADA__.camera);return {id:r.id,hits:r.hits,health:r.health,destroyed:result.destroyed,contact:q.fx.contactPoint.toArray(),normal:q.fx.contactNormal.toArray()}})()`)}
async function defeat(id,spaced=false){let result;do{result=await hit(id);if(spaced&&!result.destroyed)await tick(.27)}while(!result.destroyed);return result}
async function arrange(){
  await ev(`(()=>{const q=__COMBAT_QA__,d=__MOSPEADA__,s=d.runtime.state;q.p.reset();q.p.phase='active';q.p.time=10;q.fx.clear(true);q.fx.previousTime=10;
    for(const r of q.p.scouts){const x=s.x+(r.id-2)*6,z=s.z-18-(r.id%2)*4;r.position.set(x,d.sample(x,z)+(r.id===1?0:3),z);r.meleeEnabled=true;r.yaw=0;r.pitch=r.bank=0;r.view.root.visible=true;q.p.applyView(r)}
    d.setCameraMode(3);d.runtime.orbit.target.set(s.x,s.height+2,s.z-12);d.camera.position.set(s.x+10,s.height+7,s.z+6);d.runtime.orbit.update();return true})()`)
  await frames()
}
try{
  await c.send('Page.reload',{ignoreCache:false});await wait(1000)
  let ready=false
  for(let i=0;i<480;i++){
    if(await ev('!!window.__MOSPEADA_VFX__?.combat?.impacts&&!!window.__FOREST_STAGE4__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")')){ready=true;break}
    // combat is also reachable through the runtime on older debug snapshots.
    if(await ev('!!window.__MOSPEADA__?.runtime.combatVFX?.impacts&&!!window.__FOREST_STAGE4__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")')){ready=true;break}
    await wait(250)
  }
  assert.ok(ready,'Combat scene becomes ready')
  await ev('window.__FOREST_OPENING__?.finish();true')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await ev(`(async()=>{const T=await import('/node_modules/.vite/deps/three.js'),{GallantHitscan}=await import('/src/vehicle/GallantShot.js'),d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});d.runtime.resetAt(w.startAt(900));d.runtime.paused=true;window.__COMBAT_QA__={T,p:__DESERT_SCOUTS__.patrol,fx:d.runtime.combatVFX,weapon:d.runtime.gallant.weapon,query:new GallantHitscan()};return true})()`)
  await frames(3);await arrange()
  report.single=await hit(2);assert.equal(report.single.hits,1);assert.equal(report.single.destroyed,false)
  await tick(.035);await capture('01-scout-hit')
  report.single.visiblePixels=await ev(`(()=>{const a=__ANIME__,fx=__COMBAT_QA__.fx,g=a.renderer.getContext(),meshes=[fx.flashMesh,...fx.impacts.meshes,...fx.batches];
    const read=()=>{const data=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,data);return data};
    a.effect.render(a.state.snapshot(),1);const on=read();meshes.forEach(m=>m.visible=false);a.effect.render(a.state.snapshot(),1);const off=read();meshes.forEach(m=>m.visible=true);
    let pixels=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])pixels++;return pixels})()`)
  assert.ok(report.single.visiblePixels>20,'A single impact visibly changes the anime render')
  await tick(.12);await hit(2);await tick(.06);await hit(2);await tick(.035);await capture('02-consecutive-hits')
  report.airborne=await defeat(2,true);assert.equal(report.airborne.hits,10)
  await tick(.015);await capture('03-explosion-flash')
  report.ignition=await ev('({...__COMBAT_QA__.fx.scoutVisual(__COMBAT_QA__.p.scouts[2]),recoil:undefined,tint:undefined,normal:undefined})')
  assert.ok(report.ignition.visible&&report.ignition.emissive>0&&report.ignition.opacity===1)
  await tick(.095);await capture('04-body-fire-overlap')
  report.overlap=await ev('({visible:__COMBAT_QA__.fx.scoutVisual(__COMBAT_QA__.p.scouts[2]).visible,opacity:__COMBAT_QA__.fx.scoutVisual(__COMBAT_QA__.p.scouts[2]).opacity,batches:__DESERT_SCOUTS__.batches.reduce((n,b)=>n+b.count,0),fire:__COMBAT_QA__.fx.impacts.airSprites.count})')
  assert.ok(report.overlap.visible&&report.overlap.opacity===1&&report.overlap.batches===5&&report.overlap.fire===1)
  await tick(.12);await capture('05-airborne-fire-core-halo')
  report.hidden=await ev('({visible:__COMBAT_QA__.fx.scoutVisual(__COMBAT_QA__.p.scouts[2]).visible,batches:__DESERT_SCOUTS__.batches.reduce((n,b)=>n+b.count,0)})')
  assert.equal(report.hidden.visible,false);assert.equal(report.hidden.batches,4)
  await tick(.48);await capture('06-residual-smoke')
  report.smokeTail=await ev('({air:__COMBAT_QA__.fx.impacts.airSprites.count,smoke:__COMBAT_QA__.fx.impacts.residualSmoke.count,pointLights:__COMBAT_QA__.fx.impacts.deathLights.map(l=>l.intensity)})')
  assert.equal(report.smokeTail.air,0);assert.ok(report.smokeTail.smoke>0);assert.ok(report.smokeTail.pointLights.every(n=>n===0))
  await tick(.8)
  report.cleared=await ev('({active:__COMBAT_QA__.fx.impacts.stats.active,particles:__COMBAT_QA__.fx.systems.reduce((n,p)=>n+p.particleNum,0),lights:__COMBAT_QA__.fx.impacts.lights.map(l=>l.intensity)})')
  assert.equal(report.cleared.active,0);assert.equal(report.cleared.particles,0);assert.ok(report.cleared.lights.every(v=>v===0))
  report.ground=await defeat(1);await tick(.22);await capture('06-ground-explosion');await tick(1.2)
  await arrange();for(let id=0;id<5;id++)await defeat(id)
  await tick(.1)
  report.realLighting=await ev(`(()=>{const a=__ANIME__,fx=__COMBAT_QA__.fx,g=a.renderer.getContext(),lights=fx.impacts.deathLights,powers=lights.map(l=>l.intensity),read=()=>{const data=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,data);return data};a.effect.render(a.state.snapshot(),1);const on=read();lights.forEach(l=>l.intensity=0);a.effect.render(a.state.snapshot(),1);const off=read();lights.forEach((l,i)=>l.intensity=powers[i]);let pixels=0;for(let i=0;i<on.length;i+=4)if(on[i]!==off[i]||on[i+1]!==off[i+1]||on[i+2]!==off[i+2])pixels++;return {powers,pixels,pooled:lights.length,allNative:lights.every(l=>l.isPointLight&&l.visible&&!l.castShadow)}})()`)
  assert.ok(report.realLighting.allNative&&report.realLighting.powers.some(n=>n>0)&&report.realLighting.pixels>100)
  await tick(.12);await capture('07-five-explosions')
  report.simultaneous=await ev('({explosions:__COMBAT_QA__.fx.stats.explosions,active:__COMBAT_QA__.fx.impacts.stats.active,fragments:__COMBAT_QA__.fx.impacts.fragments.count,smoke:__COMBAT_QA__.fx.impacts.smoke.count,particles:__COMBAT_QA__.fx.systems.map(p=>p.particleNum)})')
  assert.equal(report.simultaneous.explosions,5);assert.equal(report.simultaneous.fragments,25);assert.ok(report.simultaneous.smoke>0)
  await tick(1.3)
  report.laser=await ev(`(async()=>{const q=__COMBAT_QA__,d=__MOSPEADA__,s=d.runtime.state,{launchEnergyProjectile,advanceEnergyProjectiles}=await import('/src/vehicle/EnergyProjectiles.js');const origin=new q.T.Vector3(s.x+3,s.height+8,s.z-8),to=origin.clone();to.y-=12;launchEnergyProjectile(q.p.bolts,origin,to,30,2);let hit=false;advanceEnergyProjectiles(q.p.bolts,s,.4,{worldQuery:q.query,onWorldHit:b=>{hit=true;q.fx.enemyImpact(b.position,b.velocity)}});q.fx.update(0,q.p,q.weapon,d.camera);return {hit,active:q.fx.impacts.stats.active}})()`)
  assert.ok(report.laser.hit);await tick(.04);await capture('08-violet-ground-impact');await tick(.4)
  await ev('(()=>{const r=__MOSPEADA__.runtime;r.state.speed=10;r.state.idleBlend=0;r.state.parked=false;r.keys.KeyW=true;r.boostQueued=true;r.paused=false;return true})()')
  await frames(2)
  report.movingBoost=await ev('(()=>{const q=__COMBAT_QA__,d=__MOSPEADA__,s=d.runtime.state,point=new q.T.Vector3(s.x+1,s.height+.5,s.z-3);q.fx.enemyImpact(point,new q.T.Vector3(0,-1,0));q.fx.update(0,q.p,q.weapon,d.camera);return {speed:s.speed,boostCount:s.boostCount,boostBlend:s.boostBlend,active:q.fx.impacts.stats.active}})()')
  assert.ok(report.movingBoost.speed>10&&report.movingBoost.boostCount>0&&report.movingBoost.active>0)
  await capture('09-moving-boost-impact');await frames(8)
  await ev('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={};__MOSPEADA__.runtime.boostQueued=false')
  await tick(.4)
  report.animation=await ev(`(()=>{const q=__COMBAT_QA__,d=__MOSPEADA__,a=__ANIME__,s=d.runtime.state;
    const target={position:new q.T.Vector3(s.x+2,s.height+3,s.z-10),height:5.2,radius:2.3,dead:true};q.fx.destroyTarget(target);
    const burst=q.fx.impacts.records.find(r=>r.name==='invidExplosion'&&r.age<r.life),frames=[],before=a.renderer.info.programs.length;
    for(let i=0;i<21;i++){__MOSPEADA_VFX__.vfx.update(.03);q.fx.update(.03,q.p,q.weapon,d.camera);if(burst.age<burst.life)frames.push(burst.frame);a.effect.render(a.state.snapshot(),1)}
    return {frames:[...new Set(frames)],programsAdded:a.renderer.info.programs.length-before,airSize:[q.fx.impacts.atlases.air.image.width,q.fx.impacts.atlases.air.image.height],groundSize:[q.fx.impacts.atlases.ground.image.width,q.fx.impacts.atlases.ground.image.height],rings:q.fx.impacts.rings.count,groundSprites:q.fx.impacts.groundSprites.count,airSprites:q.fx.impacts.airSprites.count}})()`)
  assert.equal(report.animation.frames.length,12);assert.equal(report.animation.programsAdded,0);assert.equal(report.animation.rings,0)
  await tick(.6)
  report.integrity=await ev('({gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error,systems:__COMBAT_QA__.fx.systems.length,bursts:__COMBAT_QA__.fx.impacts.records.length,lights:__COMBAT_QA__.fx.impacts.lights.length,remaining:__COMBAT_QA__.fx.impacts.stats.active})')
  assert.equal(report.integrity.gl,0);assert.equal(report.integrity.shader,'');assert.equal(report.integrity.remaining,0)
  report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  assert.deepEqual(report.errors,[])
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={};__MOSPEADA__.runtime.boostQueued=false').catch(()=>{});c.close()}
