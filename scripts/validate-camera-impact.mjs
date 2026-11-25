import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
import {CAMERA_IMPACT_LIMITS} from '../src/rendering/CameraImpactFX.js'
import {cameraImpactState} from '../src/rendering/cameraImpactState.js'

const directory='artifacts/camera-impact';fs.mkdirSync(directory,{recursive:true})
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9333)}),wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
 const deadline=Date.now()+180000
 while(!await c.evaluate('!!window.__CAMERA_IMPACT__ && !!window.__ANIME__?.state.snapshot().ready && !!window.__MOSPEADA__?.runtime.combatVFX && !document.querySelector("#entry-preloader")')){
  if(Date.now()>deadline)throw Error('Game not ready for camera impact validation');await wait(500)
 }
 await c.evaluate(`(()=>{
  const d=__MOSPEADA__,r=d.runtime,a=__ANIME__,f=__CAMERA_IMPACT__;
  r.keys={};r.state.speed=0;d.setCameraMode(3);f.state.reset();
  const point=d.camera.position.clone();r.scottInstance.modelComparison.v3.retarget.bones.get('Hips').getWorldPosition(point);
  const q=window.__CAMERA_IMPACT_QA__={point,near:point.clone().add(d.camera.position.clone().set(2,0,0)),far:point.clone().add(d.camera.position.clone().set(0,0,200)),steps:{},events:[],step:null,originalDraw:a.effect.drawSceneTarget,originalQuad:a.effect.quad.render,originalEmit:f.events.emit};
  f.events.emit=function(kind,p,strength,shakeScale){q.events.push(kind);return q.originalEmit.call(this,kind,p,strength,shakeScale)};
  a.effect.drawSceneTarget=function(target,view){
   if(target!==this.target||!q.step)return q.originalDraw.apply(this,arguments);
   const s=q.steps[q.step],source=d.camera,ray=new r.gallant.raycaster.constructor(),pointer=r.gallant.pointer;
   const snapshot=()=>JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.matrixWorld.toArray(),source.projectionMatrix.toArray(),r.state]);
   const before=snapshot();ray.setFromCamera(pointer,source);const aim=JSON.stringify([ray.ray.origin.toArray(),ray.ray.direction.toArray()]);
   const result=q.originalDraw.apply(this,arguments);ray.setFromCamera(pointer,source);
   s.frames++;s.logicalUnchanged&&=before===snapshot()&&aim===JSON.stringify([ray.ray.origin.toArray(),ray.ray.direction.toArray()])&&this.camera===source;
   const point=ray.ray.at(50,d.camera.position.clone()),a=point.clone().project(source),b=point.clone().project(view);s.maxScreenPixels=Math.max(s.maxScreenPixels,Math.hypot((a.x-b.x)*target.width/2,(a.y-b.y)*target.height/2));
   s.shakenFrames+=Number(view!==source);s.maxTranslation=Math.max(s.maxTranslation,f.effect.translation.length());s.maxRotation=Math.max(s.maxRotation,f.effect.rotation.length());s.maxSlots=Math.max(s.maxSlots,f.effect.slots.filter(x=>x.active).length);s.maxBlur=Math.max(s.maxBlur,this.composite.uniforms.uImpactBlurBlend.value);s.maxBlurPixels=Math.max(s.maxBlurPixels,this.composite.uniforms.uImpactBlurPixels.value);
   return result;
  };
  a.effect.quad.render=function(renderer){const result=q.originalQuad.apply(this,arguments);if(q.step){const gl=renderer.getContext(),p=renderer.properties.get(a.effect.composite).currentProgram,location=p?.program&&gl.getUniformLocation(p.program,'uImpactBlurBlend');if(location){const blend=gl.getUniform(p.program,location);q.steps[q.step].maxGpuBlur=Math.max(q.steps[q.step].maxGpuBlur,blend);if(q.step==='explosion'&&blend>(q.captureBlend||0)){q.captureBlend=blend;q.capture=renderer.domElement.toDataURL('image/png')}}}return result};
 })()`)
 // Verify the independent controls through the existing settings UI.
 await c.evaluate('window.dispatchEvent(new CustomEvent("ride-command",{detail:{pause:true}}))');await wait(150)
 await c.openSettings('Cámara FX')
 const controls=await c.evaluate(`(()=>{const panel=document.querySelector('[aria-label="Impactos de cámara"]'),boxes=[...panel.querySelectorAll('input[type=checkbox]')];const initial=boxes.map(b=>b.checked);boxes[1].click();const disabled=!__CAMERA_IMPACT__.state.snapshot().blurEnabled&&__CAMERA_IMPACT__.state.snapshot().shakeEnabled;boxes[1].click();return {initial,independentBlur:disabled&&__CAMERA_IMPACT__.state.snapshot().blurEnabled,sliders:panel.querySelectorAll('input[type=range]').length}})()`)
 assert.deepEqual(controls.initial,[true,true]);assert.equal(controls.independentBlur,true);assert.equal(controls.sliders,10)
 fs.writeFileSync(directory+'/settings.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await c.closeSettings();await c.evaluate('window.dispatchEvent(new CustomEvent("ride-command",{detail:{pause:true}}))');await wait(150)
 async function step(name,code,patch={}){
  await c.evaluate(`(()=>{const q=__CAMERA_IMPACT_QA__,f=__CAMERA_IMPACT__,d=__MOSPEADA__,r=d.runtime;f.state.set(${JSON.stringify(patch)});q.steps[${JSON.stringify(name)}]={frames:0,logicalUnchanged:true,shakenFrames:0,maxScreenPixels:0,maxTranslation:0,maxRotation:0,maxSlots:0,maxBlur:0,maxGpuBlur:0,maxBlurPixels:0};q.step=${JSON.stringify(name)};${code}})()`)
  await wait(1100)
  return c.evaluate(`__CAMERA_IMPACT_QA__.steps[${JSON.stringify(name)}]`)
 }
 const explosion=await step('explosion',`r.combatVFX.emit(q.near,true,null,'invidExplosion',1)`)
 const capture=await c.evaluate('__CAMERA_IMPACT_QA__.capture');if(capture)fs.writeFileSync(directory+'/violent-invid.png',Buffer.from(capture.split(',')[1],'base64'))
 const distant=await step('distant',`r.combatVFX.emit(q.far,true,null,'invidExplosion',1)`)
 const contact=await step('hostile-contact',`r.combatVFX.enemyImpact(q.near)`)
 const ground=await step('orb-ground',`r.combatVFX.enemyWorldImpact(q.near)`)
 const scenery=await step('scenery-explosion',`r.combatVFX.emit(q.near,true,null,'invidExplosion',.25,{cameraShake:false})`)
 const direct=await step('direct-hit',`r.gallant.receiveHit(1,q.near)`)
 const blur=await step('direct-with-blur',`r.gallant.receiveHit(1,q.near)`,{blurEnabled:true})
 const blurOnly=await step('blur-only',`r.combatVFX.emit(q.near,true,null,'invidExplosion',1)`,{shakeEnabled:false})
 const disabled=await step('disabled',`r.gallant.receiveHit(1,q.near)`,{blurEnabled:false})
 const paused=await step('paused',`r.paused=true;f.events.emit('explosion',q.near)`,{shakeEnabled:true})
 const resumed=await step('resumed',`r.paused=false`)
 const reset=await step('restart',`f.events.emit('explosion',q.near);d.reset('highway')`)
 const report=await c.evaluate(`(()=>{const a=__ANIME__,f=__CAMERA_IMPACT__,q=__CAMERA_IMPACT_QA__,gl=a.renderer.getContext();return {steps:q.steps,events:q.events,glError:gl.getError(),badPrograms:a.renderer.info.programs.filter(p=>p.program&&!gl.getProgramParameter(p.program,gl.LINK_STATUS)).length,shaderError:a.state.snapshot().error,blurFocus:a.effect.composite.uniforms.uImpactBlurFocus.value.toArray()}})()`)
 fs.writeFileSync(directory+'/last-run.json',JSON.stringify({controls,...report},null,2)+'\n')
 for(const s of Object.values(report.steps)){assert.ok(s.frames>0);assert.equal(s.logicalUnchanged,true);assert.ok(s.maxTranslation<=CAMERA_IMPACT_LIMITS.translation*cameraImpactState.defaults.explosionPower);assert.ok(s.maxRotation<=CAMERA_IMPACT_LIMITS.rotation*cameraImpactState.defaults.explosionPower);assert.ok(s.maxSlots<=4)}
 assert.ok(explosion.maxScreenPixels>35,'Invid destruction must deliver a deliberately violent shake')
 assert.equal(explosion.maxBlurPixels,72);assert.equal(direct.maxBlurPixels,18);assert.equal(scenery.maxBlurPixels,18)
 assert.ok(explosion.shakenFrames>0,'An Invid explosion did not reach the presentation camera')
 for(const s of [contact,ground,scenery,direct,blur,distant,blurOnly,disabled,paused,resumed,reset])assert.equal(s.shakenFrames,0)
 assert.ok(explosion.maxBlur>.1&&explosion.maxGpuBlur>.1);assert.ok(blur.maxBlur>0&&blur.maxGpuBlur>0);assert.ok(blurOnly.maxGpuBlur>0);assert.equal(disabled.maxBlur,0)
 assert.ok(report.events.includes('directHit')&&report.events.includes('explosion')&&!report.events.includes('enemyImpact'))
 assert.equal(report.glError,0);assert.equal(report.badPrograms,0);assert.equal(report.shaderError,'')
 fs.writeFileSync(directory+'/validation.json',JSON.stringify({controls,...report},null,2)+'\n')
 console.log(JSON.stringify({controls,steps:report.steps,glError:report.glError,badPrograms:report.badPrograms},null,2))
}finally{
 await c.evaluate(`(()=>{const q=window.__CAMERA_IMPACT_QA__;if(!q)return;__ANIME__.effect.drawSceneTarget=q.originalDraw;__ANIME__.effect.quad.render=q.originalQuad;__CAMERA_IMPACT__.events.emit=q.originalEmit;__CAMERA_IMPACT__.state.reset();__CAMERA_IMPACT__.events.clear();__MOSPEADA__.runtime.paused=false;__MOSPEADA__.reset('highway');delete window.__CAMERA_IMPACT_QA__})()`).catch(()=>{})
 c.close()
}
