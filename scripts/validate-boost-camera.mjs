import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
import {boostCameraState} from '../src/rendering/boostCameraState.js'

const directory='artifacts/boost-camera';fs.mkdirSync(directory,{recursive:true})
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9345)}),wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
 const deadline=Date.now()+180000
 while(!await c.evaluate('!!window.__BOOST_CAMERA__ && !!window.__ANIME__?.state.snapshot().ready && !!window.__MOSPEADA__?.runtime.combatVFX && !document.querySelector("#entry-preloader")')){
  if(Date.now()>deadline)throw Error('Game not ready');await wait(500)
 }
 await c.evaluate(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,a=__ANIME__,b=__BOOST_CAMERA__,f=__CAMERA_IMPACT__;
  d.reset('highway');b.state.reset();f.state.reset();
  const q=window.__BOOST_QA__={frames:0,unchanged:true,maxRayError:0,maxFov:0,maxBlur:0,airFrames:0,events:[],draw:a.effect.drawSceneTarget,emit:f.events.emit};
  f.events.emit=function(kind,p,strength){q.events.push(kind);return q.emit.call(this,kind,p,strength)};
  a.effect.drawSceneTarget=function(target,view){
   if(target!==this.target)return q.draw.apply(this,arguments);
   const source=d.camera,ray=new r.gallant.raycaster.constructor(),pointer=r.gallant.pointer;
   const snapshot=()=>JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.projectionMatrix.toArray(),r.state]);
   const before=snapshot();ray.setFromCamera(pointer,source);const direction=ray.ray.direction.clone();
   if(!f.effect.slots.some(x=>x.active)){ray.setFromCamera(pointer,view);q.maxRayError=Math.max(q.maxRayError,direction.distanceTo(ray.ray.direction))}
   const result=q.draw.apply(this,arguments);q.unchanged&&=before===snapshot();q.frames++;
   q.maxFov=Math.max(q.maxFov,view.fov-source.fov);q.maxBlur=Math.max(q.maxBlur,this.composite.uniforms.uBoostBlurStrength.value);
   if(r.state.airborne&&b.effect.blurLevel>0)q.airFrames++;
   return result;
  };
 })()`)
 await c.evaluate('window.dispatchEvent(new CustomEvent("ride-command",{detail:{pause:true}}))');await wait(150)
 await c.openSettings('Cámara FX')
 await c.evaluate(`[...document.querySelectorAll('.camera-fx-tabs button')].find(b=>b.textContent==='Boost · Cyclone').click()`)
 await wait(100)
 const controls=await c.evaluate(`(()=>{const panel=document.querySelector('[aria-label="Boost Camera FX"]'),boxes=[...panel.querySelectorAll('input[type=checkbox]')],initial=boxes.map(b=>b.checked);boxes[1].click();const independent=!__BOOST_CAMERA__.state.snapshot().fovEnabled&&__BOOST_CAMERA__.state.snapshot().blurEnabled;boxes[1].click();return {initial,independent,sliders:panel.querySelectorAll('input[type=range]').length}})()`)
 assert.deepEqual(controls.initial,[true,true,false]);assert.equal(controls.independent,true);assert.equal(controls.sliders,8)
 fs.writeFileSync(directory+'/settings.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await c.closeSettings();await c.evaluate('window.dispatchEvent(new CustomEvent("ride-command",{detail:{pause:true}}))');await wait(150)
 await c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime;d.setCameraMode(3);r.keys={KeyW:true};r.state.speed=55;r.state.parked=false})()`);await wait(200)
 await c.evaluate('__MOSPEADA__.runtime.boostQueued=true');await wait(1600)
 const boost=await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,b=__BOOST_CAMERA__.effect;return {speed:r.state.speed,count:r.state.boostCount,time:r.state.boostTime,target:b.target,level:b.blurLevel,fov:b.fovOffset,events:__BOOST_QA__.events}})()`)
 assert.equal(boost.count,1);assert.equal(boost.events.filter(x=>x==='boostStart').length,0);assert.ok(boost.level>0&&boost.fov>0);assert.ok(boost.speed>60&&boost.time===0&&boost.target>0)
 // Lift the existing vehicle into an actual airborne simulation, preserving boost telemetry.
 await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,s=r.state;s.height+=4;s.frontSpring+=4;s.rearSpring+=4;s.verticalVelocity=3;s.frontGrounded=false;s.rearGrounded=false;s.airborne=true})()`);await wait(400)
 const gpu=await c.evaluate(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,a=__ANIME__,e=a.effect,b=__BOOST_CAMERA__,camera=d.camera,renderer=a.renderer;
  r.paused=true;__CAMERA_IMPACT__.effect.reset();
  const center=camera.position.clone();r.scottInstance.modelComparison.v3.retarget.bones.get('Hips').getWorldPosition(center);center.y+=.1;
  camera.position.copy(center).add(center.clone().set(3.3,1,.2));camera.lookAt(center);camera.updateMatrixWorld();
  const right=center.clone().set(1,0,0).applyQuaternion(camera.quaternion);camera.lookAt(center.clone().addScaledVector(right,1));camera.updateMatrixWorld();
  const focus=b.effect.focus.clone(),presentation=b.effect.compose(camera,null,b.state.snapshot(),focus),gl=renderer.getContext(),w=e.target.width,h=e.target.height;
  const before=JSON.stringify([r.state,camera.position.toArray(),camera.quaternion.toArray(),camera.projectionMatrix.toArray()]);
  const day=e.uniforms.uAnimeDay.value,config=a.state.snapshot(),off=new Uint8Array(w*h*4),on=new Uint8Array(w*h*4),mask=new Uint8Array(w*h*4);
  e.render(config,day,{...presentation,boostBlurStrength:0,blurBlend:0});const callsOff=e.stats.renderCalls;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,off);
  e.render(config,day,{...presentation,blurBlend:0});const callsOn=e.stats.renderCalls;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,on);
  // RGBA/UNSIGNED_BYTE is the portable WebGL readback format, including R8 MRTs.
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,renderer.properties.get(e.target).__webglFramebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,mask);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
  let hero=0,heroPeriphery=0,heroChanged=0,centerChanged=0,peripheryChanged=0,centerPixels=0,maskMax=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,j=i*4,delta=Math.max(Math.abs(off[j]-on[j]),Math.abs(off[j+1]-on[j+1]),Math.abs(off[j+2]-on[j+2]));
   const radius=2*Math.hypot((x/w-.5)*w/h,y/h-.5);maskMax=Math.max(maskMax,mask[j]);
   if(mask[j]>=166){hero++;if(radius>.5)heroPeriphery++;if(delta>1)heroChanged++}
   if(radius<presentation.boostClearRadius*.9){centerPixels++;if(delta>1)centerChanged++}
   if(radius>.6&&mask[j]<166&&delta>0)peripheryChanged++;
  }
  return {w,h,hero,heroPeriphery,heroChanged,centerChanged,centerPixels,peripheryChanged,maskMax,callsOff,callsOn,targets:e.target.textures.length,rects:e.boostProtection.rects.map(v=>v.toArray()),strength:presentation.boostBlurStrength,unchanged:before===JSON.stringify([r.state,camera.position.toArray(),camera.quaternion.toArray(),camera.projectionMatrix.toArray()]),error:gl.getError()};
 })()`)
 fs.writeFileSync(directory+'/gpu-last-run.json',JSON.stringify(gpu,null,2))
 assert.ok(gpu.heroPeriphery>500);assert.equal(gpu.heroChanged,0);assert.equal(gpu.centerChanged,0);assert.ok(gpu.peripheryChanged>0);assert.equal(gpu.unchanged,true);assert.equal(gpu.targets,2);assert.equal(gpu.callsOff,gpu.callsOn);assert.equal(gpu.error,0)
 const pause=await c.evaluate('({level:__BOOST_CAMERA__.effect.blurLevel,fov:__BOOST_CAMERA__.effect.fovOffset})');await wait(200)
 assert.deepEqual(await c.evaluate('({level:__BOOST_CAMERA__.effect.blurLevel,fov:__BOOST_CAMERA__.effect.fovOffset})'),pause)
 await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime;r.paused=false;r.keys={KeyS:true}})()`);await wait(2200)
 const deceleration=await c.evaluate('({speed:__MOSPEADA__.runtime.state.speed,target:__BOOST_CAMERA__.effect.target,level:__BOOST_CAMERA__.effect.blurLevel})')
 assert.equal(deceleration.target,0);assert.ok(deceleration.level<pause.level)
 await c.evaluate(`(()=>{__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.store.set({inspection:true});__FRONT_BATTLOID__.entry.scrub(1);__MOSPEADA__.runtime.paused=false})()`);await wait(300)
 const armor=await c.evaluate('({active:__MOSPEADA__.runtime.armorController.active,level:__BOOST_CAMERA__.effect.blurLevel,fov:__BOOST_CAMERA__.effect.fovOffset})')
 assert.equal(armor.active,true);assert.equal(armor.level,0);assert.equal(armor.fov,0)
 const report=await c.evaluate(`(()=>{const q=__BOOST_QA__,a=__ANIME__,gl=a.renderer.getContext();return {frames:q.frames,unchanged:q.unchanged,maxRayError:q.maxRayError,maxFov:q.maxFov,maxBlur:q.maxBlur,airFrames:q.airFrames,shaderError:a.state.snapshot().error,badPrograms:a.renderer.info.programs.filter(p=>p.program&&!gl.getProgramParameter(p.program,gl.LINK_STATUS)).length}})()`)
 const cfg=boostCameraState.defaults
 assert.ok(report.frames>0&&report.airFrames>0);assert.equal(report.unchanged,true);assert.ok(report.maxRayError<1e-10);assert.ok(report.maxFov>10&&report.maxFov<=cfg.maxFov+.000001);assert.ok(report.maxBlur>.6&&report.maxBlur<=cfg.blurIntensity*cfg.peripheralIntensity+.000001);assert.equal(report.shaderError,'');assert.equal(report.badPrograms,0)
 fs.writeFileSync(directory+'/validation.json',JSON.stringify({controls,boost,gpu,deceleration,armor,...report},null,2)+'\n');console.log(JSON.stringify({controls,boost,gpu,deceleration,armor,...report},null,2))
}finally{
 await c.evaluate(`(()=>{const q=window.__BOOST_QA__;if(!q)return;__ANIME__.effect.drawSceneTarget=q.draw;__CAMERA_IMPACT__.events.emit=q.emit;__BOOST_CAMERA__.state.reset();__CAMERA_IMPACT__.state.reset();__CAMERA_IMPACT__.events.clear();__MOSPEADA__.runtime.paused=false;__MOSPEADA__.reset('highway');delete window.__BOOST_QA__})()`).catch(()=>{});c.close()
}
