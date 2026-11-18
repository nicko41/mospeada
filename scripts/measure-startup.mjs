import fs from 'node:fs'
import { connect } from './browser-cdp.mjs'

const c = await connect(), label = process.argv[2] || 'current', wait = ms => new Promise(r => setTimeout(r, ms))
try {
  await c.send('Emulation.clearDeviceMetricsOverride')
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true })
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__LOAD_BENCH__={longTasks:[]};new PerformanceObserver(list=>{for(const e of list.getEntries())__LOAD_BENCH__.longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});window.addEventListener('game-ready',()=>__LOAD_BENCH__.entryMs=performance.now(),{once:true});` })
  const before = await c.evaluate('performance.timeOrigin')
  await c.send('Page.reload', { ignoreCache: true })
  let ready = false
  for (let i = 0; i < 900; i++) {
    if (await c.evaluate(`performance.timeOrigin!==${before} && !!window.__LOAD_BENCH__?.entryMs`).catch(() => false)) { ready = true; break }
    await wait(200)
  }
  if (!ready) throw Error('Startup did not finish within 180 seconds')
  const report = await c.evaluate(`(()=>{const b=__LOAD_BENCH__,a=__ANIME__,r=performance.getEntriesByType('resource');return{entryMs:b.entryMs,preparation:a.effect.stats.preparation,programs:a.renderer.info.programs.length,materials:a.effect.records.size,assetsEndMs:Math.max(...r.filter(e=>/\\.(glb|png|jpe?g|webp)(\\?|$)/.test(e.name)).map(e=>e.responseEnd)),longTasks:b.longTasks.length,longTaskMs:b.longTasks.reduce((s,e)=>s+e.duration,0),maxTaskMs:Math.max(0,...b.longTasks.map(e=>e.duration)),mode:a.state.snapshot().mode,error:a.state.snapshot().error,gl:a.renderer.getContext().getError()}})()`)
  fs.mkdirSync('artifacts/render-startup', { recursive: true })
  fs.writeFileSync(`artifacts/render-startup/${label}.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await c.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {}); c.close() }
