import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-foliage-library',wait=ms=>new Promise(r=>setTimeout(r,ms))
const until=async code=>{for(let i=0;i<600;i++){if(await c.evaluate(code))return;await wait(200)}throw Error('Timeout: '+code)}
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyF:'f',KeyM:'m',KeyN:'n'}[code]})
try{
  await until('!!window.__FOREST_FOLIAGE_PILOT__&&!!window.__ANIME__?.state.snapshot().nightReady')
  c.events.length=0;await c.send('Network.enable')
  const audit=await c.evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{forestSurfaceHeight}=await import('/src/world/forest/forestLayout.js'),f=__FOREST_FOLIAGE_PILOT__,b=f.batch,m=new T.Matrix4(),box=new T.Box3(),sphere=new T.Sphere(),failures=[];
    for(let id=0;id<b.instanceCount;id++){const p=f.placements[id],gid=b.getGeometryIdAt(id);b.getMatrixAt(id,m);if(Math.abs(m.elements[13]-forestSurfaceHeight(p.x,p.z)+.025)>1e-5)failures.push('base/'+id);b.getBoundingSphereAt(gid,sphere).applyMatrix4(m);if(b.boundingSphere.center.distanceTo(sphere.center)+sphere.radius>b.boundingSphere.radius+1e-4)failures.push('sphere/'+id);if(!b.boundingBox.containsBox(b.getBoundingBoxAt(gid,box).applyMatrix4(m)))failures.push('box/'+id)}
    return {instances:b.instanceCount,triangles:b.instanceCount*4,sourceSprites:f.catalog.entries.length,usedSprites:new Set(f.placements.map(p=>p.sprite)).size,atlas:[f.material.map.image.width,f.material.map.image.height],alphaTest:f.material.alphaTest,transparent:f.material.transparent,depthWrite:f.material.depthWrite,colorSpace:f.material.map.colorSpace,castShadow:b.castShadow,contactOpacity:f.shadows.material.opacity,stats:f.stats,failures,matrixVersion:b._matricesTexture.version,colorVersion:b._colorsTexture.version,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
  })()`)
  assert.deepEqual(audit.failures,[]);assert.equal(audit.instances,66);assert.equal(audit.sourceSprites,24);assert.equal(audit.transparent,false);assert.ok(audit.alphaTest>=.4&&audit.contactOpacity<=.15)
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.reset('forest');d.setCameraMode(0);d.runtime.state=createBikeState({x:-11,z:-13,yaw:Math.PI+.35},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
  await key('KeyF',true);await key('KeyF',false);await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"')
  await key('KeyW',true);await wait(1500);await key('KeyW',false);await c.evaluate('__MOSPEADA__.runtime.paused=true;true')
  await wait(400);fs.writeFileSync(dir+'/pilot-on-foot.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  const walk=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})');assert.ok(walk&&Number.isFinite(walk.ground))
  await c.evaluate('__MOSPEADA__.setCameraMode(1);true');await wait(400);fs.writeFileSync(dir+'/pilot-side.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await key('KeyM',true);await key('KeyM',false);await until('__FOREST_FOLIAGE__.day.value<.03');assert.equal(await c.evaluate('__ANIME__.renderer.getContext().getError()'),0)
  await key('KeyN',true);await key('KeyN',false);await until('__FOREST_FOLIAGE__.day.value>.97')
  const stable=await c.evaluate(`({matrixVersion:__FOREST_FOLIAGE_PILOT__.batch._matricesTexture.version,colorVersion:__FOREST_FOLIAGE_PILOT__.batch._colorsTexture.version,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error})`)
  assert.equal(stable.matrixVersion,audit.matrixVersion);assert.equal(stable.colorVersion,audit.colorVersion);assert.equal(stable.gl,0);assert.equal(stable.shader,'')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[])
  fs.writeFileSync(dir+'/pilot-validation.json',JSON.stringify({pass:true,audit,walk,stable,errors},null,2)+'\n');console.log(JSON.stringify({pass:true,instances:audit.instances,usedSprites:audit.usedSprites,stats:audit.stats,stable},null,2))
}finally{c.close()}
