import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),report={},dir='artifacts/terrain-audio',wait=ms=>new Promise(r=>setTimeout(r,ms)),requests=[]
fs.mkdirSync(dir,{recursive:true});await c.send('Network.enable')
const remove=c.onEvent(e=>{if(e.method==='Network.requestWillBeSent'&&/terrain-(dirt|grass)-.*\.mp3/.test(e.params.request.url))requests.push(e.params.request.url)})
async function until(expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error('Timed out: '+expression)}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='Space'?' ':code.slice(3).toLowerCase()})}
async function tap(code){await key(code,true);await key(code,false)}
async function resetAt(x){await key('KeyW',false);await key('Space',false);await c.evaluate(`__MOSPEADA__.runtime.resetAt({x:${x},z:0,yaw:0,label:'Terrain audio QA'});true`);await wait(250);await key('KeyW',true)}
async function sample(){return c.evaluate(`(()=>{const s=__TERRAIN_AUDIO__,a=__SFX__,w=__MOSPEADA__.runtime.weathering.contacts.wheels;return{gains:s.gains,volumes:Object.fromEntries(['terrainDirtPass','terrainGrassPass','terrainDirtDrift'].map(n=>[n,a.getVolume(n)])),voices:Object.fromEntries(Object.entries(s.loops).map(([n,v])=>[n,{gain:a.voiceGains.get(v).gain.value,loop:v.loop,rate:v.playbackRate.value,playing:a.isPlaying(v),duration:v.buffer.duration}])),contacts:Object.fromEntries(Object.entries(w).map(([n,v])=>[n,{surface:v.surface,biome:v.biome,earthWeight:v.earthWeight,grounded:v.grounded}]))}})()`)}
try{
 await until("!!window.__TERRAIN_AUDIO__&&!document.querySelector('#entry-preloader')",120000)
 await c.evaluate(`(async()=>{const T=await import('/node_modules/.vite/deps/three.js'),{registerRideSurfaces}=await import('/src/vehicle/rideSurface.js');
  const q=window.__TERRAIN_AUDIO_QA__={group:new T.Group(),play:__SFX__.play,calls:[]};
  for(const [x,biome,earthWeight,color]of [[4000,null,1,0x88725a],[8000,'forest',0,0x526536],[12000,'desert',0,0xc7a16b]]){
   const mesh=new T.Mesh(new T.PlaneGeometry(3000,3000).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color}));mesh.position.set(x,12,0);Object.assign(mesh.userData,{rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:biome,rideSurfaceEarthWeight:()=>earthWeight});q.group.add(mesh)
  }
  __ANIME__.scene.add(q.group);q.group.updateMatrixWorld(true);q.unregister=registerRideSurfaces(q.group);
  __SFX__.play=function(name,options){const source=q.play.call(this,name,options);if(name.startsWith('terrain'))q.calls.push({name,loop:source?.loop,rate:source?.playbackRate.value,source});return source};return true
 })()`)
 await tap('KeyV');await until("__SFX__.audioContext?.state==='running'")
 report.preloaded=await c.evaluate("[...__SFX__.buffers].filter(([url])=>url.includes('/terrain-')).map(([url,b])=>({url,duration:b.duration}))")
 assert.equal(report.preloaded.length,3);const initial=requests.length
 await resetAt(4000);await until('__TERRAIN_AUDIO__.gains.terrainDirtPass===1');await wait(300)
 report.dirt=await sample();assert.ok(report.dirt.voices.terrainDirtPass.gain>.98);assert.equal(report.dirt.gains.terrainGrassPass,0);assert.equal(report.dirt.volumes.terrainDirtPass,.57)
 await c.evaluate('window.__TERRAIN_AUDIO_QA__.dirtSource=__TERRAIN_AUDIO__.loops.terrainDirtPass;true')
 console.log('Checking a full dirt loop cycle')
 await wait((report.dirt.voices.terrainDirtPass.duration+.2)*1000)
 report.fullCycle=await c.evaluate('({same:__TERRAIN_AUDIO__.loops.terrainDirtPass===__TERRAIN_AUDIO_QA__.dirtSource,playing:__SFX__.isPlaying(__TERRAIN_AUDIO_QA__.dirtSource)})');assert.ok(report.fullCycle.same&&report.fullCycle.playing)
 await key('Space',true);await until("__TERRAIN_AUDIO_QA__.calls.filter(c=>c.name==='terrainDirtDrift').length===1");await wait(350)
 assert.equal(await c.evaluate("__TERRAIN_AUDIO_QA__.calls.filter(c=>c.name==='terrainDirtDrift').length"),1)
 await resetAt(8000);await until('__TERRAIN_AUDIO__.gains.terrainGrassPass===1');await wait(500)
 report.grass=await sample();assert.equal(report.grass.volumes.terrainGrassPass,.35);assert.equal(report.grass.volumes.terrainDirtDrift,.35);assert.ok(report.grass.voices.terrainGrassPass.gain>.98);assert.ok(report.grass.voices.terrainDirtPass.gain<.01)
 await key('Space',true);await until("__TERRAIN_AUDIO_QA__.calls.filter(c=>c.name==='terrainDirtDrift').length===2");await wait(350)
 assert.equal(await c.evaluate("__TERRAIN_AUDIO_QA__.calls.filter(c=>c.name==='terrainDirtDrift').length"),2)
 await resetAt(12000);await until('__TERRAIN_AUDIO__.gains.terrainDirtPass===1');await wait(400)
 report.desert=await sample();assert.equal(report.desert.contacts.rear.biome,'desert');assert.ok(report.desert.voices.terrainDirtPass.gain>.98);assert.ok(report.desert.voices.terrainGrassPass.gain<.01)
 assert.ok(await c.evaluate('__TERRAIN_AUDIO__.loops.terrainDirtPass===__TERRAIN_AUDIO_QA__.dirtSource'))
 await tap('KeyP');await until('__MOSPEADA__.runtime.paused');await wait(200)
 report.pause=await sample();assert.ok(Object.values(report.pause.voices).every(v=>v.gain<.01))
 await tap('KeyP');await key('KeyW',true);await wait(200);await tap('KeyT');await until("__FRONT_BATTLOID__.entry.phase!=='idle'")
 await until('Object.values(__TERRAIN_AUDIO__.loops).every(v=>__SFX__.voiceGains.get(v).gain.value<.01)')
 report.transform=await sample();assert.ok(Object.values(report.transform.voices).every(v=>v.gain<.02))
 report.calls=await c.evaluate("__TERRAIN_AUDIO_QA__.calls.map(({name,loop,rate})=>({name,loop,rate}))")
 for(const name of ['terrainDirtPass','terrainGrassPass']){const calls=report.calls.filter(c=>c.name===name);assert.equal(calls.length,1);assert.equal(calls[0].loop,true);assert.equal(calls[0].rate,1)}
 assert.ok(report.calls.filter(c=>c.name==='terrainDirtDrift').every(c=>c.loop===false&&c.rate===1))
 report.newRequests=requests.length-initial;assert.equal(report.newRequests,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 for(const code of ['KeyW','Space'])await key(code,false).catch(()=>{})
 await c.evaluate(`if(window.__TERRAIN_AUDIO_QA__){const q=__TERRAIN_AUDIO_QA__;__SFX__.play=q.play;q.unregister();__ANIME__.scene.remove(q.group);q.group.traverse(m=>{m.geometry?.dispose();m.material?.dispose()})};true`).catch(()=>{})
 remove();await c.send('Browser.close').catch(()=>{});c.close()
}
