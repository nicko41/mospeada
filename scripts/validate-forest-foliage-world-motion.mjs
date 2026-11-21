import fs from 'node:fs'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-foliage-world',wait=ms=>new Promise(r=>setTimeout(r,ms))
const frames=n=>c.evaluate(`new Promise(resolve=>{let n=${n};function tick(){if(--n)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`)
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyF:'f',ShiftLeft:'Shift'}[code]})
try{
  for(let i=0;i<900;i++){if(await c.evaluate('!!window.__FOREST_FOLIAGE_WORLD__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector("#entry-preloader")'))break;await wait(200)}
  await c.send('Network.enable');c.events.length=0
  await c.evaluate(`(()=>{const panel=document.querySelector('[aria-label="Diagnóstico de foliage"]');if(panel?.querySelector('select'))panel.querySelector('button').click();__MOSPEADA__.reset('forest');__MOSPEADA__.runtime.paused=true;return true})()`);await frames(30)
  await c.evaluate(`(async()=>{
    const {sectorDistance}=await import('/src/world/forest/forestFoliageWorldManager.js'),d=__MOSPEADA__,w=__FOREST_FOLIAGE_WORLD__,effect=__ANIME__.effect;
    const a=window.__worldAudit={original:effect.render,enabled:true,rows:[],prepared:w.manager.prepared,programs:__ANIME__.renderer.info.programs.length,signatures:new Map([...w.manager.resident].map(([id,s])=>[id,{matrix:s.near.instanceMatrix,version:s.near.instanceMatrix.version,near:s.near.geometry,far:s.far.geometry,material:s.near.material}]))};
    effect.render=function(...args){a.original.apply(this,args);if(!a.enabled)return;let missing=0,writes=0,rebuilt=0;const m=w.manager;
      for(const s of w.world.sectors)if(sectorDistance(s,d.camera.position.x,d.camera.position.z)<114&&!m.resident.has(s.id))missing++;
      for(const [id,s]of m.resident){const old=a.signatures.get(id);if(!old)continue;if(old.matrix!==s.near.instanceMatrix||old.version!==s.near.instanceMatrix.version)writes++;if(old.near!==s.near.geometry||old.far!==s.far.geometry||old.material!==s.near.material)rebuilt++}
      a.rows.push({missing,writes,rebuilt,prepared:m.prepared,late:m.latePrepares});
    };return true
  })()`)
  // Existing validator exercises multiple 360 degree turns with real mouse input
  // and audits the actual native GLTF tree draws as well as this world overlay.
  const rotation=await promisify(execFile)(process.execPath,['scripts/validate-forest-rotation.mjs','--reuse','--output='+dir+'/rotation'],{maxBuffer:1024*1024})
  console.log(rotation.stdout)
  const rotations=await c.evaluate(`(()=>{const a=__worldAudit;a.enabled=false;return{frames:a.rows.length,missingFrames:a.rows.filter(r=>r.missing).length,matrixWrites:a.rows.reduce((n,r)=>n+r.writes,0),rebuilds:a.rows.reduce((n,r)=>n+r.rebuilt,0),sectorPreparations:__FOREST_FOLIAGE_WORLD__.manager.prepared-a.prepared,shaderProgramsBefore:a.programs,shaderProgramsAfter:__ANIME__.renderer.info.programs.length}})()`)
  await c.evaluate(`__MOSPEADA__.reset('forest');__MOSPEADA__.runtime.paused=false;window.__driveRows=[];true`)
  await key('KeyW',true);await frames(35);await key('ShiftLeft',true);await frames(12);await key('ShiftLeft',false);await frames(20);await key('KeyW',false)
  const drive=await c.evaluate(`(()=>{const s=__MOSPEADA__.runtime.state;__MOSPEADA__.runtime.paused=true;return{x:s.x,z:s.z,speed:s.speed,boostCount:s.boostCount,metres:Math.hypot(s.x,s.z)}})()`)
  // Repeatable worst-case translation: feed native bike states at 80 m/s @60 Hz
  // along the existing path. This supplements, rather than substitutes for,
  // the real throttle and boost exercise above.
  const streaming=await c.evaluate(`(async()=>{
    const {createBikeState}=await import('/src/vehicle/bikePhysics.js'),{forestPathX}=await import('/src/world/forest/forestLayout.js'),d=__MOSPEADA__,m=__FOREST_FOLIAGE_WORLD__.manager,a=__worldAudit;
    const prepared=m.prepared,evicted=m.evicted;a.rows=[];a.signatures.clear();a.enabled=true;
    await new Promise(resolve=>{let frame=0;function tick(){const progress=frame<260?frame:520-frame,z=-progress*80/60,x=forestPathX(z);d.runtime.state=createBikeState({x,z,yaw:Math.PI},d.rig.metrics,d.sample);if(++frame>520)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
    a.enabled=false;return{frames:a.rows.length,metres:2*260*80/60,simulatedSpeed:80,missingFrames:a.rows.filter(r=>r.missing).length,latePrepares:m.latePrepares,prepared:m.prepared-prepared,evicted:m.evicted-evicted,gpuMB:m.gpuMemoryBytes()/1048576,generations:m.generations,pending:m.queue.length,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
  })()`)
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState({x:-23,z:-31,yaw:Math.PI+.3},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await key('KeyF',true);await key('KeyF',false)
  for(let i=0;i<240;i++){if(await c.evaluate('__MOSPEADA__.runtime.state.riderMode==="onFoot"'))break;await wait(100)}
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames(6)
  const walk=await c.evaluate('({mode:__MOSPEADA__.runtime.state.riderMode,pedestrian:__MOSPEADA__.runtime.state.pedestrian,visible:__FOREST_FOLIAGE_WORLD__.manager.visibleGroups(__MOSPEADA__.camera)})')
  fs.writeFileSync(dir+'/on-foot.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  const requests=c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!e.params.request.url.startsWith('data:')).map(e=>e.params.request.url)
  fs.writeFileSync(dir+'/motion.json',JSON.stringify({rotations,drive,streaming,walk,errors,requests},null,2)+'\n');console.log(JSON.stringify({rotations,drive,streaming,walkMode:walk.mode,errors:errors.length,requests},null,2))
  assert.equal(rotations.missingFrames,0);assert.equal(rotations.matrixWrites,0);assert.equal(rotations.rebuilds,0);assert.equal(rotations.sectorPreparations,0)
  assert.ok(drive.metres>5&&drive.boostCount>0)
  assert.equal(streaming.missingFrames,0);assert.equal(streaming.latePrepares,0);assert.ok(streaming.prepared>0&&streaming.evicted>0);assert.equal(streaming.generations,1);assert.equal(streaming.gl,0);assert.equal(streaming.shader,'');assert.deepEqual(errors,[]);assert.equal(walk.mode,'onFoot')
}finally{
  await c.evaluate(`(()=>{if(window.__worldAudit){__ANIME__.effect.render=__worldAudit.original;delete window.__worldAudit}__MOSPEADA__.runtime.paused=false;return true})()`).catch(()=>{})
  await key('KeyW',false).catch(()=>{});await key('ShiftLeft',false).catch(()=>{});c.close()
}
