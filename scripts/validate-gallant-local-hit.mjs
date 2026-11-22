import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/gallant-local-hit',report={},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ev=code=>c.evaluate(code)
fs.mkdirSync(dir,{recursive:true})
async function capture(name){const url=await ev('__LOCAL_HIT_QA__.render();__ANIME__.renderer.domElement.toDataURL()');fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false})
 let ready=false
 for(let i=0;i<720;i++){
  const state=await ev('({ready:!!window.__MOSPEADA__?.runtime.combatVFX&&!!window.__DESERT_SCOUTS__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})').catch(()=>({}))
  if(state.error)throw Error(state.error);if(state.ready){ready=true;break}await wait(250)
 }
 assert.ok(ready,'Scene and new Scout shader are ready');console.log('Local hit scene ready')
 await ev(`(async()=>{
  window.__FOREST_OPENING__?.finish();const T=await import('/node_modules/.vite/deps/three.js'),{renderScoutSquad}=await import('/src/world/forest/scoutSquadRendering.js'),d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world
  if(!w.bound)w.bind({x:0,y:0,z:-2400});r.resetAt(w.startAt(900));r.paused=true
  window.__LOCAL_HIT_QA__={T,renderScoutSquad}
 })()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 await ev(`(()=>{
  const q=__LOCAL_HIT_QA__,d=__MOSPEADA__,r=d.runtime,T=q.T;q.p=__DESERT_SCOUTS__.patrol;q.fx=r.combatVFX;q.p.reset();q.p.phase='active';q.p.time=10;q.fx.clear(true);q.fx.previousTime=10
  q.target=q.p.scouts[2];const t=q.target;t.position.set(r.state.x,d.sample(r.state.x,r.state.z-14)+1,r.state.z-14);t.mode='flight';t.meleeEnabled=true;t.yaw=t.pitch=t.bank=0;t.view.root.visible=true;q.p.applyView(t);t.view.motion.reset();t.view.motion.update(t,1/60,d.sample)
  for(const other of q.p.scouts)if(other!==t)other.view.root.visible=false
  d.setCameraMode(3);r.orbit.maxDistance=100;r.orbit.target.copy(t.position).add(new T.Vector3(0,2.7,0));d.camera.position.copy(t.position).add(new T.Vector3(1.5,3.3,11));r.orbit.update();d.camera.fov=50;d.camera.updateProjectionMatrix()
  q.from=new T.Vector3();q.weapon={root:{visible:false},getMuzzle:p=>p.copy(q.from)}
  q.render=()=>{for(const squad of __DESERT_SCOUTS__.squads)q.renderScoutSquad(squad,d.camera.position,q.fx);__ANIME__.effect.render(__ANIME__.state.snapshot(),1)}
  q.advance=seconds=>{for(let time=0;time<seconds;time+=1/120){t.view.motion.update(t,1/120,d.sample);__MOSPEADA_VFX__.vfx.update(1/120);q.fx.update(1/120,q.p,q.weapon,d.camera)}q.render()}
  q.surface=joint=>{
   const mesh=t.view.levels[t.view.lod||0],g=mesh.geometry,index=g.index,j=g.attributes.skinIndex,n=g.attributes.normal,p=g.attributes.position,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),center=new T.Vector3(),best=new T.Vector3();let score=-Infinity
   for(let f=0;f<index.count;f+=3){const ia=index.getX(f),ib=index.getX(f+1),ic=index.getX(f+2);if(j.getX(ia)!==joint||j.getX(ib)!==joint||j.getX(ic)!==joint||(n.getZ(ia)+n.getZ(ib)+n.getZ(ic))/3<.15)continue;center.fromBufferAttribute(p,ia).add(b.fromBufferAttribute(p,ib)).add(c.fromBufferAttribute(p,ic)).divideScalar(3);const value=joint===1?center.x*3+center.z:joint===2?-center.x*3+center.z:joint>=3?-center.y*3+center.z:center.y+center.z;if(value>score){score=value;mesh.getVertexPosition(ia,a);mesh.getVertexPosition(ib,b);mesh.getVertexPosition(ic,c);best.copy(a).add(b).add(c).divideScalar(3)}}return mesh.localToWorld(best)
  }
  q.hit=joint=>{const point=q.surface(joint);q.from.copy(point).add(new T.Vector3(0,0,8));q.p.receiveHit(t,new T.Vector3(0,0,-1));q.fx.shot(q.weapon,{hit:t,point,destroyed:false},q.p);q.fx.update(0,q.p,q.weapon,d.camera);q.render();return{requested:joint,resolved:q.fx.contactJoint,health:t.health,lastReaction:t.view.motion.hitReaction.lastJoint,sprites:q.fx.impacts.hitSprites.count,glows:q.fx.impacts.hitGlows.count,stars:q.fx.contactFlashes.count+q.fx.impacts.rings.count,emissive:q.fx.scoutVisual(t).emissive,tint:q.fx.scoutVisual(t).tint.getHex()}}
  q.scorchDifference=()=>{const a=__ANIME__,g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight,read=()=>{q.render();const data=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,data);return data},marks=q.fx.scoutVisual(t).scorches,radii=marks.map(m=>m.radius),on=read();marks.forEach(m=>m.radius=0);const off=read();marks.forEach((m,i)=>m.radius=radii[i]);let dark=0;for(let i=0;i<on.length;i+=4)if(off[i]+off[i+1]+off[i+2]-on[i]-on[i+1]-on[i+2]>12)dark++;return dark}
  return true
 })()`)
 await capture('01-intact-invid')
 report.arm=await ev('__LOCAL_HIT_QA__.hit(1)');await ev('__LOCAL_HIT_QA__.advance(.055);true');await capture('02-left-arm-local-hit-and-reaction')
 assert.equal(report.arm.resolved,1);assert.equal(report.arm.lastReaction,1);assert.equal(report.arm.emissive,0);assert.equal(report.arm.tint,0xffffff);assert.equal(report.arm.stars,0);assert.ok(report.arm.sprites>0&&report.arm.glows>0)
 report.armPose=await ev('(()=>{const m=__LOCAL_HIT_QA__.target.view.motion;return {bodyYaw:m.body.rotation.y,leftArm:m.joints[1].rotation.x,rightArm:m.joints[2].rotation.x,bodyBack:m.body.position.z}})()')
 await ev('__LOCAL_HIT_QA__.advance(.6);true');report.armScorchPixels=await ev('__LOCAL_HIT_QA__.scorchDifference()');await capture('03-burn-mark-after-flash');assert.ok(report.armScorchPixels>15,'The actual material shows a local dark mark after the atlas/glow fade')
 report.leg=await ev('__LOCAL_HIT_QA__.hit(3)');await ev('__LOCAL_HIT_QA__.advance(.06);true');await capture('04-leg-local-hit-and-backward-reaction');assert.equal(report.leg.resolved,3);assert.equal(report.leg.lastReaction,3)
 report.attachment=await ev(`(()=>{const q=__LOCAL_HIT_QA__,r=q.fx.scoutVisual(q.target).hitRecord,old=r.position.clone(),matrix=new q.T.Matrix4();q.target.position.x+=2.5;q.p.applyView(q.target);q.advance(.055);const mesh=q.target.view.levels[0],expected=r.bindPoint.clone().applyMatrix4(q.target.view.motion.matrices[r.joint]).applyMatrix4(mesh.matrixWorld);return{distanceMoved:r.position.distanceTo(old),error:r.position.distanceTo(expected),sprite:q.fx.impacts.hitSprites.material.map.image.src,tint:q.fx.impacts.hitSprites.instanceColor.array.slice(0,3)}})()`)
 assert.ok(report.attachment.distanceMoved>2&&report.attachment.error<1e-5,'Impact follows the actual moving limb instead of its old world position');assert.ok(report.attachment.sprite.includes('impascto-invid-suelo'))
 await capture('05-impact-follows-moving-limb');await ev('__LOCAL_HIT_QA__.advance(.6);true');await capture('06-persistent-marks')
 const video=await ev(`(async()=>{const q=__LOCAL_HIT_QA__,a=__ANIME__,parts=[],stream=a.renderer.domElement.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:5000000});rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};const stopped=new Promise(resolve=>rec.onstop=resolve);rec.start();for(let frame=0;frame<110;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));if(frame===8)q.hit(1);if(frame===48)q.hit(3);if(frame===85)q.hit(2);q.advance(1/30)}rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(parts,{type:'video/webm'}))})})()`)
 fs.writeFileSync(`${dir}/local-hits-and-rig-reactions.webm`,Buffer.from(video,'base64'))
 report.resources=await ev(`(()=>{const q=__LOCAL_HIT_QA__,a=__ANIME__,renderer=a.renderer,g=renderer.info.memory.geometries,textures=renderer.info.memory.textures,programs=renderer.info.programs.length;for(let i=0;i<8;i++){q.target.dead=false;q.target.health=10;q.target.hits=0;q.target.meleeEnabled=true;q.target.state='IDLE';q.hit(i%2?1:3);q.advance(.3)}q.advance(.4);return{geometriesAdded:renderer.info.memory.geometries-g,texturesAdded:renderer.info.memory.textures-textures,programsAdded:renderer.info.programs.length-programs,scorchSlots:q.fx.scoutVisual(q.target).scorches.length,gl:renderer.getContext().getError(),shader:a.state.snapshot().error}})()`)
 assert.equal(report.resources.geometriesAdded,0);assert.equal(report.resources.texturesAdded,0);assert.equal(report.resources.programsAdded,0);assert.equal(report.resources.scorchSlots,4);assert.equal(report.resources.gl,0);assert.equal(report.resources.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={}};true').catch(()=>{});c.close()}
