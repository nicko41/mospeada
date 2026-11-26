// Read-only deployment audit. Uses a dedicated Chrome profile on CDP 9357.
// Instrumentation is fulfilled into this browser only; nothing is deployed.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {parseAst} from 'vite'

const mode=process.argv[2]||'baseline',port=Number(process.env.DIAGNOSTIC_PORT||9357)
const origin=process.env.DIAGNOSTIC_URL||'https://mospeada.vercel.app/'
const out='artifacts/startup-diagnostic'
fs.mkdirSync(out,{recursive:true})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page=pages.find(p=>p.type==='page')
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),events=[]
let seq=0
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const errors=[]
socket.onmessage=async e=>{
 const m=JSON.parse(e.data)
 if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);return}
 if(m.method.startsWith('Network.')||m.method==='Runtime.exceptionThrown')events.push(m)
 if(m.method==='Fetch.requestPaused')try{
   const body=await send('Fetch.getResponseBody',{requestId:m.params.requestId})
   const source=body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body
   const transformed=instrumentBundle(source)
   const headers=(m.params.responseHeaders||[]).filter(h=>!['content-length','content-encoding'].includes(h.name.toLowerCase()))
   await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:m.params.responseStatusCode,responseHeaders:headers,body:Buffer.from(transformed).toString('base64')})
 }catch(error){errors.push(error.message);await send('Fetch.continueRequest',{requestId:m.params.requestId}).catch(()=>{})}
}

function instrumentBundle(source){
 const edits=[],identified=[]
 for(const n of parseAst(source).body){
  for(const d of n.declarations||[]){
   if(!d.init||d.init.type!=='ClassExpression')continue
   const text=source.slice(d.init.start,d.init.end),name=d.id.name
   if(text.includes('this.dracoLoader=null')&&text.includes('parse(')){
    edits.push({pos:n.end,code:`;globalThis.__STARTUP_DIAG__.loader(${name});`});identified.push({type:'GLTFLoader',name})
   }
   if(text.includes('prepareStartupViews()')){
    edits.push({pos:n.end,code:`;globalThis.__STARTUP_DIAG__.anime(${name});`});identified.push({type:'AnimeRenderer',name})
   }
   if(text.includes('this.isWebGLRenderer=!0')){
    const ctor=d.init.body.body.find(m=>m.kind==='constructor')
    if(!ctor)throw Error('Renderer constructor not found')
    edits.push({pos:ctor.value.body.end-1,code:';globalThis.__STARTUP_DIAG__.renderer(this);'});identified.push({type:'WebGLRenderer',name})
   }
  }
 }
 if(!identified.some(x=>x.type==='GLTFLoader')||!identified.some(x=>x.type==='AnimeRenderer')||!identified.some(x=>x.type==='WebGLRenderer'))throw Error('Missing instrumentation target: '+JSON.stringify(identified))
 fs.writeFileSync(`${out}/instrumentation-targets.json`,JSON.stringify({sha256:crypto.createHash('sha256').update(source).digest('hex'),identified},null,2))
 for(const e of edits.sort((a,b)=>b.pos-a.pos))source=source.slice(0,e.pos)+e.code+source.slice(e.pos)
 return source
}

function setup(detailed){
 const q=globalThis.__STARTUP_DIAG__={detailed,marks:[],spans:[],bitmaps:[],gpuQueries:[],glCalls:{},resources:[],longTasks:[],images:[],readyMs:null,rendererInfo:null}
 const now=()=>performance.now(),mark=(name,detail)=>q.marks.push({name,time:now(),detail})
 const span=(name,start,detail)=>q.spans.push({name,start,end:now(),duration:now()-start,...detail})
 performance.setResourceTimingBufferSize(10000)
 try{new PerformanceObserver(list=>q.longTasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true})}catch{}
 window.addEventListener('game-ready',()=>{q.readyMs=now();mark('game-ready')},{once:true})
 document.addEventListener('DOMContentLoaded',()=>{
  mark('DOMContentLoaded')
  let last=''
  new MutationObserver(()=>{const message=document.querySelector('#entry-loading-status')?.textContent||'removed';if(message!==last){mark('preloader',message);last=message}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']})
 })
 if(!detailed)return
 const bitmap=globalThis.createImageBitmap
 globalThis.createImageBitmap=function(...args){const start=now(),blob=args[0];return bitmap.apply(this,args).then(result=>{q.bitmaps.push({start,end:now(),duration:now()-start,bytes:blob?.size,width:result.width,height:result.height,type:blob?.type});return result})}
 const patched=new WeakSet()
 q.loader=Class=>{
  if(patched.has(Class))return;patched.add(Class)
  const parse=Class.prototype.parse
  Class.prototype.parse=function(data,path,onLoad,onError){const start=now(),bytes=data?.byteLength??data?.length;try{return parse.call(this,data,path,result=>{span('gltf.parse-inclusive',start,{path,bytes,meshes:result.scene?.children?.length});onLoad?.(result)},error=>{span('gltf.parse-error',start,{path,message:String(error)});onError?.(error)})}finally{span('gltf.parse-sync-entry',start,{path,bytes})}}
 }
 q.anime=Class=>{
  for(const name of ['warm','prepareOpening','prepareTextures','prepareStartupViews','waitForPreparedGpu','compileVariant','compileObject','prepareProgramBindings','primeVariant']){
   const original=Class.prototype[name];if(!original)continue
   Class.prototype[name]=function(...args){
    // warm/prepareOpening are called every frame; only record their first job.
    if(name==='warm'&&(this.warming||this.ready||this.error||this.disposed))return original.apply(this,args)
    if(name==='prepareOpening'&&(this.openingWork||!this.ready||this.disposed))return original.apply(this,args)
    const start=now();let r
    try{r=original.apply(this,args)}catch(e){span('anime.'+name,start,{error:String(e)});throw e}
    if(name==='warm')r=this.warming
    if(r?.then)r.then(()=>span('anime.'+name,start),e=>span('anime.'+name,start,{error:String(e)}));else span('anime.'+name,start)
    q.effect=this
    return r
   }
  }
 }
 q.renderer=renderer=>{
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2')
  q.rendererInfo={vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),timerQuery:!!timer,parallelCompile:!!gl.getExtension('KHR_parallel_shader_compile'),userAgent:navigator.userAgent}
  q.gl=gl;q.rendererInstance=renderer
  for(const name of ['initTexture','compile','compileAsync','render']){
   const original=renderer[name];if(!original)continue
   renderer[name]=function(...args){
    if(q.readyMs)return original.apply(this,args)
    const start=now(),texture=args[0],detail=name==='initTexture'?{uuid:texture?.uuid,width:texture?.image?.width,height:texture?.image?.height,source:texture?.image?.src||texture?.name}:{}
    let query
    if(name==='render'&&timer&&!gl.getQuery(timer.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query)}
    let r;try{r=original.apply(this,args)}finally{if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);q.gpuQueries.push({query,start,end:now()})}}
    if(r?.then)r.then(()=>span('renderer.'+name,start,detail));else span('renderer.'+name,start,detail)
    return r
   }
  }
  for(const name of ['texImage2D','texSubImage2D','texStorage2D','compressedTexImage2D','compressedTexSubImage2D','generateMipmap','bufferData','bufferSubData']){
   const original=gl[name];if(!original)continue
   gl[name]=function(...args){if(q.readyMs)return original.apply(this,args);const start=now();try{return original.apply(this,args)}finally{const s=q.glCalls[name]||={count:0,cpuMs:0};s.count++;s.cpuMs+=now()-start}}
  }
  q.readGpu=()=>q.gpuQueries.map(({query,start,end})=>({start,end,available:gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE),disjoint:gl.getParameter(timer.GPU_DISJOINT_EXT),gpuMs:gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)?gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6:null}))
 }
}

