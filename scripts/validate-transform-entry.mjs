import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/transform-entry',report={}
fs.mkdirSync(dir,{recursive:true})
async function key(){await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'t',code:'KeyT'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'t',code:'KeyT'})}
async function capture(name){await wait(200);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function view(){await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1.1,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(4.2,1.8,2.5)));d.runtime.orbit.update()})()`)}
async function simulate(frames,until='false'){
  return c.evaluate(`(async()=>{
    const d=__MOSPEADA__,fx=__MOSPEADA_VFX__,f=__FRONT_BATTLOID__,sc=__SCOTT_ORIGINAL__,s=d.runtime.state;
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),{updateScottGameplay}=await import('/src/vehicle/scottGameplay.js');
    let frames=0;
    for(let i=0;i<${frames};i++){
      f.frame?.restore();f.suspension?.restore();f.wheels?.restore();f.guards?.restore();f.rear?.restore();f.effect.restore();const input=f.entry.beforePhysics({},1/60),config={...d.config,...f.entry.physicsConfig};d.runtime.input=input;
      advanceBike(s,input,1/60,d.rig.metrics,d.sample,()=>true,config);f.entry.afterPhysics(1/60,d.rig.metrics,config);
      d.rig.update(s,d.sample,d.config);updateScottGameplay(sc.instance,sc.authored,[...sc.source.animations,...sc.authored.clips],d.runtime,sc.wrapper.current,1/60);
      f.store.advance(1/60);f.frame?.apply(f.entry.actorOffset);f.effect.apply(f.store.snapshot().progress,f.entry.choreography);f.rear?.apply(f.store.snapshot().progress);f.guards?.apply(f.store.snapshot().progress,f.entry.choreography);f.wheels?.apply(f.store.snapshot().progress);f.suspension?.apply(f.store.snapshot().progress);
      d.runtime.cameraController.update(s,1/60);
      if(f.entry.cameraProgress!==null&&f.entry.cameraProgress<1){
        (window.__CHOREO_CAMERA__||=[]).push(Math.atan2(d.camera.position.x-s.x,d.camera.position.z-s.z)-s.yaw);
      }
      const wheels=__CYCLONE_WEATHERING__.effect.contacts.update(s);
      fx.ejecta.prepare(1/60,wheels,s,fx.store.snapshot(),1,5,1,1/60);fx.engine.prepare(1/60,s,input,fx.engineStore.snapshot(),5,1,1/60);fx.dust.update(1/60,wheels.rear,s,fx.store.snapshot(),5,1,1/60,fx.vfx);
      fx.armorBoost?.prepare(1/60,f.entry,f.rear,5);fx.vfx.update(1/60);
      frames++;if(${until})break;
    }
    const result={frames,phase:f.entry.phase,pose:f.entry.poseBlend,progress:f.store.snapshot().progress,choreography:f.entry.choreography,cameraProgress:f.entry.cameraProgress,wheelie:s.wheelieAngle,boostTime:s.boostTime,boostCount:s.boostCount,armorBoostCount:f.entry.armorBoostCount,actorOffset:f.entry.actorOffset.toArray(),airborne:s.airborne,height:s.height,speed:s.speed};return result;
  })()`)
}
try{
  for(let i=0;i<200;i++){if(await c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false))break;await wait(200)}
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.reset()')
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings();await wait(1300)
  await key();report.stopped=await c.evaluate('({phase:__FRONT_BATTLOID__.entry.phase,progress:__FRONT_BATTLOID__.store.snapshot().progress,boost:__MOSPEADA__.runtime.state.boostCount})')
  assert.deepEqual(report.stopped,{phase:'idle',progress:0,boost:0})
  await c.evaluate('__MOSPEADA__.runtime.state.speed=-.9');await key();assert.equal(await c.evaluate('__FRONT_BATTLOID__.entry.phase'),'idle')
  await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');__FRONT_BATTLOID__.entry.reset();d.runtime.state=createBikeState({x:65,z:-78.25,yaw:-Math.PI/2},d.rig.metrics,d.sample);d.runtime.state.speed=12;d.runtime.state.parked=false;d.runtime.state.idleBlend=0;d.rig.update(d.runtime.state,d.sample,d.config)})()`)
  await c.evaluate('__MOSPEADA__.setCameraMode(0);__MOSPEADA__.runtime.cameraController.reset(__MOSPEADA__.runtime.state);window.__CHOREO_CAMERA__=[];true')
  await key();report.early=await simulate(12);assert.ok(report.early.choreography.turn>.5);assert.equal(report.early.choreography.separate,0);await capture('00-early-turn')
  report.wheelie=await simulate(120,`f.entry.phase==='boost'`);assert.ok(report.wheelie.wheelie>=.42&&report.wheelie.progress===0)
  assert.equal(report.wheelie.choreography.turn,1);await capture('01-wheelie')
  report.boost=await simulate(4);assert.equal(report.boost.boostCount,1);assert.ok(report.boost.boostTime>0&&report.boost.phase==='boost');await capture('02-boost')
  report.launch=await simulate(40,`f.entry.phase==='airpose'`);assert.equal(report.launch.airborne,true);assert.equal(report.launch.progress,0);await capture('03-takeoff')
  report.pose=await simulate(60,`f.entry.phase==='transforming'`);assert.equal(report.pose.pose,1);assert.equal(report.pose.airborne,true);await capture('04-tpose-transform-start')
  report.midpoint=await simulate(60);assert.ok(report.midpoint.progress>.45&&report.midpoint.progress<.6);await capture('05-mid-transform')
  report.complete=await simulate(100,`f.entry.phase==='complete'`);assert.equal(report.complete.progress,1);assert.ok(report.complete.actorOffset[1]>2);assert.equal(report.complete.armorBoostCount,1);await capture('06-battloid')
  report.restPose=await c.evaluate(`(()=>{
    const i=__SCOTT_ORIGINAL__.instance,p=i.transformationPose;
    const lower=[...i.bones].filter(([name])=>/Hips|UpLeg|LeftLeg|RightLeg|Foot|ToeBase/.test(name));
    p.restore();p.wrapper.updateMatrixWorld(true);const before=lower.map(([,b])=>b.matrixWorld.clone());p.apply(1);
    return{bones:i.bones.size,clips:__SCOTT_ORIGINAL__.source.animations.length,
      lowerError:Math.max(...lower.flatMap(([,b],j)=>b.matrixWorld.elements.map((v,k)=>Math.abs(v-before[j].elements[k])))),
      rotationError:Math.max(...p.records.filter(r=>r.bone!==p.spine).map(r=>r.bone.quaternion.angleTo(r.restQ))),
      gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error};
  })()`)
  assert.equal(report.restPose.bones,24);assert.equal(report.restPose.clips,16);assert.ok(report.restPose.lowerError<1e-8&&report.restPose.rotationError<1e-6);assert.equal(report.restPose.gl,0);assert.equal(report.restPose.shader,'')
  report.camera=await c.evaluate(`(()=>{const a=__CHOREO_CAMERA__;let angle=0;for(let i=1;i<a.length;i++)angle+=Math.atan2(Math.sin(a[i]-a[i-1]),Math.cos(a[i]-a[i-1]));return{degrees:angle*180/Math.PI,samples:a.length,controlsRestored:__MOSPEADA__.runtime.orbit.enabled}})()`)
  assert.ok(report.camera.degrees>350);assert.equal(report.camera.controlsRestored,true)
  await c.openSettings('Transformación');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='← Fotograma').click()`);await wait(100)
  assert.ok(await c.evaluate('__FRONT_BATTLOID__.store.snapshot().progress')<1)
  assert.equal(await c.evaluate('__FRONT_BATTLOID__.entry.paused'),true)
  await c.closeSettings();await key();report.reverted=await simulate(200,`f.entry.phase==='idle'`)
  assert.equal(report.reverted.phase,'idle');assert.equal(report.reverted.pose,0);assert.equal(report.reverted.progress,0);assert.equal(report.reverted.boostCount,1)
  await view();await capture('07-back-to-riding')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await c.send('Browser.close').catch(()=>{});c.close()}
