import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir=process.env.MOSPEADA_VFX_ARTIFACTS||'artifacts/combat-punch',report={}
const ev=code=>c.evaluate(code),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
fs.mkdirSync(dir,{recursive:true})
async function capture(name,prepare=''){
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const url=await ev(`(()=>{${prepare};__ANIME__.effect.render(__ANIME__.state.snapshot(),1);return __ANIME__.renderer.domElement.toDataURL('image/png')})()`)
 fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))
}
const tick=seconds=>ev(`(()=>{const q=__PUNCH_QA__;for(let t=0;t<${seconds};t+=1/120){__MOSPEADA_VFX__.vfx.update(1/120);q.fx.update(1/120,q.p,q.weapon,__MOSPEADA__.camera)}return q.fx.systems.map(s=>s.particleNum)})()`)
const layerDifference=index=>ev(`(()=>{
 const a=__ANIME__,fx=__PUNCH_QA__.fx,g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight
 const read=()=>{a.effect.render(a.state.snapshot(),1);const p=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return p}
 const batch=fx.systemBatches[${index}],on=read();batch.visible=false;const off=read();batch.visible=true
 let changed=0,bright=0,dark=0;for(let i=0;i<on.length;i+=4){const delta=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2];if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>12)changed++;if(delta>15)bright++;if(delta< -15)dark++}
 return {changed,bright,dark,particles:fx.systems[${index}].particleNum}
})()`)
async function arrange(){
 await ev(`(()=>{const q=__PUNCH_QA__,d=__MOSPEADA__,s=d.runtime.state;q.p.reset();q.p.phase='active';q.p.time=10;q.fx.clear(true);q.fx.previousTime=10
  for(const r of q.p.scouts){const x=s.x+(r.id-2)*6,z=s.z-18-(r.id%2)*4;r.position.set(x,d.sample(x,z)+(r.id===1?0:3),z);r.meleeEnabled=true;r.yaw=0;r.pitch=r.bank=0;r.view.root.visible=true;q.p.applyView(r)}
  d.setCameraMode(3);d.runtime.orbit.target.set(s.x,s.height+2,s.z-12);d.camera.position.set(s.x+10,s.height+7,s.z+6);d.runtime.orbit.update();return true
 })()`)
}
async function hit(id){return ev(`(()=>{const q=__PUNCH_QA__,r=q.p.scouts[${id}],from=new q.T.Vector3();q.weapon.getMuzzle(from);const to=r.position.clone();to.y+=2.8;const result=q.query.fire(new q.T.Ray(from,to.sub(from).normalize()));if(!result.hit)throw Error('Missed Scout');q.fx.shot(q.weapon,result,q.p);q.fx.update(0,q.p,q.weapon,__MOSPEADA__.camera);return{destroyed:result.destroyed,hits:r.hits,health:r.health}})()`)}
async function defeat(id){let result;do{result=await hit(id)}while(!result.destroyed);return result}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 if(!await ev('!!window.__DESERT_SCOUTS__')){
  const url=new URL(process.env.MOSPEADA_TEST_URL||'http://127.0.0.1:5173');url.search='?environment=forest';await c.send('Page.navigate',{url:url.href})
 }
 let ready=false
 for(let i=0;i<720;i++){
  if(await ev('!!window.__DESERT_SCOUTS__&&!!window.__MOSPEADA__?.runtime.combatVFX&&!!window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}
  await wait(250)
 }
 assert.ok(ready,'Full game and anime renderer are ready');console.log('Full game ready')
 await ev(`(async()=>{
  window.__FOREST_OPENING__?.finish()
  const T=await import('/node_modules/.vite/deps/three.js'),{GallantHitscan}=await import('/src/vehicle/GallantShot.js'),d=__MOSPEADA__,w=__FOREST_STAGE4__.world
  if(!w.bound)w.bind({x:0,y:0,z:-2400});d.runtime.resetAt(w.startAt(900));d.runtime.paused=true
  window.__PUNCH_QA__={T,p:__DESERT_SCOUTS__.patrol,fx:d.runtime.combatVFX,weapon:d.runtime.gallant.weapon,query:new GallantHitscan()};return true
 })()`)
 await wait(300);await arrange()
 report.airKill=await defeat(2);assert.equal(report.airKill.hits,10)
 await tick(.055);report.fireball=await layerDifference(4);report.halo=await layerDifference(2);report.sparks=await layerDifference(1)
 await capture('01-air-fireball-halo-and-sheet')
 assert.ok(report.fireball.changed>150,'Quarks fireball is visibly distinct in the actual anime renderer')
 assert.ok(report.fireball.bright>100,'The Quarks fireball adds luminosity rather than covering the hot centre')
 assert.ok(report.halo.bright>150,'Quarks halo adds visible warm light')
 await tick(.20);report.sparksAfter=await layerDifference(1);await capture('02-air-fire-and-black-smoke')
 assert.ok(report.sparksAfter.changed>3,'A few hot Quarks remnants remain visible after the white-hot peak')
 report.scale=await ev(`(()=>{const q=__PUNCH_QA__,fire=q.fx.systems[4],volume=q.fx.systems[6];let min=Infinity,max=-Infinity;for(const p of fire.particles.slice(0,fire.particleNum)){min=Math.min(min,p.position.x-p.size.x/2);max=Math.max(max,p.position.x+p.size.x/2)}return{scoutHeight:q.p.scouts[2].height,fireWidth:max-min,meshCoreParticles:volume.particleNum,volumeGeometry:q.fx.volumeGeometry.type}})()`)
 assert.ok(report.scale.fireWidth>report.scale.scoutHeight*1.2,'The fire mass visibly exceeds the intact Scout size')
 await tick(.55);report.smoke=await layerDifference(3);await capture('03-air-black-smoke')
 assert.ok(report.smoke.dark>150,'Quarks black smoke visibly darkens the scene')
 await tick(.4);await capture('04-short-smoke-tail');await tick(1)
 report.groundKill=await defeat(1);await tick(.18);await capture('05-ground-fireball-and-sheet');await tick(.65);await capture('06-ground-black-smoke');await tick(1.3)
 await arrange();for(let i=0;i<5;i++)await defeat(i)
 await tick(.24);await capture('07-five-simultaneous-explosions')
 report.pools=await ev(`(()=>{const f=__PUNCH_QA__.fx;return{particles:f.systems.map(p=>p.particleNum),capacities:f.systems.map(p=>p.particles.length),explosions:f.impacts.records.filter(r=>r.name==='invidExplosion'&&r.age<r.life).length,lights:f.impacts.deathLights.length}})()`)
 assert.equal(report.pools.explosions,5);assert.ok(report.pools.particles.every((n,i)=>n<=report.pools.capacities[i]))
 await tick(2.1)
 // Exercise the mounted weapon's real hand attachment and muzzle placement.
 await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,q=__PUNCH_QA__,s=r.state;r.gallant.active=r.gallant.mounted=true;r.gallant.aiming=true;r.scottInstance.shooterPose?.restore();return true})()`)
 await wait(350)
 await ev(`(()=>{const d=__MOSPEADA__,q=__PUNCH_QA__,s=d.runtime.state,point=new q.T.Vector3(s.x,s.height+2,s.z-18);q.weapon.present(d.runtime.scottInstance,true,point,1);q.fx.shot(q.weapon,{hit:null,solid:false,point},q.p);q.fx.update(0,q.p,q.weapon,d.camera);return true})()`)
 report.muzzle=await ev(`(()=>{const q=__PUNCH_QA__,f=q.fx,m=new q.T.Matrix4(),p=new q.T.Vector3();q.weapon.getMuzzle(p);f.flashMesh.getMatrixAt(0,m);return {error:new q.T.Vector3().setFromMatrixPosition(m).distanceTo(p),sparks:f.systems[5].particleNum,flash:f.flashMesh.count,halo:f.muzzleHalos.count}})()`)
 await capture('08-gallant-muzzle-flash',`const q=__PUNCH_QA__,d=__MOSPEADA__,r=d.runtime,s=r.state,point=new q.T.Vector3(s.x,s.height+2,s.z-18);r.scottInstance.shooterPose.restore();r.scottInstance.shooterPose.blend=1;r.scottInstance.shooterPose.applyMounted(point,true,.1,q.weapon);q.weapon.present(r.scottInstance,true,point,1);r.gallant.mounted=r.gallant.aiming=true;for(let i=0;i<8;i++)r.gallant.bikeCamera.update(r.gallant,s,.1);q.fx.traces.forEach(t=>t.life=0);q.fx.shot(q.weapon,{hit:null,solid:false,point},q.p);q.fx.update(0,q.p,q.weapon,d.camera);const m=new q.T.Matrix4(),p=new q.T.Vector3();q.weapon.getMuzzle(p);q.fx.flashMesh.getMatrixAt(0,m);window.__PUNCH_MUZZLE__={error:new q.T.Vector3().setFromMatrixPosition(m).distanceTo(p),sparks:q.fx.systems[5].particleNum,flash:q.fx.flashMesh.count,halo:q.fx.muzzleHalos.count}`)
 report.muzzle=await ev('__PUNCH_MUZZLE__');assert.ok(report.muzzle.error<.001&&report.muzzle.sparks>0&&report.muzzle.halo===1)
 await tick(.14);assert.equal(await ev('__PUNCH_QA__.fx.flashMesh.count+__PUNCH_QA__.fx.muzzleHalos.count'),0)
 report.resources=await ev(`(()=>{const q=__PUNCH_QA__,a=__ANIME__,f=q.fx,programs=a.renderer.info.programs.length,geometries=a.renderer.info.memory.geometries,textures=a.renderer.info.memory.textures,pools=f.systems.map(s=>s.particles.length)
  for(let i=0;i<3;i++){f.destroyTarget({position:q.p.scouts[i].position,height:5.2,dead:true});a.effect.render(a.state.snapshot(),1)}
  return{programsAdded:a.renderer.info.programs.length-programs,geometriesAdded:a.renderer.info.memory.geometries-geometries,texturesAdded:a.renderer.info.memory.textures-textures,pools,particles:f.systems.map(s=>s.particleNum),gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error}
 })()`)
 assert.equal(report.resources.programsAdded,0);assert.equal(report.resources.geometriesAdded,0);assert.equal(report.resources.texturesAdded,0);assert.equal(report.resources.gl,0);assert.equal(report.resources.shader,'')
 await tick(2.1);assert.equal(await ev('__PUNCH_QA__.fx.systems.reduce((n,s)=>n+s.particleNum,0)'),0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
 assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={};__MOSPEADA__.runtime.gallant.firing=false};true').catch(()=>{});c.close()}
