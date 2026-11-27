import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'

const c=await connect(),report={samples:{}},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),requests=[]
await c.send('Network.enable')
const removeListener=c.onEvent(event=>{if(event.method==='Network.requestWillBeSent'&&/\/engine\/.*\.mp3/.test(event.params.request.url))requests.push(event.params.request.url)})
async function until(expression,message,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error(message)}
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='ShiftLeft'?'Shift':code.slice(3).toLowerCase()})
async function tap(code){await key(code,true);await key(code,false)}
async function sample(name){report.samples[name]=await c.evaluate(`(()=>{const e=__CYCLONE_ENGINE_AUDIO__,a=__SFX__,s=e.loop;return{...e.model.output,speed:__MOSPEADA__.runtime.state.speed,rate:s.playbackRate.value,gain:a.voiceGains.get(s).gain.value,frequency:a.voiceFilters.get(s).frequency.value,sameSource:s===__DYNAMIC_ENGINE_QA__.source,loopVoices:[...a.voices].filter(v=>v.buffer===s.buffer).length}})()`);assert.ok(report.samples[name].sameSource);assert.equal(report.samples[name].loopVoices,1);return report.samples[name]}
async function clickButton(label){const point=await c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point})}
try{
  await until("!!window.__CYCLONE_ENGINE_AUDIO__&&!document.querySelector('#entry-preloader')",'Gameplay did not prepare',180000)
  await c.evaluate('window.__FOREST_OPENING__?.finish();__MOSPEADA__.reset();true')
  await tap('KeyV');await until('!!__CYCLONE_ENGINE_AUDIO__.loop','Audio gesture did not unlock the engine')
  await c.evaluate(`(()=>{const a=__SFX__;window.__DYNAMIC_ENGINE_QA__={source:__CYCLONE_ENGINE_AUDIO__.loop,starts:1,play:a.play};a.play=function(name,options){if(name==='cycloneEngineLoop')__DYNAMIC_ENGINE_QA__.starts++;return __DYNAMIC_ENGINE_QA__.play.call(this,name,options)};return true})()`)
  const initialRequests=requests.length
  await wait(200);const idle=await sample('idle')
  await key('KeyW',true);await until('__CYCLONE_ENGINE_AUDIO__.model.output.throttle===1','Engine did not read throttle');const first=await sample('throttleImmediate')
  await wait(1000);const accelerating=await sample('accelerating')
  assert.ok(first.playbackRate>idle.playbackRate&&first.gain>idle.gain&&first.frequency>idle.frequency)
  assert.ok(accelerating.playbackRate>first.playbackRate)
  await c.evaluate('__MOSPEADA__.runtime.state.speed=59.6;__MOSPEADA__.runtime.state.acceleration=0;true')
  await until('__CYCLONE_ENGINE_AUDIO__.model.output.normalizedRpm>.98&&Math.abs(__MOSPEADA__.runtime.state.acceleration)<.25','Cruise did not stabilize');const cruise=await sample('cruise')
  await key('KeyW',false);await until('__CYCLONE_ENGINE_AUDIO__.model.output.throttle===0','Engine did not read throttle release');await wait(80);const released=await sample('released')
  assert.ok(released.gain<cruise.gain);assert.ok(released.normalizedRpm>cruise.normalizedRpm*.85)
  await key('KeyS',true);await wait(400);const braking=await sample('braking');await key('KeyS',false)
  assert.ok(braking.normalizedRpm<released.normalizedRpm)
  await key('KeyW',true);await wait(350);await key('ShiftLeft',true);await wait(100)
  const boosted=await sample('boost');assert.equal(boosted.boost,1)
  report.turbine=await c.evaluate(`(()=>{const {buffers,voices}=__SFX__;const buffer=[...buffers].find(([url])=>url.includes('/boost/boost.mp3'))[1];return [...voices].some(source=>source.buffer===buffer&&source.playbackRate.value===1)})()`)
  assert.ok(report.turbine);await key('ShiftLeft',false);await key('KeyW',false)
  await tap('KeyP');await until("document.querySelector('.ride-pause-ui')?.hidden===false",'Pause UI did not appear')
  await wait(200);assert.ok((await sample('pause')).gain<.01)
  await clickButton('Ajustes');await until("!!document.querySelector('.ride-settings')",'Settings missing')
  await clickButton('Sonido');await until("!!document.querySelector('[aria-label=\"Pitch máximo\"]')",'Engine calibration controls missing')
  await clickButton('Continuar y calibrar')
  await until("!__MOSPEADA__.runtime.paused&&document.querySelector('.ride-settings')?.getBoundingClientRect().height>100",'Calibration panel did not stay open while driving')
  await key('KeyW',true)
  const point=await c.evaluate(`(()=>{const input=document.querySelector('[aria-label="Pitch máximo"]');input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return{x:r.x+r.width*.8,y:r.y+r.height/2}})()`)
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point})
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point})
  await wait(300)
  report.liveControls=await c.evaluate(`(async()=>({paused:__MOSPEADA__.runtime.paused,throttle:__MOSPEADA__.runtime.input.throttle,pitchMax:(await import('/src/audio/engineAudioState.js')).engineAudioState.snapshot().pitchMax,source:__CYCLONE_ENGINE_AUDIO__.loop===__DYNAMIC_ENGINE_QA__.source,focused:document.activeElement.tagName}))()`)
  assert.equal(report.liveControls.paused,false);assert.equal(report.liveControls.throttle,1);assert.ok(report.liveControls.pitchMax>1.9);assert.ok(report.liveControls.source);assert.notEqual(report.liveControls.focused,'INPUT')
  fs.mkdirSync('artifacts/dynamic-engine',{recursive:true});fs.writeFileSync('artifacts/dynamic-engine/live-calibration.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await key('KeyW',false);await key('KeyW',true);await wait(100);assert.equal(await c.evaluate('__MOSPEADA__.runtime.input.throttle'),1)
  await clickButton('Restaurar motor');await clickButton('×')
  await tap('KeyT');await until("__MOSPEADA__.runtime.transformEntry.phase!=='idle'",'Native transformation did not start')
  await wait(800);assert.ok((await sample('transformationFade')).gain<.01)
  await key('KeyW',false);await c.evaluate('__MOSPEADA__.reset();true');await wait(200);await sample('checkpoint')
  report.starts=await c.evaluate('__DYNAMIC_ENGINE_QA__.starts');assert.equal(report.starts,1)
  report.engineFiles=await c.evaluate("[...__SFX__.buffers.keys()].filter(url=>url.includes('/engine/')&&!url.includes('/terrain-'))")
  assert.equal(report.engineFiles.length,1);assert.match(report.engineFiles[0],/02-engine-loop1.mp3$/)
  report.newRequests=requests.length-initialRequests;assert.equal(report.newRequests,0)
  report.errors=c.events.filter(event=>event.method==='Runtime.exceptionThrown').map(event=>event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
  fs.mkdirSync('artifacts/dynamic-engine',{recursive:true});fs.writeFileSync('artifacts/dynamic-engine/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
  for(const code of ['KeyW','KeyS','ShiftLeft'])await key(code,false).catch(()=>{})
  await c.evaluate("if(window.__DYNAMIC_ENGINE_QA__){__SFX__.play=__DYNAMIC_ENGINE_QA__.play;delete window.__DYNAMIC_ENGINE_QA__};(async()=>{(await import('/src/audio/engineAudioState.js')).engineAudioState.reset()})();true").catch(()=>{})
  removeListener();c.close()
}
