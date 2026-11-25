import fs from 'node:fs'
import assert from 'node:assert/strict'
const directory='artifacts/scott-v2-riding/in-game';fs.mkdirSync(directory,{recursive:true})
const pages=await(await fetch('http://127.0.0.1:9377/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://127.0.0.1:5381/'))
if(!page)throw Error('No isolated riding test browser')
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),errors=[];let sequence=0
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.id&&pending.has(v.id)){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result)}else if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails)}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method))},30000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(expression,seconds=100){for(let i=0;i<seconds*4;i++){if(await evaluate(expression).catch(e=>{if(/context|navigated/.test(e.message))return false;throw e}))return;await delay(250)}throw Error('Timeout: '+expression)}
const report={states:{},views:['front','profile','back','three-quarter']}
try{
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1050,deviceScaleFactor:1,mobile:false})
 if(process.argv.includes('--close')){await send('Browser.close');console.log('Closed isolated riding browser')}
 else if(process.argv.includes('--close-up')){
  await evaluate('(()=>{const d=__MOSPEADA__;d.runtime.paused=true;d.setCameraMode(3);d.runtime.cameraController.update=()=>{};return true})()')
  for(const view of report.views){
   const offset={front:[0,1.25,4.6],profile:[4.6,1.2,0],back:[0,1.25,-4.6],'three-quarter':[3.5,1.6,3.6]}[view]
   await evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,T=d.camera.position.constructor;r.orbit.target.copy(d.rig.body.localToWorld(new T(0,1.0,0)));d.camera.position.copy(d.rig.body.localToWorld(new T(${offset.join(',')})));d.camera.fov=36;d.camera.updateProjectionMatrix();r.orbit.update();return true})()`)
   await delay(160);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${directory}/moving-close-${view}.png`,Buffer.from(shot.data,'base64'))
  }
  console.log('Captured four close-up views of the current riding pose')
 }
 else{
  const before=await evaluate('performance.timeOrigin');await send('Page.reload',{ignoreCache:true});await until(`performance.timeOrigin!==${before}`,20)
  await until('!!window.__SCOTT_ORIGINAL__?.instance.v2RidingPose && !!window.__ANIME__?.state.snapshot().ready && !document.getElementById("entry-preloader")')
  for(const state of ['rest','moving']){
   const speed=state==='moving'?18:0,idle=state==='rest'?1:0
   const values=await evaluate(`(async()=>{
    const d=__MOSPEADA__,a=__SCOTT_ORIGINAL__,{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js'),T=d.camera.position.constructor;
    d.reset('highway');const r=d.runtime;r.opening?.finish();r.armorController.deactivate();r.transformEntry.reset();r.paused=false;r.keys={};Object.assign(r.state,{speed:${speed},idleBlend:${idle},idleTime:0,parked:${state==='rest'},lean:0,bank:0,riderStand:0,boostBlend:0,brakeBlend:0,frontImpact:0,rearImpact:0,wheelieAngle:0});d.rig.update(r.state,d.sample,d.config);
    for(let i=0;i<60;i++)updateScottGameplay(a.instance,a.authored,[...a.source.animations,...a.authored.clips],r,a.wrapper.current,1/60);
    r.paused=true;d.setCameraMode(3);r.orbit.enableDamping=false;r.orbit.enabled=true;
    const mesh=a.instance.skins[0].mesh;mesh.skeleton.update();const fit=a.instance.v2RidingPose,contact={};
    for(const side of ['Left','Right']){const shape=fit.shapes[side],palm=new T(),sole=new T(),p=new T();for(const id of shape.palmIds)palm.add(mesh.localToWorld(mesh.getVertexPosition(id,p)));for(const id of shape.soleIds)sole.add(mesh.localToWorld(mesh.getVertexPosition(id,p)));palm.divideScalar(shape.palmIds.length);sole.divideScalar(shape.soleIds.length);const grip=d.rig.body.localToWorld(new T().fromArray(a.authored.data.measuredTargets.grips[side]));contact[side]={palmError:palm.distanceTo(grip),sole:d.rig.body.worldToLocal(sole).toArray()}}
    return{diagnostics:structuredClone(a.instance.mountedMotion.diagnostics),fit:structuredClone(fit.diagnostics),contact,model:a.model,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}
   })()`)
   assert.equal(values.gl,0);assert.equal(values.shader,'');for(const c of Object.values(values.contact))assert.ok(c.palmError<.005,'Visible palm misses the grip')
   assert.ok(values.diagnostics.handError<.005&&values.diagnostics.footError<.008);report.states[state]=values
   for(const view of report.views){
    const offset={front:[0,1.25,4.6],profile:[4.6,1.2,0],back:[0,1.25,-4.6],'three-quarter':[3.5,1.6,3.6]}[view]
    await evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,T=d.camera.position.constructor;r.orbit.target.copy(d.rig.body.localToWorld(new T(0,1.0,0)));d.camera.position.copy(d.rig.body.localToWorld(new T(${offset.join(',')})));d.camera.fov=36;d.camera.updateProjectionMatrix();r.orbit.update();return true})()`)
    await delay(140);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${directory}/${state}-${view}.png`,Buffer.from(shot.data,'base64'))
   }
  }
  report.uncaughtErrors=errors;assert.equal(errors.length,0);report.passed=true;fs.writeFileSync(directory+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,views:report.views,states:Object.keys(report.states),contacts:Object.fromEntries(Object.entries(report.states).map(([k,v])=>[k,v.contact])),errors:errors.length},null,2))
 }
}catch(error){fs.writeFileSync(directory+'/failure.json',JSON.stringify({error:error.message,errors,report},null,2)+'\n');throw error}finally{socket.close()}
