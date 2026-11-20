// Actual T gameplay roundtrip, with checks on the rear cut seams and exhaust assembly.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),dir='artifacts/rear-cuts',rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
async function state(){
  const r=await bounded(c.evaluate(`(()=>{
    const d=__MOSPEADA__,f=__FRONT_BATTLOID__,rear=f.rear,e=f.entry,v=d.camera.position.clone();let rigidError=0,seamError=0,protrusion=0;
    if(rear.rearActive){
      for(const g of rear.rearGroups){
        const ref=g.reference,source=ref.source.mesh.parent.matrixWorld.clone().multiply(ref.source.matrix),inv=ref.mesh.matrixWorld.clone().invert();
        for(const p of g.members){const relative=inv.clone().multiply(p.mesh.matrixWorld),rest=source.clone().invert().multiply(p.source.mesh.parent.matrixWorld).multiply(p.source.matrix);rigidError=Math.max(rigidError,...relative.elements.map((x,i)=>Math.abs(x-rest.elements[i])))}
      }
      const B=rear.compactScale.clone().fromArray(rear.data.importMatrix),invB=B.clone().invert();
      for(const p of rear.parts.filter(p=>p.record.retract)){
        const m=invB.clone().multiply(p.mate.mesh.matrixWorld.clone().invert()).multiply(p.mesh.matrixWorld).multiply(B),seam=v.clone().set(p.cutSeam,.25,.1);
        seamError=Math.max(seamError,seam.distanceTo(seam.clone().applyMatrix4(m)));
        const a=p.mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(invB).applyMatrix4(m);protrusion=Math.max(protrusion,v.x-p.cutSeam,p.cutBounds.min.x-v.x)}
      }
    }
    return{phase:e.phase,progress:f.store.snapshot().progress,offset:e.actorOffset.toArray(),rigidError,seamError,protrusion,lengths:d.rig.hydraulics.map(h=>h.state.length),frameError:d.rig.root.getWorldPosition(v).sub(f.frame.origin).sub(f.frame.offset).length(),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
  })()`))
  for(const k of ['rigidError','seamError','protrusion','frameError'])assert.ok(r[k]<1e-6,`${k}: ${JSON.stringify(r)}`)
  assert.ok(r.lengths.every(l=>l<1.8));assert.equal(r.gl,0);assert.equal(r.shader,'');rows.push(r);return r
}
async function until(predicate){const end=Date.now()+45000;while(Date.now()<end){const s=await state();if(predicate(s))return s;await wait(50)}throw Error('Animation phase timed out')}
async function keyT(){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key:'t',code:'KeyT'})}
async function pause(){await c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.pause();true');await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))}
async function resume(){await c.evaluate('__FRONT_BATTLOID__.entry.resume();__MOSPEADA__.runtime.paused=false;__MOSPEADA__.runtime.keys.KeyW=true;true')}
async function capture(name){
  for(const [view,offset]of[['side',[3.6,.45,.1]],['rear',[.7,.55,-3.8]]]){
    await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.35,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(100)
    fs.writeFileSync(dir+'/'+name+'-'+view+'.png',Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
  }
}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.frame && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('Object.defineProperty(__FRONT_BATTLOID__.entry,"cameraProgress",{configurable:true,get:()=>null});__FRONT_BATTLOID__.entry.reset();__MOSPEADA__.reset("highway");__MOSPEADA__.runtime.state.speed=28;__MOSPEADA__.runtime.state.parked=false;__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.keys.KeyW=true;__MOSPEADA__.runtime.paused=false;true')
  await keyT()
  for(const p of [.3,.43,.54,.7]){await until(r=>r.phase==='transforming'&&r.progress>=p);await pause();await state();await capture('forward-'+p);await resume()}
  const armor=await until(r=>r.phase==='complete');assert.ok(Math.hypot(...armor.offset)>7);await pause();await capture('armor')
  await keyT();await c.evaluate('__MOSPEADA__.runtime.paused=false;true')
  for(const p of [.85,.65,.5,.35,.2]){await until(r=>r.phase==='reversing'&&r.progress<=p);await pause();await state();await capture('reverse-'+p);await resume()}
  const end=await until(r=>r.phase==='idle');assert.equal(end.progress,0);await pause();await capture('restored')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(rows,null,2)+'\n')
  console.log(JSON.stringify({samples:rows.length,maxRigidError:Math.max(...rows.map(r=>r.rigidError)),maxSeamError:Math.max(...rows.map(r=>r.seamError)),maxProtrusion:Math.max(...rows.map(r=>r.protrusion)),restored:true},null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
