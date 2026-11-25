import fs from 'node:fs'
import assert from 'node:assert/strict'
const page=(await(await fetch('http://127.0.0.1:9383/json/list')).json()).find(p=>p.type==='page'),ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:key,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function wait(expression){for(let i=0;i<160;i++){if(await evaluate(expression).catch(()=>false))return;await delay(250)}throw Error('Timeout: '+expression)}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1680,height:1000,deviceScaleFactor:1,mobile:false});const origin=await evaluate('performance.timeOrigin');await send('Page.navigate',{url:'http://127.0.0.1:5381/artifacts/scott-rear-refinement/preview.html'});await wait(`performance.timeOrigin!==${origin} && !!window.__SCOTT_REAR__`)
 for(const focus of['body','helmet','pelvis'])for(const name of['back','rear-quarter','profile',...(focus==='helmet'?['front']:[])]){await evaluate(`__SCOTT_REAR__.view('${name}','${focus}')`);await delay(100);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`artifacts/scott-rear-refinement/${focus}-${name}.png`,Buffer.from(shot.data,'base64'))}
 assert.equal(errors.length,0);assert.equal(await evaluate('__SCOTT_REAR__.renderer.getContext().getError()'),0);fs.writeFileSync('artifacts/scott-rear-refinement/preview-validation.json',JSON.stringify({passed:true,errors},null,2));console.log('Captured rear, rear-quarter and profile comparisons of body, helmet and pelvis.')
}finally{ws.close()}
