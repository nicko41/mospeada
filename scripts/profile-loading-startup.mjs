import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect({port:9365,urlPrefix:''}),sleep=ms=>new Promise(r=>setTimeout(r,ms));let script
try{
 await c.send('Network.enable');await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000})
 script=await c.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__STARTUP_PROFILE_READY__=0;window.addEventListener('game-ready',()=>__STARTUP_PROFILE_READY__=performance.now(),{once:true})"})
 await c.send('Profiler.start');await c.send('Page.navigate',{url:'http://127.0.0.1:5181/'})
 for(let i=0;i<600;i++){if(await c.evaluate('window.__STARTUP_PROFILE_READY__').catch(()=>false))break;await sleep(250)}
 const {profile}=await c.send('Profiler.stop');fs.writeFileSync('.cache/startup-final.cpuprofile',JSON.stringify(profile));const nodes=new Map(profile.nodes.map(n=>[n.id,n])),totals=new Map()
 profile.samples.forEach((id,i)=>{const f=nodes.get(id).callFrame,key=f.functionName+' '+f.url+':'+f.lineNumber;totals.set(key,(totals.get(key)||0)+(profile.timeDeltas[i]||0)/1000)})
 const result={top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,24),...await c.evaluate('({ready:__STARTUP_PROFILE_READY__,preparation:__ANIME__.effect.stats.preparation})')};fs.writeFileSync('artifacts/startup-optimization/startup-cpu-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{if(script)await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier}).catch(()=>{});await c.send('Page.navigate',{url:'about:blank'}).catch(()=>{});c.close()}
