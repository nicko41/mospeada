import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const directory='artifacts/scott-v3/undersuit/ingame';fs.mkdirSync(directory,{recursive:true})
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9333)}),wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
 const until=Date.now()+180000
 while(!await c.evaluate('!!window.__MOSPEADA__?.runtime.scottInstance?.shooterPose && !!window.__ANIME__?.state.snapshot().ready')){
  if(Date.now()>until)throw Error('Game renderer not ready');await wait(500)
 }
 await c.evaluate(`(()=>{
  const d=window.__MOSPEADA__,r=d.runtime,c=r.gallant,v=r.scottInstance.modelComparison.v3;
  window.__UNDERSUIT_QA__={settings:v.undersuit.settings,shotsBefore:c.shots};
  r.paused=false;r.keys={};d.setCameraMode(3);r.state.speed=0;r.state.idleBlend=0;
  c.bikeCamera.update=()=>false;
  r.scottInstance.shooterPose.random=()=>1;
  c.raycaster.setFromCamera=function(){
   r.scottInstance.bones.get('mixamorigRightArm').getWorldPosition(this.ray.origin);
   this.ray.direction.copy(d.rig.root.localToWorld(this.ray.direction.clone().set(-15,12,3))).sub(this.ray.origin).normalize();return this;
  };
  c.aimInput.press(r.state);c.firing=true;
 })()`)
 await wait(1800)
 const firing=await c.evaluate('({aiming:__MOSPEADA__.runtime.gallant.aiming,blend:__MOSPEADA__.runtime.scottInstance.shooterPose.blend,shots:__MOSPEADA__.runtime.gallant.shots-__UNDERSUIT_QA__.shotsBefore})')
 assert.equal(firing.aiming,true);assert.ok(firing.blend>.98);assert.ok(firing.shots>0)
 const captures=[]
 for(const [view,z]of [['front',.85],['rear',-.85]]){
  await c.evaluate(`(()=>{
   const d=__MOSPEADA__,r=d.runtime,v=r.scottInstance.modelComparison.v3,p=d.camera.position.clone();r.gallant.firing=false;
   v.retarget.bones.get('RightArm').getWorldPosition(p);
   const chest=v.retarget.bones.get('Spine2'),out=p.clone().sub(chest.getWorldPosition(d.camera.position.clone()));out.y=0;out.normalize();
   const forward=d.camera.position.clone().set(0,0,1).applyQuaternion(chest.getWorldQuaternion(chest.quaternion.clone()).multiply(v.retarget.targetBind.get('Spine2').rotation.clone().invert()));
   forward.y=0;forward.normalize();
   d.camera.position.copy(p).addScaledVector(out,.5).addScaledVector(forward,${z});d.camera.position.y+=.08;r.orbit.target.copy(p);r.orbit.update();d.camera.zoom=1.15;d.camera.updateProjectionMatrix();
  })()`)
  for(const [name,enabled]of [['extended-before',false],['extended-after',true]]){
   await c.evaluate(`__UNDERSUIT_QA__.settings.enabled=${enabled}`);await wait(500)
   assert.ok(await c.evaluate(`__MOSPEADA__.runtime.scottInstance.modelComparison.v3.undersuit.meshes.every(m=>m.visible===${enabled})`),'Before/after toggle did not reach the live meshes')
   const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${directory}/${name}-${view}.png`,Buffer.from(shot.data,'base64'));captures.push(name+'-'+view)
  }
 }
 const extendedMorph=await c.evaluate('__MOSPEADA__.runtime.scottInstance.modelComparison.v3.undersuit.meshes[1].morphTargetInfluences[0]');assert.ok(extendedMorph>.95)
 await c.evaluate('__MOSPEADA__.runtime.gallant.aimInput.clear()');await wait(1200)
 const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${directory}/normal-after.png`,Buffer.from(shot.data,'base64'))
 const report=await c.evaluate(`(()=>{
  const d=__MOSPEADA__,v=d.runtime.scottInstance.modelComparison.v3,gl=__ANIME__.renderer.getContext();
  return {nativeBones:v.skins[0].mesh.skeleton.bones.length,meshes:v.undersuit.meshes.map(m=>({name:m.name,visible:m.visible,tuck:m.morphTargetInfluences[0],triangles:m.geometry.index.count/3,sameSkeleton:m.skeleton===v.skins[0].mesh.skeleton,sameAlbedo:m.material.map===v.skins[0].original.map})),glError:gl.getError(),badPrograms:__ANIME__.renderer.info.programs.filter(p=>p.program&&!gl.getProgramParameter(p.program,gl.LINK_STATUS)).length};
 })()`)
 assert.equal(report.glError,0);assert.equal(report.badPrograms,0);assert.equal(report.nativeBones,28)
 assert.ok(report.meshes.every(m=>m.visible&&m.sameSkeleton&&m.sameAlbedo))
 assert.ok(report.meshes.every(m=>m.tuck===0))
 fs.writeFileSync(`${directory}/validation.json`,JSON.stringify({firing,extendedMorph,captures,...report},null,2)+'\n');console.log(JSON.stringify({firing,extendedMorph,...report},null,2))
}finally{c.close()}
