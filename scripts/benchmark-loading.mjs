import fs from 'node:fs'
import {startupMetrics} from './startup-metrics.mjs'
const port=Number(process.env.MOSPEADA_TEST_PORT||9365),label=process.argv[2]||'after',origin=process.argv[3]||'http://127.0.0.1:5181/',mbps=Number(process.argv[4]||20),warm=process.argv.includes('--warm')
const dir='artifacts/startup-optimization';fs.mkdirSync(dir,{recursive:true})
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page'),socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),events=[];let id=0
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))})
socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else if(m.method.startsWith('Network.')||m.method==='Runtime.exceptionThrown')events.push(m)}
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value},sleep=ms=>new Promise(r=>setTimeout(r,ms))
let initScript
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Page.navigate',{url:'about:blank'})
 if(!warm){await send('Network.clearBrowserCache');await send('Network.clearBrowserCookies')}
 await send('Network.setCacheDisabled',{cacheDisabled:false});await send('Network.setBypassServiceWorker',{bypass:true})
 await send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:mbps*1e6/8,uploadThroughput:mbps*1e6/8,connectionType:'wifi'})
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 initScript=await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__BENCH__={tasks:[],errors:[],marks:[]};performance.setResourceTimingBufferSize(10000);new PerformanceObserver(l=>__BENCH__.tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});window.addEventListener('error',e=>__BENCH__.errors.push(e.message));window.addEventListener('unhandledrejection',e=>__BENCH__.errors.push(String(e.reason)));window.addEventListener('game-ready',()=>{__BENCH__.ready=performance.now()},{once:true})`})
 events.length=0;await send('Page.navigate',{url:origin})
 const start=Date.now();let state,last=0
 while(Date.now()-start<900000){
  await sleep(500);state=await ev(`({now:performance.now(),ready:window.__BENCH__?.ready,status:document.querySelector('#entry-loading-status')?.textContent,error:window.__ANIME__?.state.snapshot().error,errors:window.__BENCH__?.errors})`).catch(()=>null)
  if(Date.now()-last>15000){console.log(JSON.stringify({label,mbps,warm,...state}));last=Date.now()}
  if(state?.error||state?.errors?.length)throw Error(JSON.stringify(state))
  if(state?.ready)break
 }
 if(!state?.ready)throw Error('game-ready timeout')
 const result=await ev(`(()=>{const b=__BENCH__,renderer=window.__ANIME__?.renderer,g=renderer?.getContext(),ext=g?.getExtension('WEBGL_debug_renderer_info');return{readyMs:b.ready,tasks:b.tasks,errors:b.errors,resources:performance.getEntriesByType('resource').filter(x=>/^http/.test(x.name)).map(x=>x.toJSON()),navigation:performance.getEntriesByType('navigation').map(x=>x.toJSON()),preparation:window.__ANIME__?.effect.stats.preparation,programs:renderer?.info.programs.length,gpu:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,renderSize:renderer?[renderer.domElement.width,renderer.domElement.height]:null,streaming:window.__STREAMING__?Object.fromEntries(Object.entries(__STREAMING__.states).map(([id,s])=>[id,{phase:s.phase,start:s.startMs,ready:s.readyMs}])):null}})()`)
 const metrics=startupMetrics(result,events)
 const report={date:new Date().toISOString(),label,origin,mbps,latencyMs:100,warm,cache:'Enabled; emptied before cold runs only',compression:'Local Brotli quality 4; identical server settings before/after',...result,metrics,events}
 if(process.argv.includes('--control')){
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:16,y:16});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:16,y:16})
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Enter',key:'Enter'});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Enter',key:'Enter'})
  const controlStart=Date.now();let control
  while(Date.now()-controlStart<120000){await sleep(200);control=await ev(`window.__MOSPEADA__&&!__MOSPEADA__.runtime.opening?.active&&!document.querySelector('#entry-preloader')?performance.now():null`);if(control)break}
  if(!control)throw Error('Control did not become available after the original introduction')
  report.control=await ev(`({readyMs:${control},tasks:__BENCH__.tasks,resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON())})`)
  report.control.metrics=startupMetrics(report.control,events);report.control.introductionMs=control-result.readyMs
 }
 const name=`${label}-${mbps}mbps-${warm?'warm':'cold'}`
 fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(report,null,2)+'\n')
 fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 console.log(JSON.stringify({file:`${dir}/${name}.json`,readyMs:result.readyMs,metrics,preparation:result.preparation,streaming:result.streaming,controlMs:report.control?.readyMs}))
}finally{if(initScript)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:initScript.identifier}).catch(()=>{});await send('Page.navigate',{url:'about:blank'}).catch(()=>{});socket.close()}
