import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/forest-opening'
async function status(){return c.evaluate(`(()=>{const o=window.__FOREST_OPENING__,d=window.__MOSPEADA__;return{phase:o?.phase,active:o?.active,elapsed:o?.elapsed,audio:o?.audio?{time:o.audio.currentTime,paused:o.audio.paused,failed:o.audioFailed||false}:null,pose:d?{x:d.runtime.state.x,z:d.runtime.state.z,yaw:d.runtime.state.yaw,speed:d.runtime.state.speed,transform:d.runtime.transformEntry?.phase}:null,camera:d?.camera.position.toArray(),error:window.__ANIME__?.state.snapshot().error}})()`)}
async function shot(name){fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
  const origin=await c.evaluate('performance.timeOrigin'),url=new URL(await c.evaluate('location.href'));url.searchParams.delete('intro');await c.send('Page.navigate',{url:url.href})
  for(let i=0;i<100;i++){if(await c.evaluate(`performance.timeOrigin!==${origin}`))break;await wait(50)}
  c.events.length=0
  let s
  for(let i=0;i<240;i++){s=await status();if(s.error)throw Error(s.error);if(['blocked','lead','playing','done'].includes(s.phase))break;if(i===239)throw Error('Opening did not become ready');await wait(200)}
  const initial=s.pose;assert.ok(s.active,'Fresh anonymous profile shows the intro')
  if(s.phase==='blocked'){
    await shot('00-enter')
    const box=await c.evaluate(`(()=>{const b=document.querySelector('.forest-opening-start').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`)
    await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box})
  }
  const frames=[],captured=new Set();let previousMotion=null,minHandoffSpeed=Infinity
  for(let i=0;i<280;i++){
    s=await status();assert.equal(s.error,'')
    if(s.phase==='lead'&&s.audio.time>.5&&!captured.has('lead')){captured.add('lead');assert.ok(await c.evaluate(`Number(getComputedStyle(document.querySelector('.forest-opening-veil')).opacity)>=.999`));assert.equal(s.audio.paused,false);await shot('01-music-before-fade');frames.push(s)}
    if(s.phase==='playing'){
      if(s.elapsed>=8&&s.elapsed<=11.5){
        if(previousMotion&&s.elapsed>previousMotion.elapsed){const speed=Math.hypot(...s.camera.map((v,i)=>v-previousMotion.camera[i]))/(s.elapsed-previousMotion.elapsed);minHandoffSpeed=Math.min(minHandoffSpeed,speed);assert.ok(speed>.25,'Camera must keep moving through the former pause')}
        previousMotion=s
      }
      for(const [name,t]of [['02-front',1.8],['03-orbit',5.6],['04-handoff',11.8]])if(s.elapsed>=t&&!captured.has(name)){captured.add(name);await shot(name);frames.push(s)}
      if(!captured.has('input')){captured.add('input');for(const code of ['KeyW','KeyT']){await c.send('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='KeyW'?'w':'t'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='KeyW'?'w':'t'})}}
    }
    assert.equal(s.pose.x,initial.x);assert.equal(s.pose.z,initial.z);assert.equal(s.pose.yaw,initial.yaw);assert.equal(s.pose.speed,0);assert.equal(s.pose.transform,'idle')
    if(s.phase==='done')break
    if(i===279)throw Error('Opening did not finish')
    await wait(100)
  }
  await shot('05-gameplay')
  const end=await c.evaluate(`({mode:__MOSPEADA__.runtime.cameraMode,holding:__FOREST_OPENING__.holding,orbit:__MOSPEADA__.runtime.orbit.enabled,overlay:!!document.querySelector('.forest-opening'),gl:__ANIME__.renderer.getContext().getError()})`)
  assert.equal(end.mode,0);assert.equal(end.holding,false);assert.equal(end.orbit,true);assert.equal(end.overlay,false);assert.equal(end.gl,0)
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'});await wait(450);await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'});assert.ok((await status()).pose.speed>0)
  await c.evaluate(`__MOSPEADA__.reset('forest');true`)
  const previous=await c.evaluate('performance.timeOrigin');await c.send('Page.reload',{ignoreCache:false})
  for(let i=0;i<100;i++){if(await c.evaluate(`performance.timeOrigin!==${previous}&&!!document.querySelector('.app')`))break;await wait(50)}
  assert.equal(await c.evaluate(`document.querySelector('.app')?.dataset.forestOpening`),'active')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);assert.deepEqual(errors,[])
  fs.writeFileSync(dir+'/validation.json',JSON.stringify({initial,frames,end,minHandoffSpeed,replaysOnRefresh:true,errors},null,2));console.log({frames:frames.map(f=>({phase:f.phase,elapsed:f.elapsed,audio:f.audio?.time,camera:f.camera})),end,minHandoffSpeed,replaysOnRefresh:true,errors})
}finally{c.close()}
