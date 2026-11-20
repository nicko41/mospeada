import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/armor-coupling',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expr,ms=180000){const end=Date.now()+ms;while(Date.now()<end){if(await c.evaluate(expr))return;await wait(120)}throw Error('Milestone timeout: '+expr)}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:{KeyT:'t',KeyW:'w',KeyG:'g',ShiftLeft:'Shift'}[code]})}
async function press(code){await key(code,true);await key(code,false)}
const pause=()=>c.evaluate('__MOSPEADA__.runtime.paused=true;true'),resume=()=>c.evaluate('__MOSPEADA__.runtime.paused=false;true')
const frames=()=>c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
async function sim(seconds){const time=await c.evaluate('__MOSPEADA__.runtime.armorController.state.time');await until(`__MOSPEADA__.runtime.armorController.state.time>=${time+seconds}`)}
async function capture(name){
  await pause();await frames()
  const row=await c.evaluate(`(()=>{const i=__SCOTT_ORIGINAL__.instance,l=i.armorArticulation,a=__MOSPEADA__.runtime.armorController;
    const error=(x,y)=>Math.max(...x.elements.map((v,k)=>Math.abs(v-y.elements[k])));
    return{name:${JSON.stringify(name)},active:a.active,state:{...a.state},clip:i.clip,source:i.armorLocomotion?.source,weight:i.armorLocomotion?.weight,rate:i.action.getEffectiveTimeScale(),torsoError:Math.max(...l.torsoBindings.map(b=>error(b.mesh.matrixWorld,l.spine.matrixWorld.clone().multiply(b.inBone)))),torsoMatrix:l.spine.matrixWorld.toArray(),legs:l.diagnostics.legs,cuffError:Math.max(...l.guards.flatMap(g=>g.parts.map(p=>error(p.mesh.matrixWorld,g.bone.matrixWorld.clone().multiply(g.targetInBone).multiply(g.inversePivot))))),gl:__ANIME__.renderer.getContext().getError()}})()`)
  assert.equal(row.gl,0)
  if(row.active){assert.ok(row.torsoError<1e-6);assert.ok(row.cuffError<1e-6);assert.ok(row.legs.every(l=>l.error<1e-6))}
  rows.push(row);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(rows,null,2)+'\n');console.log(name);return row
}
async function inspectView(name,kind,side='Left'){
  const old=await c.evaluate(`(()=>{const a=__MOSPEADA__.runtime.armorController,cam=a.camera,i=__SCOTT_ORIGINAL__.instance,l=i.armorArticulation;cam.active=false;
    const old={position:cam.camera.position.toArray(),quaternion:cam.camera.quaternion.toArray()};
    const b=l.bindings.find(b=>b.side===${JSON.stringify(side)}),hip=l.hips.getWorldPosition(l.top.clone()),out=l.top.clone().setFromMatrixColumn(i.model.matrixWorld,0).normalize().multiplyScalar(${side==='Left'?1:-1});
    let center=b.bottom.clone().applyMatrix4(b.mesh.matrixWorld);
    if(${JSON.stringify(kind)}==='body'){center=hip.clone();center.y+=.1;cam.camera.position.copy(center).addScaledVector(out,3.2);cam.camera.position.y+=.4}
    else{center.y+=.12;cam.camera.position.copy(center).addScaledVector(out,.85);cam.camera.position.y+=.06}
    cam.camera.lookAt(center);return old})()`)
  await frames();await capture(name)
  await c.evaluate(`(()=>{const cam=__MOSPEADA__.runtime.armorController.camera;cam.camera.position.fromArray(${JSON.stringify(old.position)});cam.camera.quaternion.fromArray(${JSON.stringify(old.quaternion)});cam.active=true})()`)
}
try{
  await c.send('Page.reload',{ignoreCache:false})
  await until('!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector("#entry-preloader")',300000)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.reset("highway");__MOSPEADA__.runtime.state.speed=22;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.state.parked=false;true')
  await press('KeyT');await until('__MOSPEADA__.runtime.armorController.active');await sim(2.5)
  await capture('hover');await inspectView('knee-left','knee','Left');await inspectView('knee-right','knee','Right')
  await press('KeyG');await resume();await until('__MOSPEADA__.runtime.armorController.state.height<.12')
  await key('KeyW',true);await sim(1)
  const walk=await capture('walk');assert.equal(walk.source,'walking_2_inplace');assert.equal(walk.weight,1);await inspectView('walk-side','body')
  await resume();await sim(.22);const walkNext=await capture('walk-next');assert.ok(walk.torsoMatrix.some((v,k)=>Math.abs(v-walkNext.torsoMatrix[k])>.002),'Native torso must move and armor follow throughout the stride')
  await key('ShiftLeft',true);await resume();await sim(1)
  const run=await capture('run');assert.equal(run.source,'Running');assert.equal(run.weight,1);await inspectView('run-side','body')
  await inspectView('run-knee-left','knee','Left');await inspectView('run-knee-right','knee','Right')
  await resume();await sim(.20);await capture('run-next');for(const code of ['KeyW','ShiftLeft'])await key(code,false)
  await press('KeyG');await resume();await sim(1.5);await key('KeyW',true);await key('ShiftLeft',true);await sim(.8);await capture('boost');await inspectView('boost-side','body');await key('ShiftLeft',false);await key('KeyW',false)
  const before=await c.evaluate('__SCOTT_ORIGINAL__.instance.armorArticulation.records.map(r=>r.mesh.matrixWorld.toArray())')
  await press('KeyT');await frames()
  const after=await c.evaluate('__SCOTT_ORIGINAL__.instance.armorArticulation.records.map(r=>r.mesh.matrixWorld.toArray())')
  assert.ok(after.every((m,i)=>m.every((v,j)=>Math.abs(v-before[i][j])<1e-5)),'Release must preserve the visible world pose on the paused first frame')
  await resume();await until('__FRONT_BATTLOID__.entry.phase==="idle"');await capture('motorcycle-return')
  assert.equal(await c.evaluate('__MOSPEADA__.runtime.armorController.active'),false)
  assert.equal(await c.evaluate('__SCOTT_ORIGINAL__.instance.armorArticulation.active'),false)
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  console.log(JSON.stringify({pass:true,views:rows.map(r=>r.name),nativeClips:['walking_2_inplace','Running'],torsoAndKneesAttached:true,motorcycleRestored:true}))
}finally{await Promise.race([c.send('Browser.close').catch(()=>{}),wait(10000)]);c.close()}
