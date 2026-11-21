import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-alpha',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expression){for(let i=0;i<900;i++){if(await c.evaluate(expression))return;await wait(250)}throw Error('Timeout: '+expression)}
async function capture(name){await wait(400);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyF:'f'}[code]})
try{
  await c.send('Network.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  c.events.length=0
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'})
  await until(`!!window.__FOREST_ALPHA__&&!!window.__SCOTT_ORIGINAL__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader')`)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.scene.__r3f.root.getState().setDpr(1);true')
  const audit=await c.evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),f=__FOREST_ALPHA__,model=f.model,b=new T.Box3().setFromObject(model),source=new T.Box3().setFromObject(f.source),materials=[],contact=[];
    model.traverse(m=>{if(!m.isMesh)return;materials.push({name:m.material.name,map:!!m.material.map,normal:!!m.material.normalMap,roughness:!!m.material.roughnessMap,triangles:m.geometry.index.count/3});const p=m.geometry.attributes.position,v=new T.Vector3();let bottom=Infinity,below=0;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);const gap=v.y-__MOSPEADA__.sample(v.x,v.z);bottom=Math.min(bottom,gap);if(gap<0)below++}contact.push({minGap:bottom,buriedVertices:below,vertices:p.count})});
    return {config:f.config,scale:f.placement.scale,y:f.placement.y,supportSamples:f.placement.samples,worldMin:b.min.toArray(),worldMax:b.max.toArray(),sourceSize:source.getSize(new T.Vector3()).toArray(),materials,contact,colliders:f.colliders,actorScale:__SCOTT_ORIGINAL__.authored.data.actorScale,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
  })()`)
  assert.equal(audit.gl,0);assert.equal(audit.shader,'');assert.ok(audit.materials.every(m=>m.map&&m.normal&&m.roughness));assert.ok(audit.contact.every(m=>m.minGap<-.05&&m.minGap> -1.5))
  await capture('spawn')
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.setCameraMode(0);d.runtime.state=createBikeState({x:4,z:-5,yaw:Math.atan2(6,-5)},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await wait(1500);await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await capture('approach')
  // Inspect the wreck from a standard existing side view, not a new game camera.
  await c.evaluate('__MOSPEADA__.setCameraMode(2);true');await capture('side')
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.setCameraMode(0);d.runtime.state=createBikeState({x:4,z:-10,yaw:Math.PI/2},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await key('KeyW',true);await until('(()=>{const s=__MOSPEADA__.runtime.state;if(!s.blocked)return false;window.__alphaBikeHit={x:s.x,z:s.z,blocked:true};return true})()');await key('KeyW',false)
  audit.cycloneBlocked=await c.evaluate('window.__alphaBikeHit')
  assert.equal(audit.cycloneBlocked.blocked,true)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await capture('cyclone-collision')
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState({x:4,z:-10,yaw:Math.PI/2},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await key('KeyF',true);await key('KeyF',false);await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"')
  audit.standingScottHeight=await c.evaluate(`(async()=>{const T=await import('/node_modules/three/build/three.module.js'),root=__SCOTT_ORIGINAL__.wrapper.current;root.updateWorldMatrix(true,true);root.traverse(m=>{if(m.isSkinnedMesh)m.computeBoundingBox()});return new T.Box3().setFromObject(root).getSize(new T.Vector3()).y})()`)
  await key('KeyW',true);await wait(4000)
  const before=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})');await wait(1000);await key('KeyW',false)
  audit.scottCollision=await c.evaluate(`(()=>{const p=__MOSPEADA__.runtime.state.pedestrian;return{x:p.x,z:p.z,lastSecondTravel:Math.hypot(p.x-(${before.x}),p.z-(${before.z}))}})()`)
  assert.ok(audit.scottCollision.lastSecondTravel<.07,'Scott must stop against the fuselage')
  audit.armorAccess=await c.evaluate(`(()=>{const d=__MOSPEADA__,a=d.runtime.armorController;return{blockedInside:!a.canMove(10,-10,d.sample(10,-10)),canApproach:a.canMove(4,-10,d.sample(4,-10))}})()`)
  assert.ok(audit.armorAccess.blockedInside&&audit.armorAccess.canApproach)
  audit.cameraClearance=await c.evaluate(`(()=>{const d=__MOSPEADA__,p=d.runtime.state.pedestrian;return{distanceFromScott:Math.hypot(d.camera.position.x-p.x,d.camera.position.z-p.z),position:d.camera.position.toArray()}})()`)
  assert.ok(audit.cameraClearance.distanceFromScott>1.2,'Existing camera must keep room beside the wreck')
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await capture('scott-scale-and-collision')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  const failedAssets=c.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400)
  fs.writeFileSync(dir+'/integration.json',JSON.stringify({audit,errors,failedAssets},null,2)+'\n');assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[])
  console.log(JSON.stringify(audit,null,2))
}finally{c.close()}
