import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
import {FOREST_ENDING} from '../src/world/forest/ForestEndingShot.js'

const armor=process.argv.includes('--armor'),c=await connect(),ev=code=>c.evaluate(code),dir=armor?'artifacts/forest-ending-armor':'artifacts/forest-ending',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=180){for(let i=0;i<seconds*10;i++){if(await ev(code).catch(()=>false))return;await wait(100)}throw Error('Timed out: '+code)}
async function capture(name){fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function prepare(){
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();w.updateClimax(2430,2485);r.resetAt(w.startAt(900));r.pendingDefeatRetry=true;r.paused=false;return true})()`)
 await until('!!__DESERT_SCOUTS__.climax&&__DESERT_SCOUTS__.sequence.phase==="battle"&&!__MOSPEADA__.runtime.pendingDefeatRetry')
 await ev(`(()=>{const r=__MOSPEADA__.runtime;r.paused=true;r.randEscape.protected=true;r.randEscape.health=4;window.__ENDING_QA__={wins:0,ends:0,frames:[],victory:[],audio:[],render:__ANIME__.effect.render,programsBefore:__ANIME__.renderer.info.programs.length};window.__ENDING_QA__.onWin=()=>__ENDING_QA__.wins++;window.__ENDING_QA__.onEnd=()=>__ENDING_QA__.ends++;window.addEventListener('level1-victory',__ENDING_QA__.onWin);window.addEventListener('level1-ending-complete',__ENDING_QA__.onEnd);return true})()`)
}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
 await until('!!window.__MOSPEADA__?.runtime.ending&&!!window.__MOSPEADA__?.runtime.scottInstance&&!document.querySelector("#entry-preloader")')
 await prepare()
 if(armor){
  await ev(`(()=>{const r=__MOSPEADA__.runtime,e=r.transformEntry;e.phase='complete';e.poseBlend=1;e.state=r.state;e.store.set({progress:1,phase:'complete',poseBlend:1,inspection:true});return true})()`)
  await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
  assert.ok(await ev('__MOSPEADA__.runtime.armorController.activate()'),'Enter the real Armor controller before the last kill')
  await ev('(()=>{const a=__MOSPEADA__.runtime.armorController;a.state.y+=12;a.state.height+=12;a.sync();return true})()')
  await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 }
 await ev(`(()=>{const r=__MOSPEADA__.runtime,p=r.desertPatrol,q=__ENDING_QA__;for(const s of p.scouts)for(let i=0;i<16;i++)s.receiveHit(1);q.actor=r.state;q.start=r.state.z;const e=__ANIME__.effect;e.render=function(...args){const result=q.render.apply(this,args),shot=r.ending,m=r.opening.music,a=m.tracks.victory;q.audio.push({phase:shot.phase,age:shot.age,opacity:shot.opacity,gain:m.victoryGain??0,volume:a.volume,time:a.currentTime,paused:a.paused});if(shot.phase==='victory')q.victory.push({age:shot.age,height:r.state.height,camera:__MOSPEADA__.camera.position.toArray(),quaternion:__MOSPEADA__.camera.quaternion.toArray(),landing:r.armorController.state?.groundLanding?.phase,grounded:r.armorController.state?.grounded,letters:document.querySelector('.ride-victory-overlay svg text')?.textContent||''});if(shot.composed)q.frames.push({age:shot.age,phase:shot.phase,z:r.state.z,randZ:r.randEscape.z,wheelie:r.state.wheelieAngle,quaternion:__MOSPEADA__.camera.quaternion.toArray(),distance:__MOSPEADA__.camera.position.x-r.state.x});return result};r.paused=false;return true})()`)
 await until('__FOREST_ENDING__.phase==="victory"&&__FOREST_ENDING__.age>.18',40)
 await ev('__MOSPEADA__.runtime.paused=true;true');await capture('00a-victory-band-entry');await ev('__MOSPEADA__.runtime.paused=false;true')
 await until('__FOREST_ENDING__.phase==="victory"&&__FOREST_ENDING__.age>1.15',40)
 const typing=await ev(`(()=>{const r=__MOSPEADA__.runtime,card=document.querySelector('.ride-victory-overlay'),letters=card.querySelector('svg text').textContent;r.paused=true;return{letters,band:card.style.getPropertyValue('--victory-bands'),panel:card.style.getPropertyValue('--victory-panel')}})()`)
 assert.ok(typing.letters.length>0&&typing.letters.length<8);await capture('00b-victory-typing');await ev('__MOSPEADA__.runtime.paused=false;true')
 await until('__FOREST_ENDING__.phase==="victory"&&__FOREST_ENDING__.age>2.5',40)
 const banner=await ev(`(()=>{const r=__MOSPEADA__.runtime,m=r.opening.music,a=m.tracks.victory,band=document.querySelector('.ride-victory-overlay .ride-defeat-band'),color=getComputedStyle(band,'::before');const result={text:document.querySelector('.ride-victory-overlay svg')?.getAttribute('aria-label'),bandColor:color.backgroundColor,blend:color.mixBlendMode,playing:!a.paused,source:a.currentSrc||a.src,volume:a.volume,base:m.volume};r.paused=true;return result})()`)
 assert.equal(banner.text,'VICTORIA');assert.equal(banner.blend,'normal');assert.ok(banner.playing);assert.ok(banner.source.includes('04-Robotech-Mission-Accomplished'));assert.equal(banner.volume,banner.base)
 await capture('00-victory-banner');await ev('__MOSPEADA__.runtime.paused=false;true')
 const shots=[]
 for(const [age,name]of [[.75,'01-profile-faces'],[3.8,'02-two-bikes'],[5.85,'03-scott-wheelie'],[7.35,'04-exited-right']]){
  await until(`__FOREST_ENDING__.phase==='ride'&&__FOREST_ENDING__.rideTime()>=${age*FOREST_ENDING.duration/9.2}`,40)
  await ev('__MOSPEADA__.runtime.paused=true;true');await capture(name)
  shots.push(await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,shot=r.ending,T=d.camera.position.constructor,a=new T(r.state.x,r.state.height+1,r.state.z).project(d.camera),b=new T(r.randEscape.x,r.randEscape.height+1,r.randEscape.z).project(d.camera);return{age:shot.age,wheelie:r.state.wheelieAngle,scottX:a.x,randX:b.x,distance:d.camera.position.x-r.state.x,opacity:shot.opacity,randHealth:r.randEscape.health}})()`))
  await ev('__MOSPEADA__.runtime.paused=false;true')
 }
 await until('__FOREST_ENDING__.phase==="black-hold"&&__FOREST_ENDING__.age>3.4',40)
 const blackHold=await ev(`(()=>{const r=__MOSPEADA__.runtime,m=r.opening.music;return{age:r.ending.age,opacity:r.ending.opacity,volume:m.tracks.victory.volume,playing:!m.tracks.victory.paused,completed:__ENDING_QA__.ends}})()`)
 assert.equal(blackHold.opacity,1);assert.equal(blackHold.volume,banner.base);assert.ok(blackHold.playing);assert.equal(blackHold.completed,0)
 await until('__FOREST_ENDING__.phase==="audio-out"&&__FOREST_ENDING__.age>.7',40)
 const audioOnBlack=await ev(`(()=>{const r=__MOSPEADA__.runtime,m=r.opening.music;const result={opacity:r.ending.opacity,volume:m.tracks.victory.volume,base:m.volume,completed:__ENDING_QA__.ends};r.paused=true;return result})()`)
 assert.equal(audioOnBlack.opacity,1);assert.ok(audioOnBlack.volume>0&&audioOnBlack.volume<audioOnBlack.base);assert.equal(audioOnBlack.completed,0)
 await capture('05-black-during-audio-fade');await ev('__MOSPEADA__.runtime.paused=false;true')
 await until('__FOREST_ENDING__.phase==="done"',40);await capture('06-final-black')
 const report=await ev(`(()=>{const q=__ENDING_QA__,r=__MOSPEADA__.runtime;return{wins:q.wins,ends:q.ends,phase:r.ending.phase,opacity:r.ending.opacity,paused:r.paused,sameState:r.state===q.actor,health:r.randEscape.health,hudHidden:getComputedStyle(document.querySelector('.driving-hud')).visibility,frames:q.frames.length,maxWheelie:Math.max(...q.frames.map(f=>f.wheelie)),fixedDirection:q.frames.every(f=>Math.abs(f.quaternion[1]-Math.SQRT1_2)<1e-6&&Math.abs(f.quaternion[3]-Math.SQRT1_2)<1e-6),programsBefore:q.programsBefore,programsAfter:__ANIME__.renderer.info.programs.length,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
 report.fromArmor=armor;report.mountedAtEnd=await ev('!__MOSPEADA__.runtime.armorController.active&&__MOSPEADA__.runtime.state.riderMode==="mounted"&&__MOSPEADA__.runtime.transformEntry.store.snapshot().progress===0')
 report.typing=typing;report.blackHold=blackHold;report.victory=await ev(`(()=>{const frames=__ENDING_QA__.victory,first=frames[0],last=frames.at(-1);return{frames:frames.length,firstHeight:first.height,lastHeight:last.height,cameraMoved:Math.max(...frames.map(f=>Math.hypot(...f.camera.map((v,i)=>v-first.camera[i])))),rotationChanged:Math.max(...frames.map(f=>Math.hypot(...f.quaternion.map((v,i)=>v-first.quaternion[i])))),landingPhases:[...new Set(frames.map(f=>f.landing).filter(Boolean))],landed:frames.some(f=>f.grounded)}})()`)
 assert.ok(report.victory.cameraMoved>2&&report.victory.rotationChanged>.5);if(armor){assert.ok(report.victory.firstHeight-report.victory.lastHeight>6);assert.ok(report.victory.landingPhases.includes('descend')&&report.victory.landed)}
 report.banner=banner;report.audioOnBlack=audioOnBlack;report.audio=await ev(`(()=>{const q=__ENDING_QA__,m=__MOSPEADA__.runtime.opening.music,a=m.tracks.victory,fade=q.audio.filter(s=>s.phase==='ride'&&s.age>7.7);return{fullVolumeThroughVisualFade:fade.length>0&&fade.every(s=>s.volume===m.volume&&s.gain===1),fadeOnlyOnBlack:q.audio.filter(s=>s.phase==='audio-out').every(s=>s.opacity===1),finalVolume:a.volume,finalPaused:a.paused,finalMusicPhase:m.phase}})()`)
 assert.ok(report.audio.fullVolumeThroughVisualFade&&report.audio.fadeOnlyOnBlack&&report.audio.finalPaused);assert.equal(report.audio.finalVolume,0);assert.equal(report.audio.finalMusicPhase,'complete')
 report.shots=shots;assert.equal(report.wins,1);assert.equal(report.ends,1);assert.equal(report.opacity,1);assert.ok(report.paused&&report.sameState&&report.fixedDirection&&report.mountedAtEnd);assert.equal(report.health,4);assert.equal(report.hudHidden,'hidden')
 assert.ok(report.maxWheelie>.7);assert.ok(shots[1].distance>shots[0].distance+4);assert.ok(shots[3].scottX>1.2&&shots[3].randX>1.2)
 assert.equal(report.gl,0);assert.equal(report.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{
 await ev(`(()=>{const q=window.__ENDING_QA__;if(q){__ANIME__.effect.render=q.render;window.removeEventListener('level1-victory',q.onWin);window.removeEventListener('level1-ending-complete',q.onEnd)}if(window.__MOSPEADA__)__MOSPEADA__.runtime.paused=true;return true})()`).catch(()=>{});c.close()
}
