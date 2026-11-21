import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {forestLayout} from '../src/world/forest/forestLayout.js'
import {connect} from './browser-cdp.mjs'
const sourceDir='artifacts/forest-ground-textures',dir=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||sourceDir,c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
const until=async expression=>{for(let i=0;i<900;i++){if(await c.evaluate(expression))return;await wait(200)}throw Error('Timeout: '+expression)}
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyW:'w',KeyF:'f'}[code]})
async function capture(name){await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await wait(400);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function place(x,z,yaw){await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.reset('forest');d.setCameraMode(0);d.runtime.state=createBikeState({x:${x},z:${z},yaw:${yaw}},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`);await wait(700)}
try{
  await c.send('Network.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'})
  await until(`!!window.__FOREST_GROUND__&&!!window.__FOREST_ALPHA__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader')`)
  c.events.length=0
  await c.evaluate(`(()=>{const p=__FOREST_FOLIAGE__.config.performance;window.__textureAdaptive=p.adaptiveResolution;p.adaptiveResolution=false;__MOSPEADA__.scene.__r3f.root.getState().setDpr(1);return true})()`)
  const maps=await c.evaluate(`(()=>{const g=__FOREST_GROUND__;return {mapIsGrass:g.material.map===g.grass,normalMap:!!g.material.normalMap,roughnessMap:!!g.material.roughnessMap,vertexColours:g.material.vertexColors,maps:[g.grass,g.dirt].map(t=>({url:t.image.currentSrc||t.image.src,width:t.image.width,height:t.image.height,colorSpace:t.colorSpace,anisotropy:t.anisotropy,mipmaps:t.generateMipmaps,minFilter:t.minFilter,wrapS:t.wrapS,repeat:t.repeat.toArray()}))}})()`)
  assert.equal(maps.mapIsGrass,true);assert.equal(maps.normalMap,false);assert.equal(maps.vertexColours,false)
  for(const map of maps.maps){assert.equal(map.width,512);assert.equal(map.height,512);assert.equal(map.colorSpace,'srgb');assert.ok(map.mipmaps&&map.anisotropy>=1&&map.anisotropy<=8);assert.equal(map.minFilter,1008);assert.equal(map.wrapS,1002)}
  await capture('spawn-textures')
  await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await key('KeyW',true)
  await until('__MOSPEADA__.runtime.state.z < -8 && __MOSPEADA__.runtime.state.speed>8');await key('KeyW',false);await capture('cyclone-driving')
  await place(-6,2,Math.PI);await key('KeyF',true);await key('KeyF',false);await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"');await capture('scott-on-grass')
  await place(3,-10,Math.PI/2);await key('KeyF',true);await key('KeyF',false);await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"')
  await key('KeyW',true);await wait(3500);await key('KeyW',false);await capture('scott-alpha-scale')
  const alpha=await c.evaluate(`(()=>{const f=__FOREST_ALPHA__;return{length:f.config.length,ratio:f.config.length/f.config.previousLength,scale:f.placement.scale,y:f.placement.y,colliders:f.colliders.length,orientation:{yaw:f.config.yaw,pitch:f.config.pitch,roll:f.config.roll}}})()`)
  assert.equal(alpha.ratio,1.6);assert.equal(alpha.length,16)
  await place(-8.7,-28,Math.PI);await capture('dirt-path')
  if(process.argv.includes('--edge')){await place(-11,-13,Math.PI+.35);await capture('forest-edge')}
  await c.evaluate(`__MOSPEADA__.reset('forest');__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);__MOSPEADA__.runtime.paused=false;true`);await wait(8000)
  const performance=await c.evaluate(`new Promise(resolve=>{const times=[];let last=performance.now();function tick(t){times.push(t-last);last=t;if(times.length<125)requestAnimationFrame(tick);else{times.splice(0,5);times.sort((a,b)=>a-b);const gl=__ANIME__.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({medianMs:times[60],p95Ms:times[114],drawCalls:__ANIME__.effect.stats.renderCalls,pixelRatio:__ANIME__.renderer.getPixelRatio(),raster:[__ANIME__.renderer.domElement.width,__ANIME__.renderer.domElement.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),shader:__ANIME__.state.snapshot().error,gl:gl.getError()})}}requestAnimationFrame(tick)})`)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  assert.equal(performance.gl,0);assert.equal(performance.shader,'');assert.deepEqual(errors,[])
  const baseline=JSON.parse(fs.readFileSync(sourceDir+'/baseline.json')),hash=crypto.createHash('sha256').update(JSON.stringify(forestLayout)).digest('hex')
  assert.equal(hash,baseline.forestLayoutSha256)
  for(const file of baseline.sourceMaps)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/texturas/pasto/'+file.name)).digest('hex'),file.sha256)
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({pass:true,maps,alpha,forestLayoutUnchanged:true,forestLayoutSha256:hash,originalMapsUnchanged:true,performance,errors},null,2)+'\n')
  console.log(JSON.stringify({pass:true,maps,alpha,performance},null,2))
}finally{await c.evaluate(`if(window.__FOREST_FOLIAGE__)__FOREST_FOLIAGE__.config.performance.adaptiveResolution=window.__textureAdaptive;true`).catch(()=>{});c.close()}
