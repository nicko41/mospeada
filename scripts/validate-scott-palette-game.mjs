import fs from 'node:fs'
import assert from 'node:assert/strict'
const page=(await(await fetch('http://127.0.0.1:9381/json/list')).json()).find(p=>p.type==='page'),ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:key,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression).catch(()=>false))return;await pause(250)}throw Error('Timeout: '+expression)}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:5381/?environment=highway'})
 await wait('!!window.__SCOTT_ORIGINAL__?.instance?.v2RidingPose && !!window.__ANIME__?.state.snapshot().ready && !document.getElementById("entry-preloader")')
 const result=await evaluate(`(()=>{const d=__MOSPEADA__,a=__SCOTT_ORIGINAL__,r=d.runtime;r.opening?.finish();r.paused=true;d.setCameraMode(3);r.orbit.enableDamping=false;r.cameraController.update=()=>{};const mesh=a.instance.skins[0].mesh;return{model:a.model,bones:mesh.skeleton.bones.length,clips:a.source.animations.length,triangles:mesh.geometry.index.count/3,shaderError:__ANIME__.state.snapshot().error,material:mesh.material.name,gl:__ANIME__.renderer.getContext().getError()}})()`)
 assert.ok(result.model.endsWith('scott-bernard-gear-v2-classic-palette.glb'));assert.equal(result.bones,24);assert.equal(result.clips,16);assert.equal(result.triangles,240489);assert.equal(result.shaderError,'');assert.equal(result.gl,0)
 for(const [name,position]of Object.entries({front:[0,1.5,3.3],profile:[3.3,1.4,0],'three-quarter':[2.4,1.5,2.6]})){
  await evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,T=d.camera.position.constructor;r.orbit.target.copy(d.rig.body.localToWorld(new T(0,1.1,0)));d.camera.position.copy(d.rig.body.localToWorld(new T(${position.join(',')})));d.camera.fov=36;d.camera.updateProjectionMatrix();r.orbit.update();return true})()`);await pause(160);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('artifacts/scott-palette/game-'+name+'.png',Buffer.from(shot.data,'base64'))
 }
 result.uncaughtErrors=errors;assert.equal(errors.length,0);result.passed=true;fs.writeFileSync('artifacts/scott-palette/game-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{ws.close()}
