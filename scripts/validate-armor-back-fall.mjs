import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),report={},dir='artifacts/armor-back-fall',wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(expression,message,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(100)}throw Error(message)}
const frames=()=>c.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
async function measure(){return c.evaluate(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,i=r.scottInstance,v=i.modelComparison.v3,art=i.armorArticulation,mesh=v.skins[0].mesh,p=d.camera.position.clone(),feet={};let maxAttachmentError=0
  for(const side of ['Left','Right']){let min=Infinity;for(const id of v.shapes[side].soleIds){mesh.localToWorld(mesh.getVertexPosition(id,p));min=Math.min(min,p.y-d.sample(p.x,p.z))}feet[side]=min}
  for(const binding of art.suspensionBindings){const side=binding.bone.name.includes('Left')?'Left':'Right',expected=v.boneDelta(side+'ForeArm').multiply(binding.bone.matrixWorld).multiply(binding.inBone);maxAttachmentError=Math.max(maxAttachmentError,...expected.elements.map((value,index)=>Math.abs(value-binding.mesh.matrixWorld.elements[index])))}
  return{feet,maxAttachmentError,attachedParts:art.suspensionBindings.length,pose:i.hitMotion.diagnostics,phase:r.transformEntry.phase,variant:i.modelComparison.variant}
})()`)}
async function capture(name,x,z){
  await c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,p=d.camera.position.clone().set(r.state.x,r.state.height+.5,r.state.z);r.orbit.target.copy(p);d.camera.position.copy(p).add(p.clone().set(${x},1.8,${z}));r.orbit.update();return true})()`)
  await frames();fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}
try{
  fs.mkdirSync(dir,{recursive:true})
  await until("!!window.__FRONT_BATTLOID__?.store.snapshot().ready&&!document.querySelector('#entry-preloader')",'Game preparation timed out')
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,r=d.runtime;window.__FOREST_OPENING__?.finish();d.reset();(await import('/src/world/weatherState.js')).weatherState.setPreset('sunny');const time=(await import('/src/world/TimeOfDay.jsx')).timeOfDayState;time.value=time.target=1;r.transformEntry.phase='complete';r.transformEntry.poseBlend=1;__FRONT_BATTLOID__.store.seek(1);return true})()`)
  await until('__MOSPEADA__.runtime.armorController.active','Armor did not activate',10000)
  await c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,a=r.armorController,s=a.state;r.paused=true;r.keys={};Object.assign(s,{y:a.sample(s.x,s.z)-s.soleOffset+.025,height:.025,grounded:true,mode:'ARMOR_GROUND',speed:0,vx:0,vz:0,vy:0});a.sync();window.__ARMOR_FALL_QA__={cameraUpdate:a.camera.update};a.camera.update=()=>{};d.setCameraMode(3);r.orbit.enableDamping=false;r.orbit.maxDistance=30;document.querySelector('.driving-hud').style.display='none';return true})()`)
  await frames()
  await c.evaluate(`(()=>{const d=__MOSPEADA__,h=d.runtime.scottInstance.hitMotion;h.reset();h.cooldown=0;h.startHit('scout-claw',d.sample);h.age=.55;return true})()`)
  await frames();report.down=await measure()
  assert.equal(report.down.attachedParts,26);assert.ok(report.down.maxAttachmentError<1e-5)
  for(const gap of Object.values(report.down.feet))assert.ok(gap>=-.01&&gap<.08,'Native Armor soles do not meet ground support: '+gap)
  await capture('01-supported-side',3.5,-3.5);await capture('02-supported-front',-3.4,-3.2)
  const age=await c.evaluate('__MOSPEADA__.runtime.scottInstance.hitMotion.age');await wait(200);assert.equal(await c.evaluate('__MOSPEADA__.runtime.scottInstance.hitMotion.age'),age)
  await c.evaluate('__MOSPEADA__.runtime.paused=false;true')
  await until('!__MOSPEADA__.runtime.scottInstance.hitMotion.knockedDown','Recovery did not restore controls',10000)
  await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await frames()
  report.recovered=await c.evaluate(`(async()=>{const r=__MOSPEADA__.runtime;return{knockedDown:r.armorController.state.knockedDown,health:(await import('/src/player/playerCombat.js')).playerCombat.playerHealth}})()`)
  assert.equal(report.recovered.knockedDown,false);assert.equal(report.recovered.health,100)
  await capture('03-recovered',3.5,-3.5)
  await c.evaluate(`(async()=>{const {damagePlayer}=await import('/src/player/playerCombat.js');damagePlayer(200);return true})()`)
  await frames()
  await c.evaluate('(()=>{const f=__MOSPEADA__.runtime.scottInstance.defeatMotion;f.age=1.8;f.offsetY=-3;return true})()')
  await frames();report.defeat=await measure()
  assert.ok(report.defeat.maxAttachmentError<1e-5)
  for(const gap of Object.values(report.defeat.feet))assert.ok(gap>=-.01&&gap<.08,'Defeated Armor support failed: '+gap)
  await capture('04-defeat-supported',3.5,-3.5)
  report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');assert.equal(report.gl,0)
  report.errors=c.events.filter(event=>event.method==='Runtime.exceptionThrown').map(event=>event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{
  await c.evaluate("if(window.__ARMOR_FALL_QA__){__MOSPEADA__.runtime.armorController.camera.update=__ARMOR_FALL_QA__.cameraUpdate;delete window.__ARMOR_FALL_QA__};document.querySelector('.driving-hud').style.display='';__MOSPEADA__.reset();true").catch(()=>{})
  c.close()
}
