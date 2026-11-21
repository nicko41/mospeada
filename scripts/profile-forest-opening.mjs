import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),label=process.argv[2]||'baseline',dir='artifacts/forest-opening/profile'
const instrumentation=()=>{
  if(window.__INTRO_TRACE__)return
  // Test-only: preserve playback timing/decoding without audible music.
  const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){this.muted=true;return play.apply(this,args)}
  const trace=window.__INTRO_TRACE__={frames:[],work:[],longTasks:[]};let last=0
  const phase=()=>({phase:window.__FOREST_OPENING__?.phase,elapsed:window.__FOREST_OPENING__?.elapsed||0})
  function wrap(object,key,name,threshold=3){
    const fn=object?.[key];if(!fn||fn.__introTrace)return
    const wrapped=function(...args){const t=performance.now();try{return fn.apply(this,args)}finally{const ms=performance.now()-t;if(ms>=threshold)trace.work.push({name,t,ms,...phase(),args:['compileVariant','primeVariant'].includes(key)?[args[0]]:key==='setPixelRatio'?args:undefined})}}
    wrapped.__introTrace=true;object[key]=wrapped
  }
  new PerformanceObserver(list=>{for(const e of list.getEntries())trace.longTasks.push({t:e.startTime,ms:e.duration,...phase()})}).observe({type:'longtask',buffered:true})
  function tick(now){
    const a=window.__ANIME__,f=window.__FOREST_FOLIAGE_WORLD__
    if(a){
      for(const key of ['compileObject','compileVariant','primeVariant','resize','collect','sync','drawSceneTarget','render'])wrap(a.effect,key,key,key==='render'?16:key==='drawSceneTarget'?12:3)
      wrap(a.renderer,'setPixelRatio','setPixelRatio',0);wrap(a.renderer,'setSize','setSize',0);wrap(a.effect.target,'setSize','targetResize',0)
      wrap(a.renderer,'compile','rendererCompile',3)
      const gl=a.renderer.getContext();for(const key of ['getProgramParameter','getUniformLocation','getActiveUniform','getActiveAttrib','getProgramInfoLog','getShaderInfoLog'])wrap(gl,key,key,8)
    }
    if(f){wrap(f.manager,'prepare','sectorPrepare',2);wrap(f.manager,'visibleGroups','visibleGroupCount',3)}
    const p=phase()
    if(p.phase==='playing'||p.phase==='lead')trace.frames.push({t:now,ms:last?now-last:0,...p,dpr:a?.renderer.getPixelRatio(),programs:a?.renderer.info.programs.length,nightReady:a?.effect.nightReady||false,pending:f?.manager.queue.length,calls:a?.effect.stats.renderCalls})
    last=now;requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
try{
  await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${instrumentation.toString()})()`})
  const origin=await c.evaluate('performance.timeOrigin'),url=new URL(await c.evaluate('location.href'));url.searchParams.delete('intro');await c.send('Page.navigate',{url:url.href})
  for(let i=0;i<100;i++){if(await c.evaluate(`performance.timeOrigin!==${origin}`))break;await wait(30)}
  for(let i=0;i<700;i++){const phase=await c.evaluate('window.__FOREST_OPENING__?.phase');if(['blocked','lead','playing'].includes(phase))break;if(i===699)throw Error('Intro did not load');await wait(100)}
  await c.send('Profiler.enable');await c.send('Profiler.start')
  const box=await c.evaluate(`(()=>{const b=document.querySelector('.forest-opening-start')?.getBoundingClientRect();return b?{x:b.x+b.width/2,y:b.y+b.height/2}:null})()`)
  if(box){await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box})}
  for(let i=0;i<600;i++){if(await c.evaluate('window.__FOREST_OPENING__?.phase==="done"'))break;if(i===599)throw Error('Intro did not finish');await wait(80)}
  const cpu=await c.send('Profiler.stop'),result=await c.evaluate('({trace:__INTRO_TRACE__,preparation:__ANIME__.effect.stats.preparation,error:__ANIME__.state.snapshot().error})')
  fs.writeFileSync(`${dir}/${label}.json`,JSON.stringify(result));fs.writeFileSync(`${dir}/${label}.cpuprofile`,JSON.stringify(cpu.profile))
  const frames=result.trace.frames.filter(f=>f.phase==='playing'),ordered=frames.map(f=>f.ms).sort((a,b)=>a-b),slow=frames.filter(f=>f.ms>100).map(f=>({...f,work:result.trace.work.filter(w=>w.t>=f.t-f.ms-2&&w.t<f.t+2&&w.ms>10)}))
  console.log(JSON.stringify({label,frames:frames.length,median:ordered[Math.floor(ordered.length*.5)],p95:ordered[Math.floor(ordered.length*.95)],max:Math.max(...ordered),programs:[frames[0]?.programs,frames.at(-1)?.programs],pending:[frames[0]?.pending,frames.at(-1)?.pending],slow:slow.sort((a,b)=>b.ms-a.ms).slice(0,4),preparation:result.preparation,error:result.error},null,2))
}finally{c.close()}