try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable',{maxTotalBufferSize:50000000,maxResourceBufferSize:10000000})
 await send('Page.navigate',{url:'about:blank'});await send('Network.clearBrowserCache');await send('Network.clearBrowserCookies');await send('Network.setCacheDisabled',{cacheDisabled:mode!=='cold'});await send('Network.setBypassServiceWorker',{bypass:true})
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${setup.toString()})(${mode==='instrumented'})`})
 if(mode==='instrumented'){
  await send('Fetch.enable',{patterns:[{urlPattern:'*/assets/index-*.js',requestStage:'Response'}]})
  await send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'})
 }
 events.length=0
 const start=Date.now();await send('Page.navigate',{url:origin})
 let state,lastLog=0
 while(Date.now()-start<600000){
  await sleep(1000)
  try{state=await evaluate(`(()=>{const q=globalThis.__STARTUP_DIAG__;return {readyMs:q?.readyMs,now:performance.now(),message:document.querySelector('#entry-loading-status')?.textContent,marks:q?.marks.slice(-3)}})()`)}catch{continue}
  if(Date.now()-lastLog>15000){console.log(JSON.stringify({mode,elapsedSeconds:Math.round((Date.now()-start)/1000),...state}));lastLog=Date.now()}
  if(state.readyMs){await sleep(2500);break}
 }
 const result=await evaluate(`(()=>{const q=__STARTUP_DIAG__;return {readyMs:q.readyMs,marks:q.marks,spans:q.spans,bitmaps:q.bitmaps,glCalls:q.glCalls,longTasks:q.longTasks,gpu:q.readGpu?.(),renderer:q.rendererInfo,preparation:q.effect?.stats.preparation,renderInfo:q.rendererInstance?{memory:q.rendererInstance.info.memory,programs:q.rendererInstance.info.programs.length}:null,navigation:performance.getEntriesByType('navigation').map(x=>x.toJSON()),resources:performance.getEntriesByType('resource').map(x=>x.toJSON()),images:[...document.images].map(x=>({src:x.src,width:x.naturalWidth,height:x.naturalHeight})),now:performance.now(),preloader:document.querySelector('#entry-loading-status')?.textContent}})()`)
 const report={date:new Date().toISOString(),mode,origin,chrome:version,network:mode==='cold'?'No throttling; browser cache initially empty, caching enabled during navigation; CDN cache not purged':'No throttling; browser cache disabled and cleared; CDN cache not purged',errors,...result,events}
 fs.writeFileSync(`${out}/${mode}.json`,JSON.stringify(report,null,2)+'\n')
 if(mode==='instrumented'){
  let completed
  const previous=socket.onmessage
  const traceDone=new Promise(resolve=>{completed=resolve})
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Tracing.tracingComplete')completed(m.params);else previous(e)}
  await send('Tracing.end')
  const trace=await traceDone,parts=[]
  for(;;){const chunk=await send('IO.read',{handle:trace.stream,size:1048576});parts.push(chunk.base64Encoded?Buffer.from(chunk.data,'base64'):Buffer.from(chunk.data));if(chunk.eof)break}
  await send('IO.close',{handle:trace.stream})
  fs.writeFileSync(`${out}/${mode}-trace.json`,Buffer.concat(parts))
 }
 const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${out}/${mode}.png`,Buffer.from(screenshot.data,'base64'))
 console.log(JSON.stringify({file:`${out}/${mode}.json`,readyMs:result.readyMs,resources:result.resources.length,events:events.length,errors,preparation:result.preparation,renderer:result.renderer}))
}finally{await send('Page.navigate',{url:'about:blank'}).catch(()=>{});socket.close()}
