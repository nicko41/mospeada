import fs from 'node:fs'
import assert from 'node:assert/strict'
const port=9377,url='http://127.0.0.1:5381',pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith(url))
if(!page)throw Error('No se encontró el navegador aislado de prueba')
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
socket.onmessage=e=>{const r=JSON.parse(e.data);if(r.id&&pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(expression,seconds=100){for(let i=0;i<seconds*4;i++){const ready=await ev(expression).catch(error=>{if(/navigated|context|Cannot find/i.test(error.message))return false;throw error});if(ready)return;await sleep(250)}throw Error('Timeout: '+expression)}
try{
 if(process.argv.includes('--close')){await send('Browser.close');console.log('Closed isolated test browser')}
 else if(process.argv.includes('--status')){console.log(await ev(`JSON.stringify({url:location.href,body:document.body.innerText.slice(0,1800),scott:!!window.__MOSPEADA__?.runtime.scottInstance,anime:window.__ANIME__?.state.snapshot()})`));process.exitCode=0}
 else{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1360,height:900,deviceScaleFactor:1,mobile:false})
 const oldOrigin=await ev('performance.timeOrigin');await send('Page.reload',{ignoreCache:true})
 await until(`performance.timeOrigin!==${oldOrigin}`,20)
 await until('!!window.__MOSPEADA__?.runtime.scottInstance && !!window.__ANIME__?.state.snapshot().ready')
 await until('!document.getElementById("entry-preloader") || document.getElementById("entry-preloader").classList.contains("is-ready")',100)
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__;d.runtime.paused=true;d.setCameraMode(3);return true})()`)
 const loaded=await ev(`(()=>{const r=__MOSPEADA__.runtime,m=r.scottInstance.skins[0].mesh;return{vertices:m.geometry.attributes.position.count,triangles:m.geometry.index.count/3,bones:m.skeleton.bones.length,referenceVertices:r.scottInstance.sourceScene.getObjectByName('char1').geometry.attributes.position.count,sourceAnimations:r.scottInstance.sourceClips.length,morphs:m.morphTargetInfluences.length,material:m.material.name,shaderError:__ANIME__.state.snapshot().error}})()`)
 const build=JSON.parse(fs.readFileSync('artifacts/scott-gear-v2/build.json')),originalMode=process.argv.includes('--original')
 assert.equal(loaded.vertices,originalMode?15429:build.renderedVertices+build.referenceVertices);assert.equal(loaded.triangles,originalMode?10334:build.triangles);assert.equal(loaded.bones,24);assert.equal(loaded.referenceVertices,15429);assert.equal(loaded.sourceAnimations,16);assert.equal(loaded.morphs,3);assert.ok(!loaded.shaderError)
 await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,T=d.camera.position.constructor,head=r.scottInstance.bones.get('mixamorigHead').getWorldPosition(new T()),target=head.clone().add(new T(0,-.35,0));r.orbit.enableDamping=false;r.orbit.target.copy(target);d.camera.position.copy(target).add(new T(1.9,.2,-3.2));r.orbit.update();d.camera.fov=38;d.camera.updateProjectionMatrix();return true})()`)
 await sleep(300);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`artifacts/scott-gear-v2/browser-${originalMode?'original':'driving'}.png`,Buffer.from(shot.data,'base64'))
 if(process.argv.includes('--model-only')){const result={passed:true,loaded,uncaughtErrors:errors};fs.writeFileSync('artifacts/scott-gear-v2/browser-original.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))}
 else{
 await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime;d.setCameraMode(0);r.paused=false;r.state.speed=18;r.state.parked=false;r.state.idleBlend=0;r.keys={};return true})()`)
 await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyT',key:'t'});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyT',key:'t'})
 await until('!!__MOSPEADA__.runtime.armorController?.active',90)
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:690,y:450,button:'right',buttons:2,clickCount:1})
 await sleep(800)
 const armor=await ev(`(()=>{const r=__MOSPEADA__.runtime,m=r.scottInstance.skins[0].mesh;return{active:r.armorController.active,phase:r.transformEntry.phase,mode:r.armorController.state.mode,aiming:r.gallant.aimInput.held,vertices:m.geometry.attributes.position.count,bones:m.skeleton.bones.length,glError:__ANIME__.renderer.getContext().getError(),shaderError:__ANIME__.state.snapshot().error}})()`)
 assert.equal(armor.active,true);assert.equal(armor.glError,0);assert.ok(!armor.shaderError)
 const before=await ev('__MOSPEADA__.runtime.gallant.shots')
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:690,y:450,button:'left',buttons:3,clickCount:1})
 await until(`__MOSPEADA__.runtime.gallant.shots>${before}`,15)
 armor.shotsFired=await ev(`__MOSPEADA__.runtime.gallant.shots-${before}`)
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:690,y:450,button:'left',buttons:2,clickCount:1})
 const combatShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/scott-gear-v2/browser-armor.png',Buffer.from(combatShot.data,'base64'))
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:690,y:450,button:'right',buttons:0,clickCount:1})
 const result={passed:true,loaded,armor,uncaughtErrors:errors};fs.writeFileSync('artifacts/scott-gear-v2/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
 }
 }
}catch(error){const detail={error:error.message,errors,status:await ev(`JSON.stringify({body:document.body.innerText.slice(0,1800),scott:!!window.__MOSPEADA__?.runtime.scottInstance,anime:window.__ANIME__?.state.snapshot()})`).catch(()=>null)};fs.writeFileSync('artifacts/scott-gear-v2/browser-failure.json',JSON.stringify(detail,null,2)+'\n');throw error
}finally{socket.close()}
