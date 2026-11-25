import fs from 'node:fs'
import assert from 'node:assert/strict'
const pages=await(await fetch('http://127.0.0.1:9381/json/list')).json(),page=pages.find(p=>p.type==='page'),ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:key,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function wait(expression){for(let i=0;i<160;i++){if(await evaluate(expression).catch(()=>false))return;await pause(250)}throw Error('Timeout: '+expression)}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1680,height:980,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:5381/artifacts/scott-palette/preview.html'});await wait('!!window.__PALETTE__')
 const report={}
 for(const head of[false,true])for(const name of['front','profile','back','three-quarter']){await evaluate(`__PALETTE__.view('${name}',${head})`);await pause(120);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`artifacts/scott-palette/${head?'helmet':'body'}-${name}.png`,Buffer.from(shot.data,'base64'))}
 report.models=await evaluate(`__PALETTE__.assets.map(a=>{let mesh;a.scene.traverse(n=>{if(n.isSkinnedMesh)mesh=n});return{bones:mesh.skeleton.bones.length,clips:a.animations.length,vertices:mesh.geometry.attributes.position.count,triangles:mesh.geometry.index.count/3}})`)
 assert.equal(report.models[2].bones,24);assert.equal(report.models[2].clips,16);assert.deepEqual(report.models[1],report.models[2]);report.errors=errors;assert.equal(errors.length,0);report.passed=true;fs.writeFileSync('artifacts/scott-palette/preview-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{ws.close()}
