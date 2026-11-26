import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9365),urlPrefix:''}),origin=process.argv[2]||'http://127.0.0.1:5181/?intro=0',sleep=ms=>new Promise(r=>setTimeout(r,ms))
try{
 await c.send('Network.enable');await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Page.navigate',{url:origin})
 for(let i=0;i<480;i++){if(await c.evaluate('window.__STREAMING__?.states.rand.phase==="mounting"').catch(()=>false))break;await sleep(250)}
 await c.send('Profiler.start');console.log('Profiling Rand preparation')
 for(let i=0;i<480;i++){if(await c.evaluate('window.__STREAMING__?.states.rand.phase==="ready"').catch(()=>false))break;await sleep(250)}
 const {profile}=await c.send('Profiler.stop');fs.writeFileSync('.cache/rand-preparation.cpuprofile',JSON.stringify(profile))
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),totals=new Map()
 profile.samples.forEach((id,i)=>{const f=nodes.get(id).callFrame,key=f.functionName+' '+f.url+':'+f.lineNumber;totals.set(key,(totals.get(key)||0)+(profile.timeDeltas[i]||0)/1000)})
 const result={top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,22),...await c.evaluate('({slow:__ANIME__.effect.stats.streamingSlowJobs,queue:__QUEUE__,stages:Object.fromEntries(Object.entries(__STREAMING__.states).map(([k,s])=>[k,{phase:s.phase,ready:s.readyMs}]))})')}
 fs.writeFileSync('artifacts/startup-optimization/background-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,queue:undefined},null,2))
}finally{await c.send('Page.navigate',{url:'about:blank'}).catch(()=>{});c.close()}
