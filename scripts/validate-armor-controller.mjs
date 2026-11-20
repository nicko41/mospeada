import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/armor-controller',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expr,ms=180000){const end=Date.now()+ms;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(80)}throw Error('Milestone timeout: '+expr)}
const keys={KeyT:'t',KeyG:'g',KeyW:'w',KeyS:'s',KeyA:'a',KeyD:'d',ShiftLeft:'Shift',Space:' ',ControlLeft:'Control'}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:keys[code]})}
async function press(code){await key(code,true);await key(code,false)}
const pause=()=>c.evaluate('__MOSPEADA__.runtime.paused=true;true'),resume=()=>c.evaluate('__MOSPEADA__.runtime.paused=false;true')
const frames=()=>c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
async function sim(seconds){const t=await c.evaluate('__MOSPEADA__.runtime.armorController.state.time');await until(`__MOSPEADA__.runtime.armorController.state.time>=${t+seconds}`)}
async function release(){for(const k of ['KeyW','KeyS','KeyA','KeyD','ShiftLeft','Space','ControlLeft'])await key(k,false)}
async function capture(name){
  await pause();await frames()
  const row=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,a=r.armorController,i=__SCOTT_ORIGINAL__.instance,l=i.armorArticulation,e=__MOSPEADA_VFX__.armorBoost,err=(a,b)=>Math.max(...a.elements.map((n,j)=>Math.abs(n-b.elements[j]))),sun=__ANIME__.renderer;return{name:${JSON.stringify(name)},active:a.active,state:{...a.state},source:i.armorLocomotion?.source,clip:i.clip,body:i.armorReaction.diagnostics,arms:i.armorArms?.diagnostics,landing:{compression:i.armorLanding.weight,flat:i.armorLanding.flatWeight},torsoError:Math.max(...l.torsoBindings.map(b=>err(b.mesh.matrixWorld,l.spine.matrixWorld.clone().multiply(b.inBone)))),knees:l.diagnostics.legs,main:e.level,lifts:e.liftRecords.map(x=>x.level),gl:sun.getContext().getError(),shadow:{enabled:sun.shadowMap.enabled,map:!!__ANIME__.scene.getObjectByName('Character_sun_shadow')?.shadow?.map}}})()`)
  assert.equal(row.gl,0);assert.ok(row.shadow.enabled&&row.shadow.map);if(row.active){assert.ok(row.torsoError<1e-6);assert.ok(row.knees.every(k=>k.error<1e-6))}
  rows.push(row);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(rows,null,2)+'\n');console.log(name);return row
}
async function park(mode='ARMOR_HOVER'){
  await release();await pause()
  await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,a=r.armorController,s=a.state,g=a.sample(50,-250);Object.assign(s,{x:50,z:-250,y:g-s.soleOffset+${mode==='ARMOR_HOVER'?'.8':'.025'},ground:g,groundSmooth:g,yaw:0,vx:0,vy:0,vz:0,speed:0,ax:0,ay:0,az:0,mode:${JSON.stringify(mode)},groundTurn:null,jump:null,jumpHeld:false,boostBlend:0,boostRelease:10,settle:0});a.camera.yaw=0;a.sync()})()`)
  await resume();await sim(1.3)
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")',300000)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.reset("rough");__MOSPEADA__.runtime.state.speed=22;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.state.parked=false;true')
  await press('KeyT');await until('__MOSPEADA__.runtime.armorController.active');await sim(2.5)
  await park('ARMOR_GROUND');const idle=await capture('ground-idle-flat-feet')
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:400});await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:400})
  await resume();await sim(1);const looked=await capture('ground-free-camera');assert.ok(Math.abs(looked.state.yaw-idle.state.yaw)<1e-8);assert.ok(looked.landing.flat>.99)
  await key('KeyW',true);await resume();await until('!!__MOSPEADA__.runtime.armorController.state.groundTurn')
  const right=await capture('ground-turn-right');assert.equal(right.source,'Walk_Turn_Right_Idle_Style')
  await resume();await sim(1);const walk=await capture('native-walk');assert.equal(walk.source,'walking_2_inplace')
  await key('ShiftLeft',true);await resume();await sim(1);const run=await capture('native-run');assert.equal(run.source,'Running');await release()
  await resume();await sim(2.5);await pause();await c.evaluate('__MOSPEADA__.runtime.armorController.camera.yaw=__MOSPEADA__.runtime.armorController.state.yaw+1.1;true')
  await key('KeyW',true);await resume();await until('!!__MOSPEADA__.runtime.armorController.state.groundTurn');const left=await capture('ground-turn-left');assert.equal(left.source,'Walk_Turn_Left');await release()
  for(const [code,x,z]of [['KeyW',0,1],['KeyS',0,-1],['KeyA',1,0],['KeyD',-1,0]]){
    await park();await key(code,true);await key('ShiftLeft',true);await sim(1.1);const r=await capture('boost-'+code)
    assert.ok(r.state.vx*x+r.state.vz*z>28);assert.ok(r.state.speed<=32.001)
    if(code==='KeyW'){assert.ok(r.main>.8&&r.body.lean>.10)}
    else{assert.equal(r.main,0);assert.ok(r.lifts.every(n=>n>.8))}
    if(code==='KeyS')assert.ok(r.body.lean<-.1&&r.body.reverse>.5)
    if(code==='KeyA')assert.ok(r.body.bank>.10&&r.body.leftFlex>.20&&r.body.rightFlex===0&&r.arms.sway<-.08)
    if(code==='KeyD')assert.ok(r.body.bank<-.10&&r.body.rightFlex>.25&&r.body.leftFlex===0&&r.arms.sway>.08)
  }
  await park();await key('ShiftLeft',true);await sim(1);const alone=await capture('shift-alone');assert.equal(alone.state.speed,0);assert.equal(alone.main,0)
  await park();await key('KeyW',true);await key('KeyD',true);await key('ShiftLeft',true);await sim(1.1);const diagonal=await capture('boost-diagonal');assert.ok(diagonal.state.speed<=32.001&&diagonal.state.speed>30)
  await park();await c.evaluate(`(()=>{const a=__MOSPEADA__.runtime.armorController;window.__armorJumpQA={count:a.state.jumpCount,origin:a.state.y,peak:a.state.y,fall:false,phases:[]};const tick=()=>{const q=window.__armorJumpQA,s=a.state;if(!q)return;q.peak=Math.max(q.peak,s.y);q.fall||=s.vy< -1;if(s.jump&&!q.phases.includes(s.jump.phase))q.phases.push(s.jump.phase);requestAnimationFrame(tick)};requestAnimationFrame(tick)})()`)
  await key('Space',true);await key('ShiftLeft',true);await key('KeyD',true);await sim(.5);await capture('jump-directional-boost');await key('ShiftLeft',false);await key('KeyD',false)
  await resume();await sim(15);const held=await capture('held-space-landed'),stats=await c.evaluate('window.__armorJumpQA')
  assert.ok(stats.peak-stats.origin>8&&stats.peak-stats.origin<=12.05&&stats.fall);assert.equal(held.state.jumpCount,stats.count+1);assert.equal(held.state.jump,null);assert.ok(Math.abs(held.state.height-.8)<.15)
  await key('Space',false);await resume();await sim(.1);await key('Space',true);await sim(.7);const tucked=await capture('jump-knees-and-arms');assert.ok(tucked.body.tuck>.3&&tucked.arms.lift>.35)
  await key('ControlLeft',true);await resume();await sim(.3);const dive=await capture('ctrl-fast-dive-arms');assert.ok(dive.state.vy< -14&&dive.arms.lift>.55);await release();await resume();await until('__MOSPEADA__.runtime.armorController.state.jump===null');
  await park('ARMOR_GROUND');await key('Space',true);await sim(.45);const hop=await capture('ground-jump');assert.equal(hop.state.mode,'ARMOR_GROUND');assert.ok(hop.lifts.every(n=>n>1)&&hop.body.tuck>.3&&hop.arms.lift>.3);await key('Space',false)
  await resume();await until('__MOSPEADA__.runtime.armorController.state.grounded&&__MOSPEADA__.runtime.armorController.state.settle>.2');await sim(.08);const contact=await capture('ground-touchdown');assert.ok(contact.landing.compression>.08&&contact.arms.lift>.1)
  const count=contact.state.jumpCount;await key('Space',true);await resume();await sim(.25);const repeated=await capture('ground-repeat-jump');assert.equal(repeated.state.jumpCount,count+1);assert.equal(repeated.state.mode,'ARMOR_GROUND');await release()
  await resume();await until('__MOSPEADA__.runtime.armorController.state.grounded');await sim(1)
  await pause();await press('KeyT');await resume();await until('__FRONT_BATTLOID__.entry.phase==="idle"');await capture('motorcycle-return')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  console.log(JSON.stringify({pass:true,cases:rows.length,jump:stats,attachmentsPreserved:true,motorcycleRestored:true}))
}finally{await Promise.race([c.send('Browser.close').catch(()=>{}),wait(10000)]);c.close()}
