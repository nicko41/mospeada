import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/armor-evasion',wait=ms=>new Promise(r=>setTimeout(r,ms)),ev=code=>c.evaluate(code),report={}
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=40){for(let i=0;i<seconds*20;i++){if(await ev(code))return;await wait(50)}throw Error('Timed out: '+code)}
const key=(code,type='keyDown')=>c.send('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code.startsWith('Shift')?'Shift':code})
const mouse=(button,type,buttons)=>c.send('Input.dispatchMouseEvent',{type,x:720,y:430,button,buttons,clickCount:1})
const snapshot=()=>ev(`(()=>{const r=__MOSPEADA__.runtime,a=r.armorController.state;return{mode:a.mode,height:a.height,y:a.y,vy:a.vy,speed:a.speed,x:a.x,z:a.z,boost:a.boosting,jump:a.jump?.phase||null,stance:a.jump?.stance,legs:r.scottInstance.armorLanding.diagnostics,aim:r.gallant.aiming,blend:r.scottInstance.armorGallantPose.aimBlend,shots:r.gallant.shots}})()`)
async function elapsed(seconds){await ev('window.__ARMOR_EVASION_QA__.time=__MOSPEADA__.runtime.armorController.state.time;true');await until(`__MOSPEADA__.runtime.armorController.state.time-__ARMOR_EVASION_QA__.time>=${seconds}`)}
async function capture(name){fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
try{
 await until('!!window.__MOSPEADA__?.runtime.gallant&&!!window.__FOREST_STAGE4__&&!document.querySelector("#entry-preloader")',180)
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();w.updateClimax(2430,2485);d.runtime.resetAt(w.startAt(900));d.runtime.pendingDefeatRetry=true;d.runtime.paused=false;d.runtime.keys={};return true})()`)
 await until('window.__DESERT_SCOUTS__?.climax?.scouts.length===15&&!__MOSPEADA__.runtime.pendingDefeatRetry&&__MOSPEADA__.runtime.climaxSequence.phase==="battle"')
 await ev(`(()=>{const r=__MOSPEADA__.runtime,p=r.desertPatrol,q=window.__ARMOR_EVASION_QA__={p,oldUpdate:p.update,oldSync:r.gallant.aimInput.sync};p.update=()=>{};for(const s of p.scouts)s.view.root.visible=false;r.randEscape.protected=true;r.state.speed=18;r.state.parked=false;r.state.idleBlend=0;r.keys={};r.gallant.aimInput.sync=function(...args){const result=q.oldSync.apply(this,args);if(r.armorController?.active&&!q.firstArmor)q.firstArmor={held:this.held,aiming:result,phase:r.transformEntry.phase};return result};return true})()`)
 await key('KeyT');await key('KeyT','keyUp')
 await until('__MOSPEADA__.runtime.transformEntry.phase!=="idle"&&__MOSPEADA__.runtime.transformEntry.phase!=="complete"')
 await mouse('right','mousePressed',2)
 await until('__MOSPEADA__.runtime.armorController.active',60)
 await until('__MOSPEADA__.runtime.scottInstance.armorGallantPose?.aimBlend>.99')
 report.transform=await ev('__ARMOR_EVASION_QA__.firstArmor');assert.ok(report.transform.held&&report.transform.aiming)
 await elapsed(2)
 await key('KeyG');await key('KeyG','keyUp')
 await until('__MOSPEADA__.runtime.armorController.state.mode==="ARMOR_GROUND"&&!__MOSPEADA__.runtime.armorController.state.groundLanding')
 await key('KeyW');await mouse('left','mousePressed',3);await elapsed(.7)
 report.walk=await snapshot();assert.ok(report.walk.aim&&report.walk.speed>2&&report.walk.shots>0)
 await key('ShiftLeft');await elapsed(.7)
 report.run=await snapshot();assert.ok(report.run.speed>10&&report.run.shots>report.walk.shots)
 await capture('01-running-and-firing')
 await key('Space');await until('__MOSPEADA__.runtime.armorController.state.jump?.elapsed>.25')
 await key('Space','keyUp');report.jumpStart=await snapshot();assert.ok(report.jumpStart.aim&&report.jumpStart.height>3)
 report.directions=[]
 await key('KeyW','keyUp')
 for(const code of ['KeyA','KeyD','KeyS','KeyW']){
  await key(code);await elapsed(.3)
  const s=await snapshot();report.directions.push({code,...s});assert.ok(s.jump&&s.boost&&s.aim&&s.blend>.99&&s.legs.pose==='strafe')
  await capture(`02-air-${code}`);await key(code,'keyUp')
 }
 assert.ok(report.directions.at(-1).shots>report.jumpStart.shots,'Native firing continues during changing airborne thrust')
 await key('ShiftLeft','keyUp');await mouse('left','mouseReleased',2)
 await until('!__MOSPEADA__.runtime.armorController.state.jump',45)
 report.groundReturn=await snapshot();assert.equal(report.groundReturn.mode,'ARMOR_GROUND');assert.ok(report.groundReturn.height<.2)
 await key('KeyG');await key('KeyG','keyUp');await elapsed(2)
 await key('Space');await until('__MOSPEADA__.runtime.armorController.state.jump?.elapsed>.75')
 await key('Space','keyUp');report.heldJump=await snapshot();assert.ok(report.heldJump.height>18)
 await until('!__MOSPEADA__.runtime.armorController.state.jump',45)
 report.hoverReturn=await snapshot();assert.equal(report.hoverReturn.mode,'ARMOR_HOVER');assert.ok(Math.abs(report.hoverReturn.height-.8)<.12)
 await key('Space');await key('Space','keyUp');await until('__MOSPEADA__.runtime.armorController.state.jump?.launched');await elapsed(1)
 report.tapJump=await snapshot();assert.ok(report.tapJump.height>7&&report.tapJump.height<report.heldJump.height)
 await capture('03-vertical-strafe-toes-down')
 await until('!__MOSPEADA__.runtime.armorController.state.jump',45)
 report.gl=await ev('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{
 for(const code of ['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft'])await key(code,'keyUp').catch(()=>{})
 for(const button of ['left','right'])await mouse(button,'mouseReleased',0).catch(()=>{})
 await ev('if(window.__ARMOR_EVASION_QA__){const q=__ARMOR_EVASION_QA__,r=__MOSPEADA__.runtime;q.p.update=q.oldUpdate;r.gallant.aimInput.sync=q.oldSync;r.paused=true};true').catch(()=>{})
 c.close()
}
