import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), began = Date.now(), directory = 'artifacts/driving'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression) {
  for (let i = 0; i < 150; i++) { if (await c.evaluate(expression)) return; await wait(150) }
  throw Error('Timed out: ' + expression)
}
const screenshot = async name => fs.writeFileSync(`${directory}/environment-restored-${name}.png`, Buffer.from((await c.send('Page.captureScreenshot')).data, 'base64'))
const key = async code => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(3).toLowerCase() }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase() }) }
const inspect = () => c.evaluate(`(()=>{
  const d=window.__MOSPEADA__,scene=d.scene,grass=scene.getObjectByName('Grass_original_field'),pool=scene.getObjectByName('Grass_highway_extension');
  const surfaces=[];let vehicleReflections=0;
  scene.traverse(n=>{if(n.isMesh&&n.userData.rideSurface&&n.material?.map)surfaces.push({map:!!n.material.map.image?.width,normal:!!n.material.normalMap?.image?.width,roughness:!!n.material.roughnessMap?.image?.width,environment:!!n.material.envMap})});
  d.rig.root.traverse(n=>{if(n.isMesh&&n.material?.envMap)vehicleReflections++});
  const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{fog:scene.fog.density,grass:grass.count,grassTriangles:grass.geometry.index.count/3,worldEnvironment:!!scene.environment,vehicleReflections,surfaces,
    tiles:pool.children.filter(m=>m.visible&&m.count).map(m=>({key:m.userData.tile,count:m.count,firstMatrix:Array.from(m.instanceMatrix.array.slice(0,16))})),render:d.snapshot().render,
    testRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
})()`)
async function view() {
  await c.evaluate(`{const d=window.__MOSPEADA__;d.setCameraMode(3);d.runtime.paused=true;d.runtime.orbitAnchor.set(d.runtime.state.x,d.runtime.state.height+1,d.runtime.state.z);d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0,1,0)));d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(4,2.4,-4)));d.runtime.orbit.update()}`)
  await wait(350)
}
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await until('!!window.__MOSPEADA__ && !document.querySelector("#entry-preloader")')
  await c.evaluate('window.__MOSPEADA__.reset("highway")'); await key('KeyN')
  await until('window.__MOSPEADA__.rig.lighting.headlights.every(h=>h.light.intensity===0)')
  await view()
  const native = await inspect(); await screenshot('native')
  assert.equal(native.grass, 11000); assert.equal(native.fog, 0.068)
  assert.equal(native.worldEnvironment, false)
  assert.ok(native.vehicleReflections > 100)
  assert.ok(native.surfaces.length > 5 && native.surfaces.every(m => m.map && m.normal && m.roughness && !m.environment))
  await c.evaluate(`{const d=window.__MOSPEADA__;d.camera.position.set(-255,4,-76);d.runtime.orbit.target.set(-260,3,-78.25);d.runtime.orbit.update()}`)
  await wait(350)
  await c.evaluate(`(async()=>{const d=window.__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.runtime.state=createBikeState({x:-260,z:-78.25,yaw:-Math.PI/2},d.rig.metrics,d.sample);d.runtime.state.lean=-d.config.idleLean;d.rig.update(d.runtime.state,d.sample,d.config)})()`)
  await view()
  const extension = await inspect(); await screenshot('highway-extension')
  assert.ok(extension.tiles.reduce((sum,t)=>sum+t.count,0)>500, 'Grass must continue beyond the original field')
  const tile = extension.tiles[0]
  await c.evaluate('window.__envCamera=window.__MOSPEADA__.camera.position.clone();window.__envTarget=window.__MOSPEADA__.runtime.orbit.target.clone();window.__MOSPEADA__.camera.position.x-=500;window.__MOSPEADA__.runtime.orbit.target.x-=500;window.__MOSPEADA__.runtime.orbit.update()')
  await wait(350)
  await c.evaluate('window.__MOSPEADA__.camera.position.copy(window.__envCamera);window.__MOSPEADA__.runtime.orbit.target.copy(window.__envTarget);window.__MOSPEADA__.runtime.orbit.update();delete window.__envCamera;delete window.__envTarget')
  await wait(350)
  const returned = await inspect()
  assert.deepEqual(returned.tiles.find(t=>t.key===tile.key).firstMatrix, tile.firstMatrix, 'Recycled grass must stay anchored in world space')
  await key('KeyM')
  await until('window.__MOSPEADA__.rig.lighting.headlights.every(h=>h.light.intensity>=2399)')
  const night = await inspect(); await screenshot('night')
  assert.equal(night.fog, 0.068); assert.ok(night.surfaces.every(m=>m.map&&m.normal&&m.roughness&&!m.environment))
  await key('KeyN'); await until('window.__MOSPEADA__.rig.lighting.headlights.every(h=>h.light.intensity===0)')
  const errors = c.events.filter(e=>e.method==='Runtime.exceptionThrown'&&e.params.timestamp>began).map(e=>e.params.exceptionDetails.exception?.description)
  assert.equal(errors.length,0)
  fs.writeFileSync(`${directory}/environment-restoration-validation.json`, JSON.stringify({ native, extension, night, stableRecycling: true, errors, hardwareConclusion: 'Isolated test renderer; this does not benchmark the user GPU.' },null,2)+'\n')
  console.log(JSON.stringify({nativeGrass:native.grass,fog:native.fog,texturedSurfaceCount:native.surfaces.length,extensionVisibleGrass:extension.tiles.reduce((s,t)=>s+t.count,0),worldEnvironment:false,vehicleReflections:native.vehicleReflections,stableRecycling:true,errors,testRenderer:native.testRenderer},null,2))
} finally { await c.evaluate('window.__MOSPEADA__.reset("highway");window.__MOSPEADA__.setCameraMode(0)').catch(()=>{});c.close() }
