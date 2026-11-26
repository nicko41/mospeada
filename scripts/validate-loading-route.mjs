// Local QA only: follows the authored road through the real controller, uses
// normal boost and aims the existing Gallant. No game or visual settings change.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
import {startupMetrics} from './startup-metrics.mjs'
const origin=process.argv[2]||'http://127.0.0.1:5181/',mbps=Number(process.argv[3]||20),label=process.argv[4]||'after',warm=process.argv.includes('--warm'),coldStreaming=process.argv.includes('--cold-streaming'),c=await connect({port:9365,urlPrefix:''}),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const directory='artifacts/startup-optimization',armorPilot=process.argv.includes('--armor'),intercepted=new Set(),coldToken=Date.now().toString(36);let script
try{
 await c.send('Network.enable');if(!warm)await c.send('Network.clearBrowserCache');await c.send('Network.setCacheDisabled',{cacheDisabled:false});await c.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:mbps*1e6/8,uploadThroughput:mbps*1e6/8});await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 if(coldStreaming){
  const paths=['*/delivery/mars-gallant.glb*','*/assets/explosion-*.png*','*/textures/desert/*','*/assets/desierto-floor*','*/delivery/invid-scout.glb*','*/assets/invid-blood*','*/assets/invid-orbes*','*/delivery/rand-rider.glb*','*/delivery/horizon-t.glb*','*/assets/02-*','*/assets/03-*','*/assets/04-*']
  c.onEvent(event=>{if(event.method!=='Fetch.requestPaused')return;const {requestId,request}=event.params,url=new URL(request.url);intercepted.add(request.url);url.searchParams.set('qaCold',coldToken);const headers=Object.entries(request.headers).filter(([key])=>!['if-none-match','if-modified-since','cache-control'].includes(key.toLowerCase())).map(([name,value])=>({name,value}));headers.push({name:'Cache-Control',value:'no-cache'});c.send('Fetch.continueRequest',{requestId,url:url.href,headers}).catch(console.error)})
  await c.send('Fetch.enable',{patterns:paths.map(urlPattern=>({urlPattern,requestStage:'Request'}))})
 }
 script=await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.__ROUTE_QA__={frames:[],tasks:[],errors:[],marks:[],missed:[],done:false};
 new PerformanceObserver(l=>__ROUTE_QA__.tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
 window.addEventListener('error',e=>__ROUTE_QA__.errors.push(e.message));window.addEventListener('unhandledrejection',e=>__ROUTE_QA__.errors.push(String(e.reason)));
 window.addEventListener('game-ready',()=>{
  const q=__ROUTE_QA__,d=__MOSPEADA__,r=d.runtime,initialState=r.state;q.ready=performance.now();q.startup={readyMs:q.ready,resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),preparation:{...__ANIME__.effect.stats.preparation}};q.last=q.ready;q.maxSpeed=0;q.maxAirBoosts=0;q.lastMotion=q.ready;q.previousZ=0;r.opening.finish();r.paused=false;q.approach={x:r.state.x,z:r.state.z,yaw:r.state.yaw};
  let input=r.input;Object.defineProperty(r,'input',{configurable:true,get:()=>input,set:value=>{if(value&&value.steer!==undefined&&q.steering!==undefined&&!r.ending?.holding&&!r.opening?.active&&r.transformEntry?.phase==='idle'&&!r.armorController?.active&&!r.scottInstance?.hitMotion?.knockedDown){value.steer=q.steering;value.throttle=r.state.airborne?1:Math.max(0,Math.min(1,(q.targetSpeed-r.state.speed)*.3+.1));value.brake=r.state.airborne?0:Math.max(value.brake||0,Math.min(1,(r.state.speed-q.targetSpeed-1)*.25))}input=value}});
  const mark=(name,id,prepared=false)=>{if(q.marks.some(m=>m.name===name))return;const state=window.__STREAMING__?.states[id];q.marks.push({name,at:performance.now(),z:r.state.z,stage:id,phase:state?.phase,readyMs:prepared?state?.preparedMs:state?.readyMs,requirement:prepared?'prepared':'placed-ready'});if(state&&state.phase!=='ready'&&!(prepared&&state.phase==='prepared'))q.missed.push({name,phase:state.phase,at:performance.now()})};
  const tick=now=>{try{
   if(q.done)return;const s=r.state,w=window.__FOREST_STAGE4__?.world,e=r.stage3?.encounter,patrol=r.desertPatrol,ending=r.ending,dt=now-q.last;q.last=now;q.maxSpeed=Math.max(q.maxSpeed,s.speed);q.maxAirBoosts=Math.max(q.maxAirBoosts,s.airBoostCount||0);
   const health=Number(document.querySelector('.ride-health')?.getAttribute('aria-valuenow')??100);q.minimumHealth=Math.min(q.minimumHealth??100,health);if(health<=0)throw Error('Pilot defeated in real combat');if(s!==initialState)throw Error('Unexpected gameplay reset during route');
   const depth=w?.bound?w.distance(s.z):null,combat=e?.active?'forest':patrol?.active?'scouts':'driving';q.frames.push({at:now,ms:dt,z:s.z,x:s.x,speed:s.speed,depth,combat,phase:ending?.phase,blocked:!!s.blocked,yaw:s.yaw,airborne:s.airborne,road:window.__FOREST_STAGE4__?.world.bound?window.__FOREST_STAGE4__.world.startAt(depth).x:null});
   if(s.z<=-400)mark('entered-stage2','stage2');if(s.z<=-780&&s.airborne)mark('canyon-flight','stage2');if(s.z<=-930&&!s.airborne)mark('canyon-landing','stage2');if(s.z<=-1044)mark('stage3-lookahead','stage3');if(e?.active)mark('forest-combat','stage3');if(e?.phase==='exiting')mark('stage4-connector-lookahead','stage4',true);if(w?.bound&&depth>=0)mark('entered-stage4','stage4');if(depth>=430){mark('desert-lookahead-scouts','scouts');mark('desert-lookahead-rand','rand')}if(depth>=2220)mark('horizon-lookahead','horizon');if(depth>=2400)mark('entered-final-plain','horizon');
   if(q.missed.length)throw Error('Stage missed preparation deadline: '+JSON.stringify(q.missed));if(ending?.phase==='done'){q.done=true;q.completed=true;r.keys={};r.paused=true;return}
   if(Math.abs(s.z-q.previousZ)>1){q.lastMotion=now;q.previousZ=s.z}if(now-q.lastMotion>12000&&!ending?.holding&&!e?.active&&!patrol?.active&&!r.armorController?.active)throw Error('No forward progress: '+s.z+' blocked='+s.blocked+' encounter='+e?.phase);
   if(r.levelProgress?.recoveries>0)throw Error('Canyon recovery during maximum-boost route');
   if(${armorPilot}&&!ending?.holding){
    // QA actuates native keys and camera look. No actor positions, health,
    // enemy damage, unlocks or controller parameters are changed.
    const armor=r.armorController,c=r.gallant,escort=r.randEscape;
    if(r.armorUnlocked&&!q.requestedArmor&&r.transformEntry?.phase==='idle'&&s.speed>5){q.requestedArmor=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t'}))}
    if(armor?.active){
     q.usedNativeArmor=true;const a=armor.state,targets=(patrol?.active?patrol.scouts:[]).filter(t=>!t.dead&&t.meleeEnabled);let chosen=null,best=Infinity
     for(const target of targets){const distance=Math.hypot(target.position.x-a.x,target.position.z-a.z),priority=(target.focus==='rand'?(r.climaxSequence.phase==='battle'?-1000:-50):0)+(target===c?.aimLock.target?-600:0);if(distance+priority<best){best=distance+priority;chosen=target}}
     r.keys.KeyA=r.keys.KeyD=r.keys.KeyW=r.keys.KeyS=r.keys.ShiftLeft=r.keys.Space=false;r.boostQueued=false
     if(chosen){
      const dx=chosen.position.x-a.x,dz=chosen.position.z-a.z,distance=Math.hypot(dx,dz),dy=chosen.position.y+chosen.height*.55-(a.y+1.35)
      armor.camera.intro=1;armor.camera.yaw=Math.atan2(dx,dz);armor.camera.pitch=Math.max(-1.1,Math.min(1.25,-Math.atan2(dy,Math.max(1,distance))))
      r.keys.KeyW=distance>38;r.keys.KeyS=distance<25;r.keys.ShiftLeft=distance>65||c?.aimLock.target===chosen;r.keys.KeyA=distance<=45&&Math.sin(now/3000)>0;r.keys.KeyD=distance<=45&&!r.keys.KeyA;r.keys.Space=now%5200<800
      if(c){c.aimInput.press(s);c.firing=true;if(c.aimLock.ready&&c.missiles.remaining>0&&c.missiles.cooldown<=0&&!r.scottInstance.missilePose?.active)window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',key:'q'}))}
     }else if(escort?.active){
      const dx=escort.x-a.x,dz=escort.z+28-a.z,distance=Math.hypot(dx,dz);armor.camera.intro=1;armor.camera.yaw=Math.atan2(dx,dz);armor.camera.pitch=.1;r.keys.KeyW=distance>12;r.keys.ShiftLeft=distance>60;if(c){c.aimInput.clear();c.firing=false}
     }
     q.weapon={shots:c?.shots,hits:c?.hits,missiles:c?.missiles.stats,lockReady:c?.aimLock.ready};requestAnimationFrame(tick);return
    }
   }
   if(!ending?.holding){
    const look=10+Math.abs(s.speed)*.5;let targetZ=s.z-look;const oldPath=z=>Math.sin(z*.013)*20+Math.sin(z*.033)*3;
    const roadX=z=>{if(w?.bound&&w.distance(z)>=-20)return w.startAt(w.distance(z)).x;if(z<=-1120){const k=Math.PI*2/768,t=k*(-1120-z);return oldPath(-480)+12*(1-Math.cos(t))-7*(1-Math.cos(t*2))}if(z<=-400){const f=Math.max(0,Math.min(1,(-z-400)/80)),t=f*f*(3-2*f);return oldPath(z)*(1-t)+oldPath(-480)*t}return oldPath(z)};
    let targetX=roadX(targetZ);
    if(s.z>-22)targetX=q.approach.x+(targetZ-q.approach.z)*Math.tan(q.approach.yaw);
    const escort=r.randEscape,hunt=depth>900&&escort?.active&&(patrol?.active||r.climaxSequence?.active);if(hunt){targetX=escort.x-escort.forward.x*24+3*Math.sin(now/900);targetZ=escort.z-escort.forward.z*24}
    const cx=roadX(s.z),ahead=roadX(s.z-2),behind=roadX(s.z+2),slope=(behind-ahead)/4,k=-(ahead-2*cx+behind)/4/(1+slope*slope)**1.5,pathYaw=Math.atan2(ahead-behind,-4),cross=(cx-s.x)*Math.cos(pathYaw),desired=Math.atan2(targetX-s.x,targetZ-s.z),error=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw));let curvature=Math.abs(k);for(let distance=0;distance<20+s.speed*s.speed/52;distance+=20){const z=s.z-distance,x=roadX(z),a=roadX(z-2),b=roadX(z+2),slope=(b-a)/4;curvature=Math.max(curvature,Math.abs(a-2*x+b)/4/(1+slope*slope)**1.5)}q.steering=Math.max(-1,Math.min(1,Math.atan(d.rig.metrics.wheelbase*2*Math.sin(error)/Math.max(1,Math.hypot(targetX-s.x,targetZ-s.z)))/Math.min(.52,Math.atan(6.2*d.rig.metrics.wheelbase/Math.max(4,s.speed*s.speed)))));q.targetSpeed=s.z>-55?8:Math.min(Math.abs(cross)>1.5?20:80,Math.sqrt(6.2/Math.max(.0001,curvature))*.86);if(depth!==null&&depth>=0&&depth<620)q.targetSpeed=Math.min(q.targetSpeed,14);if(patrol?.active)q.targetSpeed=Math.min(q.targetSpeed,24);r.keys.KeyW=true;r.keys.KeyA=r.keys.KeyD=false;
    r.boostQueued=!s.boostPressed&&((s.airborne&&!s.airBoostUsed&&s.z<-800&&s.z>-930)||(!s.airborne&&s.boostCooldown<=0&&s.speed<q.targetSpeed-4&&q.targetSpeed>50));
    const c=r.gallant,targets=e?.active?e.drones:patrol?.active?patrol.scouts:[];
    if(hunt)q.targetSpeed=Math.max(8,Math.min(Math.abs(error)>.7?12:30,escort.speed+(Math.hypot(targetX-s.x,targetZ-s.z)-8)*.55));
    if(c){let chosen=null,score=Infinity;for(const target of targets){if(target.dead||e?.active&&!target.spawned||!e?.active&&!target.meleeEnabled)continue;const point=target.position?.clone?.()||target.view?.root?.position.clone();if(!point)continue;if(!e?.active)point.y+=target.height*.55;const screen=point.clone().project(d.camera),distance=point.distanceTo(d.camera.position),priority=target===c.aimLock.target?-1000:!e?.active&&target.focus==='rand'?-200:0;if(Math.abs(screen.x)<.95&&Math.abs(screen.y)<.9&&screen.z<1&&distance+priority<score){score=distance+priority;chosen=screen}}
     if(chosen){c.aimInput.press(s);c.pointer.set(chosen.x,chosen.y);c.firing=true;if(c.aimLock.ready&&c.missiles.remaining>0&&c.missiles.cooldown<=0&&!r.scottInstance.missilePose?.active)window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',key:'q'}))}else{c.aimInput.clear();c.firing=false}}
   }
   requestAnimationFrame(tick)
  }catch(error){q.errors.push(error.stack||error.message);q.done=true;r.keys={};r.paused=true}};requestAnimationFrame(tick)
 },{once:true});`})
 await c.send('Page.navigate',{url:origin})
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:16,y:16});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:16,y:16})
 const started=Date.now();let state,last=0
 while(Date.now()-started<1200000){await sleep(1000);state=await c.evaluate(`({now:performance.now(),ready:__ROUTE_QA__?.ready,done:__ROUTE_QA__?.done,errors:__ROUTE_QA__?.errors,marks:__ROUTE_QA__?.marks.slice(-2),state:window.__MOSPEADA__?{z:__MOSPEADA__.runtime.state.z,speed:__MOSPEADA__.runtime.state.speed,encounter:__MOSPEADA__.runtime.stage3?.encounter.phase,kills:__MOSPEADA__.runtime.stage3?.encounter.kills,patrol:__MOSPEADA__.runtime.desertPatrol?.phase,scouts:__MOSPEADA__.runtime.desertPatrol?.kills,ending:__MOSPEADA__.runtime.ending?.phase}:null})`).catch(()=>null);if(Date.now()-last>15000){console.log(JSON.stringify(state));last=Date.now()}if(state?.done)break}
 const result=await c.evaluate(`(()=>{const q=__ROUTE_QA__,a=__ANIME__;return {...q,gpu: a.renderer.getContext().getParameter(a.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),renderSize:[a.renderer.domElement.width,a.renderer.domElement.height],glError:a.renderer.getContext().getError(),shaderError:a.state.snapshot().error,slowPreparation:a.effect.stats.streamingSlowJobs,queue:window.__QUEUE__,streaming:window.__STREAMING__?Object.fromEntries(Object.entries(__STREAMING__.states).map(([id,s])=>[id,{phase:s.phase,start:s.startMs,ready:s.readyMs,error:s.error}])):null}})()`)
 const summarize=frames=>{const a=frames.map(f=>f.ms).sort((x,y)=>x-y);return {frames:a.length,meanMs:a.reduce((n,v)=>n+v,0)/a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:Math.max(0,...a)}}
 result.startup.tasks=result.tasks;result.startup.metrics=startupMetrics(result.startup,c.events)
 result.webglMessages=c.events.filter(e=>e.method==='Log.entryAdded'&&/WebGL|texSub|INVALID/i.test(e.params.entry.text)).map(e=>e.params.entry)
 result.futureInterception=[...intercepted];result.futureResourceTransfers=await c.evaluate(`performance.getEntriesByType('resource').filter(e=>/mars-gallant|explosion-(piso|aire)|desierto-floor|invid-scout|invid-blood|invid-orbes|rand-rider|horizon-t/.test(e.name)).map(e=>({url:e.name,transferBytes:e.transferSize}))`)
 result.frameTimes={driving:summarize(result.frames.filter(f=>f.combat==='driving')),forestCombat:summarize(result.frames.filter(f=>f.combat==='forest')),scoutCombat:summarize(result.frames.filter(f=>f.combat==='scouts'))};result.mbps=mbps;result.origin=origin;result.initialCacheWarm=warm;result.futureCacheDisabled=coldStreaming
 fs.writeFileSync(directory+'/'+label+'-route-'+mbps+'mbps.json',JSON.stringify(result,null,2));fs.writeFileSync(directory+'/'+label+'-route-'+mbps+'mbps.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));console.log(JSON.stringify({...result,frames:undefined,tasks:undefined,queue:undefined,startup:{readyMs:result.startup.readyMs,metrics:result.startup.metrics}},null,2))
 assert.ok(result.completed,'Complete the real route and final battle');assert.deepEqual(result.errors,[]);assert.deepEqual(result.missed,[]);assert.equal(result.glError,0);assert.equal(result.shaderError,'');assert.ok(result.maxAirBoosts>=1);if(coldStreaming){assert.ok(intercepted.size>=10);assert.ok(result.futureResourceTransfers.every(e=>e.transferBytes>300),'Future resources really bypass cache')}
}finally{if(script)await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier}).catch(()=>{});await c.send('Fetch.disable').catch(()=>{});await c.send('Network.setCacheDisabled',{cacheDisabled:false}).catch(()=>{});await c.send('Page.navigate',{url:'about:blank'}).catch(()=>{});c.close()}
