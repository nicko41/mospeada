import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-crash-final',wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(expression,seconds=90){const end=Date.now()+seconds*1000;while(Date.now()<end){const r=await c.evaluate(`({value:!!(${expression}),error:window.__ANIME__?.effect.error})`);if(r.error)throw Error(r.error);if(r.value)return;await wait(150)}throw Error('Timeout: '+expression)}
const ready=()=>until('window.__FOREST_CRASH_SITE__&&window.__FOREST_FOLIAGE_WORLD__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")')
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyF:'f',KeyW:'w'}[code]})
async function capture(name){await wait(350);fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function audit(){return c.evaluate(`(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{CRASH_TREE_EXCLUSIONS,isCrashTree,crashSiteSample}=await import('/src/world/forest/forestCrashSite.js'),{forestLayout}=await import('/src/world/forest/forestLayout.js'),a=__FOREST_ALPHA__,p=a.placement,w=__FOREST_FOLIAGE_WORLD__;
  let standing=0,renderedTrees=0,buriedRear=0,rearVertices=0,visibleFore=0,foreVertices=0,intactInChannel=0;
  __MOSPEADA__.scene.traverse(m=>{if(m.isBatchedMesh&&m.userData.forestKind==='tree'){standing+=m.placements.filter(isCrashTree).length;renderedTrees+=m.placements.length}});
  a.model.traverse(m=>{if(!m.isMesh)return;const positions=m.geometry.attributes.position;for(let i=0;i<positions.count;i++){const local=new T.Vector3().fromBufferAttribute(positions,i),z=local.x*p.scale,world=local.clone().applyMatrix4(m.matrixWorld),gap=world.y-__MOSPEADA__.sample(world.x,world.z);if(z>1){rearVertices++;if(gap<0)buriedRear++}if(z< -2){foreVertices++;if(gap>0)visibleFore++}}});
  for(const s of w.world.sectors)for(let i=0;i<s.count;i++){const x=s.x+s.matrices[i*16+12],z=s.z+s.matrices[i*16+14];if(crashSiteSample(x,z).destroyed)intactInChannel++}
  return{anchor:[p.matrix.elements[12],p.matrix.elements[14]],yaw:p.yaw,scale:p.scale,pitch:p.pitch,nose:p.nosePivotWorld.toArray(),noseGap:p.nosePivotWorld.y-__MOSPEADA__.sample(p.nosePivotWorld.x,p.nosePivotWorld.z),buriedRear,rearVertices,visibleFore,foreVertices,standing,renderedTrees,excluded:CRASH_TREE_EXCLUSIONS,layoutExcluded:Object.values(forestLayout).flat().filter(isCrashTree).length,intactInChannel,treeStart:__FOREST_CRASH_SITE__.tree.start.toArray(),treeDirection:__FOREST_CRASH_SITE__.tree.direction.toArray(),shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()}
})()`)}
try{
  await c.send('Network.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await c.send('Page.reload',{ignoreCache:false});c.events.length=0;await ready()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  const first=await audit();console.log('Pose and persistent mask',first)
  const views=[['front',[-3,5,-27],[10,.7,-10]],['side',[-10,6,4],[11,.5,-8]],['elevated',[2,24,21],[18,0,3]],['towards-forest',[10,6,-7],[25,0,15]]]
  for(const [name,position,target]of views){await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.camera.position.set(...${JSON.stringify(position)});d.runtime.cameraController.orbit.target.set(...${JSON.stringify(target)});d.runtime.cameraController.orbit.update();d.camera.updateMatrixWorld(true);return true})()`);await capture(name)}
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.setCameraMode(0);d.runtime.state=createBikeState({x:4,z:-10,yaw:Math.PI/2},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await key('KeyF',true);await key('KeyF',false);await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"',20)
  const start=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})');await key('KeyW',true);await wait(4000);const before=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})');await wait(1000);await key('KeyW',false)
  const walking=await c.evaluate(`(()=>{const p=__MOSPEADA__.runtime.state.pedestrian;return{x:p.x,z:p.z,travel:Math.hypot(p.x-${start.x},p.z-${start.z}),lastSecondTravel:Math.hypot(p.x-${before.x},p.z-${before.z}),cameraDistance:Math.hypot(__MOSPEADA__.camera.position.x-p.x,__MOSPEADA__.camera.position.z-p.z)}})()`)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await capture('gameplay-scott')
  // A second, fresh scene proves exclusions and hard masks survive reconstruction.
  await c.send('Page.reload',{ignoreCache:false});await ready();await c.evaluate('__MOSPEADA__.runtime.paused=true;true');const reloaded=await audit()
  await until('__ANIME__.state.snapshot().nightReady',120)
  await c.evaluate('__FOREST_FOLIAGE__.config.performance.adaptiveResolution=false;__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);true');await wait(1200)
  const performance=await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function tick(t){times.push(t-last);last=t;if(times.length<125)requestAnimationFrame(tick);else{times.splice(0,5);times.sort((a,b)=>a-b);const r=__ANIME__.renderer;resolve({medianMs:times[60],p95Ms:times[114],calls:__ANIME__.effect.stats.renderCalls,raster:[r.domElement.width,r.domElement.height],ratio:r.getPixelRatio()})}}requestAnimationFrame(tick)})`)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({first,reloaded,walking,performance,errors},null,2)+'\n');console.log({walking,performance,errors})
  for(const a of [first,reloaded]){assert.deepEqual(a.anchor,[10,-10]);assert.equal(a.yaw,.65);assert.ok(Math.abs(a.noseGap-.025)<2e-6);assert.ok(a.buriedRear>a.rearVertices*.1);assert.ok(a.visibleFore>a.foreVertices*.5);assert.equal(a.standing,0);assert.equal(a.layoutExcluded,0);assert.equal(a.intactInChannel,0);assert.equal(a.shader,'');assert.equal(a.gl,0)}
  assert.ok(walking.travel>.3&&walking.lastSecondTravel<.07);assert.ok(walking.cameraDistance>1.2);assert.deepEqual(errors,[])
}finally{await key('KeyW',false).catch(()=>{});c.close()}
