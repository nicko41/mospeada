import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/ground-landing',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expr,ms=180000){const end=Date.now()+ms;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(70)}throw Error('Timeout: '+expr)}
async function press(code,key){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code,key})}
async function checkpoint(reason,phase,time=0){
  await c.evaluate(`new Promise(resolve=>{const r=__MOSPEADA__.runtime;const tick=()=>{const l=r.armorController.state.groundLanding;if(${phase==='complete'?'!l':`l?.phase===${JSON.stringify(phase)}&&l.time>=${time}`}){r.paused=true;resolve()}else requestAnimationFrame(tick)};r.paused=false;requestAnimationFrame(tick)})`)
  const row=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,i=r.scottInstance,a=r.armorController.state,l=i.armorArticulation;return{name:${JSON.stringify(reason+'-'+phase)},mode:a.mode,landing:a.groundLanding?{...a.groundLanding}:null,y:a.y,vy:a.vy,body:i.armorLanding.diagnostics,knees:l.diagnostics.legs.map(x=>x.error),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.equal(row.gl,0);assert.equal(row.shader,'');assert.ok(row.knees.every(x=>x<1e-6));rows.push(row);console.log(JSON.stringify(row))
  fs.writeFileSync(`${dir}/${row.name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")',300000)
  await c.evaluate('__ANIME__.renderer.getContext().getError()')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.reset("highway");Object.assign(__MOSPEADA__.runtime.state,{speed:22,idleBlend:0,parked:false});true')
  await press('KeyT','t');await until('__MOSPEADA__.runtime.armorController.active')
  for(const reason of ['G','Ctrl']){
    await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,a=r.armorController,s=a.state,g=a.sample(50,-250);r.paused=true;Object.assign(s,{mode:'ARMOR_HOVER',x:50,z:-250,y:g-s.soleOffset+${reason==='G'?'.8':'5'},height:${reason==='G'?'.8':'5'},yaw:0,vx:0,vz:0,vy:${reason==='G'?'0':'6'},speed:0,descendHeld:false,jumpHeld:false,groundLanding:null,jump:${reason==='G'?'null':"{phase:'powered',originY:g,ceilingY:g+12,elapsed:.25}"}});a.camera.yaw=1.05;a.sync()})()`)
    await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    if(reason==='G')await press('KeyG','g')
    else await c.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ControlLeft',key:'Control'})
    // The accelerated Ctrl preparation can fit inside one slow render frame.
    for(const phase of reason==='G'?['prepare','descend','impact','recover','complete']:['descend','impact','recover','complete']){
      await checkpoint(reason,phase,phase==='prepare'?.03:0)
      if(reason==='Ctrl'&&phase==='descend')await c.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ControlLeft',key:'Control'})
    }
    assert.equal(rows.at(-1).mode,'ARMOR_GROUND')
  }
  assert.equal(c.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0)
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({pass:true,rows},null,2)+'\n')
}finally{await Promise.race([c.send('Browser.close').catch(()=>{}),wait(10000)]);c.close()}
