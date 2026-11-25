import fs from 'node:fs'
import assert from 'node:assert/strict'
const dir='artifacts/scott-v2-arm-extension',pages=await(await fetch('http://127.0.0.1:9378/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.includes('/scott-v2-arm-extension/preview.html'))
if(!page)throw Error('Missing isolated extension preview')
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let sequence=0
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.id&&pending.has(v.id)){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result)}else if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},30000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value},sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function shot(name){await sleep(150);const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(dir+'/'+name+'.png',Buffer.from(image.data,'base64'))}
try{
 if(process.argv.includes('--close')){await send('Browser.close');console.log('Closed isolated extension browser')}
 else{
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  for(let i=0;i<240;i++){if(await ev('!!window.__ARM_EXTENSION__'))break;await sleep(250)}assert.ok(await ev('!!window.__ARM_EXTENSION__'))
  const report={states:[],extension:JSON.parse(fs.readFileSync(dir+'/reference-pose.json')).reference}
  for(const[name,time]of[['Stand_Up1',1.6],['Stand_Up10',1.5],['Stand_Up4',.5],['One_Arm_Handstand',1.5]]){
   const r=await ev(`(()=>{const d=__ARM_EXTENSION__;d.setPlaying(false);d.selectClip(${JSON.stringify(name)});d.seek(${time});d.view('three-quarter');return d.status})()`);report.states.push(r);assert.equal(r.gl,0);await shot(name)
  }
  await ev(`(()=>{const d=__ARM_EXTENSION__;d.selectClip('air_squat');d.seek(d.candidate.time);d.setPlaying(false);document.getElementById('status').textContent='air_squat · extensión bilateral de referencia, '+d.candidate.time.toFixed(3)+' s. No hay un clip Push Up en los 16 existentes.';return d.status})()`)
  for(const view of['front','profile','back','three-quarter']){await ev(`__ARM_EXTENSION__.view(${JSON.stringify(view)})`);await shot('extension-'+view)}
  await ev(`__ARM_EXTENSION__.seek(.7);__ARM_EXTENSION__.view('three-quarter')`);await shot('forward-extension-mid-squat')
  const video=await ev(`(async()=>{const d=__ARM_EXTENSION__,chunks=[],stream=d.renderer.domElement.captureStream(30),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t)),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000});recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);d.seek(0);d.setPlaying(true);recorder.start();await new Promise(r=>setTimeout(r,4500));recorder.stop();await done;d.setPlaying(false);stream.getTracks().forEach(t=>t.stop());return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:mime}))})})()`)
  fs.writeFileSync(dir+'/air-squat-extension.webm',Buffer.from(video,'base64'))
  await ev(`__ARM_EXTENSION__.seek(__ARM_EXTENSION__.candidate.time)`)
  report.errors=errors;report.final=await ev('__ARM_EXTENSION__.status');assert.equal(errors.length,0);assert.equal(report.final.gl,0);report.passed=true;fs.writeFileSync(dir+'/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,clip:report.extension.clip,time:report.extension.time,views:4,videoBytes:fs.statSync(dir+'/air-squat-extension.webm').size,errors:errors.length}))
 }
}finally{socket.close()}
