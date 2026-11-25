import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

// Run against the same local server used for gameplay. Only a separate
// debugger-controlled test tab is reset; no personal browser is accessed.
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9345)}),wait=ms=>new Promise(r=>setTimeout(r,ms))
const directory='artifacts/boost-camera/native-input';fs.mkdirSync(directory,{recursive:true})
const key=(code,down)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='KeyW'?'w':'Shift',windowsVirtualKeyCode:code==='KeyW'?87:16})
try{
 if(process.argv.includes('--user-server'))await c.send('Page.navigate',{url:'http://localhost:5173/?environment=highway'})
 const deadline=Date.now()+180000
 while(!await c.evaluate(`!!window.__BOOST_CAMERA__&&!!window.__ANIME__?.state.snapshot().ready&&!!window.__MOSPEADA__?.runtime.combatVFX&&!document.querySelector('#entry-preloader')${process.argv.includes('--user-server')?"&&location.origin==='http://localhost:5173'":''}`)){
  if(Date.now()>deadline)throw Error('Test game did not become ready');await wait(500)
 }
 await c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,a=__ANIME__;d.reset('highway');d.setCameraMode(0);__BOOST_CAMERA__.state.reset();__CAMERA_IMPACT__.state.reset();
  const q=window.__NATIVE_FX_QA__={original:a.effect.drawSceneTarget,frames:0,maxFov:0,maxBlur:0,maxShake:0,sourceUnchanged:true,boostCount:0,phase:'boost'};
  a.effect.drawSceneTarget=function(target,view){if(target!==this.target)return q.original.apply(this,arguments);
   const source=d.camera,pose=JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.projectionMatrix.toArray(),r.state]);
   const result=q.original.apply(this,arguments);q.sourceUnchanged&&=pose===JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.projectionMatrix.toArray(),r.state]);q.frames++;
   q.maxFov=Math.max(q.maxFov,view.fov-source.fov);q.maxBlur=Math.max(q.maxBlur,this.composite.uniforms.uBoostBlurStrength.value);q.boostCount=r.state.boostCount;
   if(q.phase==='explosion'){const point=source.getWorldDirection(source.position.clone()).multiplyScalar(50).add(source.position),a=point.clone().project(source),b=point.clone().project(view);q.maxShake=Math.max(q.maxShake,Math.hypot((a.x-b.x)*target.width/2,(a.y-b.y)*target.height/2))}
   return result;
  };
 })()`)
 await c.send('Page.bringToFront');await key('KeyW',true);await wait(3500)
 const before=await c.evaluate('__MOSPEADA__.runtime.state.speed')
 await key('ShiftLeft',true);await wait(350)
 fs.writeFileSync(directory+'/boost.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 await key('ShiftLeft',false);await wait(1000);await key('KeyW',false)
 const boost=await c.evaluate(`({speed:__MOSPEADA__.runtime.state.speed,maxFov:__NATIVE_FX_QA__.maxFov,maxBlur:__NATIVE_FX_QA__.maxBlur,count:__NATIVE_FX_QA__.boostCount})`)
 assert.ok(before>0,'Native throttle did not reach physics');assert.equal(boost.count,1,'Native Shift did not start a boost');assert.ok(boost.maxFov>.5&&boost.maxBlur>.04,'Native gameplay did not produce perceptible boost effects')
 await c.evaluate(`__MOSPEADA__.reset('highway')`);await wait(300)
 await c.evaluate(`(async()=>{const d=__MOSPEADA__,r=d.runtime;__NATIVE_FX_QA__.phase='explosion';const {sampleImpactPlayer}=await import('/src/rendering/cameraImpactGameplay.js');const point=sampleImpactPlayer(r,d.camera.position.clone());point.x+=2;r.combatVFX.emit(point,true,null,'invidExplosion',1)})()`);await wait(500)
 const report=await c.evaluate('({url:location.href,frames:__NATIVE_FX_QA__.frames,maxShakePixels:__NATIVE_FX_QA__.maxShake,unchanged:__NATIVE_FX_QA__.sourceUnchanged,shaderError:__ANIME__.state.snapshot().error,boostConfig:__BOOST_CAMERA__.state.snapshot(),impactConfig:__CAMERA_IMPACT__.state.snapshot()})')
 fs.writeFileSync(directory+'/last-run.json',JSON.stringify({before,boost,...report},null,2)+'\n')
 assert.ok(report.maxShakePixels>5,'High-intensity explosion must be unmistakable in the follow camera');assert.equal(report.unchanged,true);assert.equal(report.shaderError,'')
 fs.writeFileSync(directory+'/validation.json',JSON.stringify({before,boost,...report},null,2)+'\n');console.log(JSON.stringify({before,boost,...report},null,2))
}finally{
 await key('ShiftLeft',false).catch(()=>{});await key('KeyW',false).catch(()=>{});
 await c.evaluate(`(()=>{const q=window.__NATIVE_FX_QA__;if(!q)return;__ANIME__.effect.drawSceneTarget=q.original;__MOSPEADA__.reset('highway');delete window.__NATIVE_FX_QA__})()`).catch(()=>{});c.close()
}
