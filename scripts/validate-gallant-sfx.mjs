import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
import {PLAYER_INITIAL_AUDIO_URLS,GALLANT_SHOT_URLS} from '../src/audio/gameAudio.js'

// Use a dedicated Chrome with remote debugging on 9333 and the dev server on
// 5173. Input is dispatched through Chrome, not directly to weapon handlers.
const c=await connect(),dir='artifacts/gallant-sfx',report={}
const requests=[]
await c.send('Network.enable')
const removeNetworkListener=c.onEvent(event=>{if(event.method==='Network.requestWillBeSent'&&/gallant-shot-(?:default|alt).*mp3/.test(event.params.request.url))requests.push(event.params.request.url)})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(expression,message,timeout=180000){
  const deadline=Date.now()+timeout
  while(Date.now()<deadline){if(await c.evaluate(expression))return;await wait(200)}
  throw Error(message)
}
const mouse=(type,button,buttons)=>c.send('Input.dispatchMouseEvent',{type,button,buttons,x:640,y:400,clickCount:1})
async function release(){await mouse('mouseReleased','left',2);await mouse('mouseReleased','right',0)}
async function burst(name){
  const before=await c.evaluate('__MOSPEADA__.runtime.gallant.shots')
  await mouse('mousePressed','right',2);await mouse('mousePressed','left',3)
  await until(`__MOSPEADA__.runtime.gallant.shots>=${before+6}`,`No effective shots in ${name}`,20000)
  await release()
  report[name]=await c.evaluate(`({shots:__MOSPEADA__.runtime.gallant.shots-${before},mounted:__MOSPEADA__.runtime.gallant.mounted})`)
}
try{
  await until("!!window.__MOSPEADA__?.runtime.gallant&&!document.querySelector('#entry-preloader')",'Gameplay preparation timed out')
  report.prepared=await c.evaluate(`(()=>{const a=__SFX__;return{buffers:a.buffers.size,pending:a.pending.size,files:[...a.buffers].map(([url,b])=>({url,duration:b.duration,channels:b.numberOfChannels,sampleRate:b.sampleRate})),requests:performance.getEntriesByType('resource').filter(e=>/gallant-shot-(?:default|alt).*mp3/.test(e.name)).length}})()`)
  assert.ok(report.prepared.buffers>=PLAYER_INITIAL_AUDIO_URLS.length+GALLANT_SHOT_URLS.length);assert.ok(report.prepared.requests<=GALLANT_SHOT_URLS.length)
  const initialRequests=requests.length
  assert.ok(report.prepared.files.every(file=>file.duration>0))
  await c.evaluate(`(async()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime;if(r.armorController.active||r.transformEntry.phase!=='idle')__MOSPEADA__.reset();r.paused=false;r.keys={};await __SFX__.audioContext.suspend();return true})()`)
  await until('__MOSPEADA__.runtime.gallant.mounted','Mounted combat did not resume',5000)
  assert.equal(await c.evaluate('__SFX__.audioContext.state'),'suspended')
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',windowsVirtualKeyCode:86})
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',windowsVirtualKeyCode:86})
  await until("__SFX__.audioContext.state==='running'",'Gesture did not unlock the context',5000)
  report.unlocked=true
  await c.evaluate(`(()=>{const a=__SFX__,r=__MOSPEADA__.runtime,buffers=new Set([...a.buffers].filter(([url])=>/gallant-shot/.test(url)).map(([,buffer])=>buffer));window.__SFX_QA__={calls:[],maxVoices:0,original:a.play,initialShots:r.gallant.shots};a.play=function(name,options){const voice=__SFX_QA__.original.call(this,name,options);if(name==='gallantShot'){__SFX_QA__.calls.push({name,shot:r.gallant.shots,played:!!voice,rate:voice?.playbackRate.value,detune:voice?.detune.value});__SFX_QA__.maxVoices=Math.max(__SFX_QA__.maxVoices,[...this.voices].filter(source=>buffers.has(source.buffer)).length)}return voice};return true})()`)
  // LMB on the bike without aiming is intentionally not an effective shot.
  const noAim=await c.evaluate('__MOSPEADA__.runtime.gallant.shots')
  await mouse('mousePressed','left',1);await wait(700);await release()
  assert.equal(await c.evaluate('__MOSPEADA__.runtime.gallant.shots'),noAim)
  assert.equal(await c.evaluate('__SFX_QA__.calls.length'),0)
  await burst('cyclone')
  assert.equal(report.cyclone.mounted,true)
  if(await c.evaluate('!!__MOSPEADA__.runtime.stage3?.encounter')){
    await c.evaluate(`(()=>{const e=__MOSPEADA__.runtime.stage3.encounter;e.phase='active';e.phaseTime=0;e.fireCooldown=0;return true})()`)
    await burst('encounter')
    await c.evaluate("__MOSPEADA__.runtime.stage3.encounter.reset();true")
  }
  // Seek the existing transformation's inspection state, then let native
  // gameplay activate Armor on its next frame (no weapon rules overridden).
  await c.evaluate(`(()=>{const d=__MOSPEADA__,e=d.runtime.transformEntry;d.runtime.paused=true;e.phase='complete';e.poseBlend=1;__FRONT_BATTLOID__.store.seek(1);d.runtime.paused=false;return true})()`)
  await until('__MOSPEADA__.runtime.armorController.active&&!__MOSPEADA__.runtime.gallant.mounted','Armor activation timed out',10000)
  await burst('armor')
  assert.equal(report.armor.mounted,false)
  report.playback=await c.evaluate(`({shots:__MOSPEADA__.runtime.gallant.shots-__SFX_QA__.initialShots,calls:__SFX_QA__.calls,maxVoices:__SFX_QA__.maxVoices,requests:performance.getEntriesByType('resource').filter(e=>/gallant-shot-(?:default|alt).*mp3/.test(e.name)).length,buffers:__SFX__.buffers.size})`)
  assert.equal(report.playback.shots,report.playback.calls.length)
  assert.ok(report.playback.calls.every((call,i,array)=>call.played&&call.rate===1&&call.detune===0&&(i===0||call.shot===array[i-1].shot+1)))
  report.playback.newRequests=requests.length-initialRequests
  assert.ok(report.playback.maxVoices>1);assert.equal(report.playback.newRequests,0);assert.ok(report.playback.buffers>=PLAYER_INITIAL_AUDIO_URLS.length+GALLANT_SHOT_URLS.length)
  await c.evaluate("__MOSPEADA__.runtime.paused=false;window.dispatchEvent(new CustomEvent('ride-command',{detail:{pause:true}}));true")
  await until("document.querySelector('.ride-pause-ui')?.hidden===false",'Pause UI did not update',5000)
  await c.evaluate("if(!document.querySelector('.ride-settings'))[...document.querySelectorAll('.ride-actions button')].find(b=>b.textContent==='Ajustes').click();true")
  await until("!!document.querySelector('.ride-settings')",'Settings did not open',5000)
  await c.evaluate("[...document.querySelectorAll('.ride-settings-tabs button')].find(b=>b.textContent==='Sonido').click();true")
  await until("!!document.querySelector('[aria-label=\"Volumen de disparos gallant\"]')",'Sound controls did not open',5000)
  report.controls=await c.evaluate(`({sfx:document.querySelector('[aria-label="Volumen de efectos de sonido"]')?.value,gallant:document.querySelector('[aria-label="Volumen de disparos gallant"]')?.value})`)
  assert.equal(report.controls.sfx,'1');assert.equal(report.controls.gallant,'0.35')
  await c.closeSettings()
  report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  assert.deepEqual(report.errors,[])
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}finally{
  await release().catch(()=>{})
  await c.evaluate('if(window.__SFX_QA__){__SFX__.play=__SFX_QA__.original;delete window.__SFX_QA__};true').catch(()=>{})
  removeNetworkListener()
  c.close()
}
