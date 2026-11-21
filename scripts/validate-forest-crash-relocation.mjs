import fs from 'node:fs'
import assert from 'node:assert/strict'
import {Matrix4} from 'three'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-crash-relocation',wait=ms=>new Promise(r=>setTimeout(r,ms)),before=JSON.parse(fs.readFileSync(dir+'/pose-before.json')),ground=JSON.parse(fs.readFileSync(dir+'/before.json'))
async function ready(){for(let i=0;i<600;i++){const s=await c.evaluate('({ready:!!window.__FOREST_ALPHA__&&!!window.__FOREST_FOLIAGE_WORLD__&&!!window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})');if(s.error)throw Error(s.error);if(s.ready)return;await wait(150)}throw Error('Forest did not load')}
async function shot(name){await wait(500);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await c.send('Page.reload',{ignoreCache:false});c.events.length=0;await ready()
  // Capture the actual default startup: no actor/camera repositioning beforehand.
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await shot('startup')
  const audit=await c.evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{FOREST_SPAWN}=await import('/src/world/forest/forestCrashConfig.js'),{CRASH_RELOCATION}=await import('/src/world/forest/crashRelocation.js'),{isCrashTree,crashSiteSample}=await import('/src/world/forest/forestCrashSite.js'),d=__MOSPEADA__,a=__FOREST_ALPHA__,w=__FOREST_FOLIAGE_WORLD__;
    d.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(a.model),center=box.getCenter(new T.Vector3()).project(d.camera),frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(d.camera.projectionMatrix,d.camera.matrixWorldInverse));let standing=0,intact=0;
    d.scene.traverse(m=>{if(m.isBatchedMesh&&m.userData.forestKind==='tree')standing+=m.placements.filter(isCrashTree).length});
    for(const s of w.world.sectors)for(let i=0;i<s.count;i++)if(crashSiteSample(s.x+s.matrices[i*16+12],s.z+s.matrices[i*16+14]).destroyed)intact++;
    return{spawn:{x:d.runtime.state.x,z:d.runtime.state.z,yaw:d.runtime.state.yaw},expectedSpawn:FOREST_SPAWN,cameraMode:d.runtime.cameraMode,alphaInFrustum:frustum.intersectsBox(box),alphaCenterNdc:center.toArray(),matrix:a.placement.matrix.toArray(),sourceMatrix:a.placement.sourceMatrix.toArray(),treeStart:__FOREST_CRASH_SITE__.tree.start.toArray(),treeDirection:__FOREST_CRASH_SITE__.tree.direction.toArray(),shift:CRASH_RELOCATION,standingExcluded:standing,intactInScar:intact,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
  })()`)
  const expected=new Matrix4().fromArray(before.matrix).premultiply(new Matrix4().makeTranslation(audit.shift.x,audit.shift.y,audit.shift.z))
  audit.matrix.forEach((v,i)=>assert.ok(Math.abs(v-expected.elements[i])<1e-7));audit.sourceMatrix.forEach((v,i)=>assert.ok(Math.abs(v-before.sourceMatrix[i])<1e-7))
  assert.equal(audit.cameraMode,0);assert.equal(audit.spawn.x,audit.expectedSpawn.x);assert.equal(audit.spawn.z,audit.expectedSpawn.z);assert.ok(audit.alphaInFrustum&&Math.abs(audit.alphaCenterNdc[0])<.85&&Math.abs(audit.alphaCenterNdc[1])<.85)
  for(const [i,key]of ['x','y','z'].entries())assert.ok(Math.abs(audit.treeStart[i]-before.treeStart[i]-audit.shift[key])<1e-6)
  audit.treeDirection.forEach((v,i)=>assert.equal(v,before.treeDirection[i]))
  const surface=await c.evaluate(`(async()=>{const {forestBaseSurfaceHeight}=await import('/src/world/forest/forestLayout.js'),points=${JSON.stringify(ground.points.filter((_,i)=>i%4===0).map(({x,y,z})=>({x,y,z})))},d=__MOSPEADA__,s=__FOREST_ALPHA__.config;let moved=0,restored=0;for(const p of points){moved=Math.max(moved,Math.abs(d.sample(p.x+(${audit.shift.x}),p.z+(${audit.shift.z}))-p.y-(${audit.shift.y})));restored=Math.max(restored,Math.abs(d.sample(p.x,p.z)-forestBaseSurfaceHeight(p.x,p.z)))}return{movedMaxError:moved,restoredMaxError:restored,samples:points.length}})()`)
  // Temporary inspection pose in the existing free camera; production camera unchanged.
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.camera.position.set(-19,39,42);d.runtime.cameraController.orbit.target.set(-19,-.5,16);d.runtime.cameraController.orbit.update();return true})()`);await shot('elevated')
  await c.evaluate('__MOSPEADA__.setCameraMode(0);__MOSPEADA__.reset("forest");__MOSPEADA__.runtime.paused=true;true');await shot('reset-startup')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({audit,surface,errors},null,2)+'\n');console.log({spawn:audit.spawn,alphaCenterNdc:audit.alphaCenterNdc,shift:audit.shift,surface,standing:audit.standingExcluded,intact:audit.intactInScar,errors})
  assert.ok(surface.movedMaxError<2e-6&&surface.restoredMaxError<2e-6);assert.equal(audit.standingExcluded,0);assert.equal(audit.intactInScar,0);assert.equal(audit.gl,0);assert.equal(audit.shader,'');assert.deepEqual(errors,[])
}finally{c.close()}
