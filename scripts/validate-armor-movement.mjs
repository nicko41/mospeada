import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/armor-movement',report=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
async function until(expression,ms=120000){const end=Date.now()+ms;while(Date.now()<end){const value=await bounded(c.evaluate(expression),90000);if(value)return value;await wait(100)}throw Error('Milestone timeout: '+expression)}
const frames=()=>bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
const keys={KeyW:'w',KeyD:'d',KeyA:'a',KeyS:'s',ShiftLeft:'Shift',Space:' ',ControlLeft:'Control',KeyG:'g',KeyT:'t',KeyF:'f'}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:keys[code]})}
async function press(code){await key(code,true);await key(code,false)}
async function sim(seconds){const start=await c.evaluate('__MOSPEADA__.runtime.armorController.state.time');await until(`__MOSPEADA__.runtime.armorController.state.time>=${start+seconds}`)}
async function snapshot(name,capture=true){
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames()
  const row=await c.evaluate(`(()=>{const d=__MOSPEADA__,a=d.runtime.armorController,s=__SCOTT_ORIGINAL__.instance,e=__MOSPEADA_VFX__;return{name:${JSON.stringify(name)},active:a.active,state:a.state?{...a.state}:null,phase:d.runtime.transformEntry.phase,offset:d.runtime.transformEntry.actorOffset.toArray(),reaction:s.armorReaction?.diagnostics,native:{source:s.armorLocomotion?.source,weight:s.armorLocomotion?.weight,clip:s.clip,rate:s.action?.getEffectiveTimeScale(),time:s.action?.time},attachments:s.armorArticulation?.diagnostics,cuffError:Math.max(...d.runtime.guardTransformation.groups.flatMap(g=>{const expected=g.bone.matrixWorld.clone().multiply(g.targetInBone).multiply(g.inversePivot).elements;return g.parts.map(p=>Math.max(...p.mesh.matrixWorld.elements.map((v,i)=>Math.abs(v-expected[i]))))})),lift:e.armorBoost.liftRecords.map(r=>({particles:r.system.particleNum,level:r.level,position:r.position.toArray()})),mainParticles:e.armorBoost.records.map(r=>r.system.particleNum),spin:[d.runtime.state.frontSpin,d.runtime.state.rearSpin],gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  report.push(row);assert.equal(row.gl,0);assert.equal(row.shader,'')
  if(row.active){assert.ok(row.cuffError<1e-6,'Cuffs must follow the final forearm pose without lag');assert.ok(row.attachments.legs.every(l=>l.error<1e-6),'Each caballer ends at its own knee')}
  if(capture)fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
  return row
}
const resume=()=>c.evaluate('__MOSPEADA__.runtime.paused=false;true')
async function sideView(name){
  const yaw=await c.evaluate('__MOSPEADA__.runtime.armorController.camera.yaw')
  await c.evaluate('__MOSPEADA__.runtime.armorController.camera.yaw+=Math.PI/2;true');await wait(1300);await snapshot(name)
  await c.evaluate(`__MOSPEADA__.runtime.armorController.camera.yaw=${yaw};true`);await wait(1300)
}
try{
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && !document.querySelector("#entry-preloader")',300000)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.reset("highway");__MOSPEADA__.runtime.state.speed=22;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.state.parked=false;true')
  await press('KeyT');await until('__MOSPEADA__.runtime.armorController.active');await sim(3.5)
  const hover=await snapshot('hover');assert.equal(hover.state.mode,'ARMOR_HOVER');assert.ok(Math.abs(hover.state.height-.8)<.15);assert.ok(hover.lift.every(r=>r.particles>0&&r.particles<=70))
  const yaw=hover.state.yaw;await key('KeyD',true);await resume();await sim(1.2)
  const strafe=await snapshot('strafe');await key('KeyD',false)
  assert.ok(Math.hypot(strafe.state.x-hover.state.x,strafe.state.z-hover.state.z)>4);assert.ok(Math.abs(strafe.state.yaw-yaw)<.05);assert.ok(Math.abs(strafe.reaction.bank)>.02)
  assert.ok((strafe.state.x-hover.state.x)*-Math.cos(yaw)+(strafe.state.z-hover.state.z)*Math.sin(yaw)>4,'D goes camera-right in Armor')
  assert.deepEqual(strafe.spin,hover.spin,'Motorcycle wheel spin cannot be advanced by Armor input')
  await resume();await sim(3.5);const stopped=await snapshot('braking',false);assert.ok(stopped.state.speed<.1)
  await key('KeyW',true);await key('ShiftLeft',true);await resume();await sim(1.3)
  const boost=await snapshot('boost');assert.ok(boost.state.speed>25);assert.ok(boost.reaction.boost>.5&&boost.reaction.lean>.10);assert.ok(boost.mainParticles.some(n=>n>0))
  await key('Space',true);await resume();await sim(.7);const jump=await snapshot('boost-jump');assert.ok(jump.state.height>4&&jump.state.vy>4)
  for(const code of ['Space','KeyW','ShiftLeft'])await key(code,false)
  await key('ControlLeft',true);await resume();await sim(1);const descent=await snapshot('descent');assert.ok(descent.state.vy<jump.state.vy-8);await key('ControlLeft',false)
  await resume();await until('__MOSPEADA__.runtime.armorController.state.height<1.15 && Math.abs(__MOSPEADA__.runtime.armorController.state.vy)<.5');await sim(1)
  const landed=await snapshot('hover-recovery');assert.ok(landed.state.height>=0&&Math.abs(landed.state.height-.8)<.12)
  await press('KeyG');await resume();await until('__MOSPEADA__.runtime.armorController.state.mode==="ARMOR_GROUND"&&__MOSPEADA__.runtime.armorController.state.height<.12')
  await key('KeyW',true);await sim(1);const walk=await snapshot('ground-walk');assert.ok(walk.state.speed>2&&walk.reaction.ground);assert.equal(walk.native.source,'walking_2_inplace');assert.equal(walk.native.weight,1);await sideView('ground-walk-side')
  await key('ShiftLeft',true);await resume();await sim(1);const run=await snapshot('ground-run');assert.ok(run.state.speed>4.8);assert.equal(run.native.source,'Running');assert.equal(run.native.weight,1);await sideView('ground-run-side');for(const code of ['KeyW','ShiftLeft'])await key(code,false)
  await press('KeyG');await resume();await sim(1.5);const again=await snapshot('hover-again');assert.equal(again.state.mode,'ARMOR_HOVER')
  // Camera responds to passive mouse movement, with no V/right-button gate.
  const before=await c.evaluate('__MOSPEADA__.runtime.armorController.camera.yaw')
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:500});await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:500})
  const after=await c.evaluate('__MOSPEADA__.runtime.armorController.camera.yaw');assert.ok(Math.abs(after-before)>.1)
  await press('KeyT');assert.equal(await c.evaluate('__MOSPEADA__.runtime.armorController.active'),false)
  await resume();await until('__FRONT_BATTLOID__.entry.phase==="idle"');await snapshot('motorcycle-return')
  assert.equal(await c.evaluate('__MOSPEADA__.runtime.armorController.active'),false);assert.equal(await c.evaluate('__FRONT_BATTLOID__.store.snapshot().progress'),0)
  await resume();await until('!__MOSPEADA__.runtime.state.airborne');await press('KeyF');await until('__MOSPEADA__.runtime.state.riderMode==="onFoot"')
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames()
  // D initially points INTO the parked bike from the left dismount side.
  // Walk left away from that collision before testing the return to the right.
  const initialFoot=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})')
  await c.evaluate('__MOSPEADA__.runtime.cameraMode=3;true');await key('KeyA',true);await resume()
  await until(`Math.hypot(__MOSPEADA__.runtime.state.pedestrian.x-(${initialFoot.x}),__MOSPEADA__.runtime.state.pedestrian.z-(${initialFoot.z}))>.6`)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await key('KeyA',false);await frames()
  const foot=await c.evaluate('(()=>{const r=__MOSPEADA__.runtime,p=r.state.pedestrian,v=r.cameraController.camera.getWorldDirection(r.probe);return{x:p.x,z:p.z,rightX:-v.z,rightZ:v.x}})()')
  await key('KeyD',true);await resume();await until(`Math.hypot(__MOSPEADA__.runtime.state.pedestrian.x-(${foot.x}),__MOSPEADA__.runtime.state.pedestrian.z-(${foot.z}))>.18`)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await key('KeyD',false)
  const walked=await c.evaluate('({...__MOSPEADA__.runtime.state.pedestrian})')
  assert.ok((walked.x-foot.x)*foot.rightX+(walked.z-foot.z)*foot.rightZ>.1,'D goes camera-right on foot')
  await snapshot('on-foot-right')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({stages:report.map(r=>r.name),pass:true,maxHeight:Math.max(...report.map(r=>r.state?.height||0)),motorcycleRestored:true},null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
