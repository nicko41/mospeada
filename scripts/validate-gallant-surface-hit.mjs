import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/gallant-surface-hit',report={},ev=code=>c.evaluate(code),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
fs.mkdirSync(dir,{recursive:true})
async function capture(name,prepare=''){const url=await ev(`(()=>{${prepare};__ANIME__.effect.render(__ANIME__.state.snapshot(),1);return __ANIME__.renderer.domElement.toDataURL()})()`);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false})
 let ready=false
 for(let i=0;i<360;i++){if(await ev('!!window.__MOSPEADA__?.runtime.combatVFX?.surfaceMarks&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}await wait(250)}
 assert.ok(ready,'Surface marks are loaded in the full game')
 await ev(`(async()=>{
  window.__FOREST_OPENING__?.finish();const T=await import('/node_modules/.vite/deps/three.js'),{CRASH_TREE:t}=await import('/src/world/forest/forestCrashSite.js'),{forestPathX}=await import('/src/world/forest/forestLayout.js'),{GallantHitscan}=await import('/src/vehicle/GallantShot.js'),d=__MOSPEADA__,r=d.runtime
  r.resetAt({x:forestPathX(-20),z:-20,yaw:Math.PI});r.paused=true;d.setCameraMode(3)
  window.__SURFACE_QA__={T,t,forestPathX,fx:r.combatVFX,query:new GallantHitscan(),e:{active:true,time:10,bolts:[]},from:new T.Vector3(),point:new T.Vector3(),weapon:{root:{visible:false},getMuzzle:p=>p.copy(__SURFACE_QA__.from)}}
 })()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 await ev(`(()=>{
  const q=__SURFACE_QA__,d=__MOSPEADA__,r=d.runtime,T=q.T,t=q.t;q.fx.clear(true)
  q.arrange=kind=>{
   if(kind==='log'){const direction=new T.Vector3(...t.fallDirection).normalize();q.point.set(t.x+t.fallOffset[0],0,t.z+t.fallOffset[1]);q.point.y=d.sample(q.point.x,q.point.z)+.38;q.point.addScaledVector(direction,3);q.from.copy(q.point).add(new T.Vector3(-direction.z,0,direction.x).multiplyScalar(4.5));q.from.y+=1}
   else{const x=q.forestPathX(-40),z=-40;q.point.set(x,d.sample(x,z),z);q.from.copy(q.point).add(new T.Vector3(1,3.6,3.6))}
   r.orbit.enableDamping=false;r.orbit.target.copy(q.point);d.camera.position.copy(q.from).add(new T.Vector3(0,.5,.3));r.orbit.update();d.camera.fov=48;d.camera.updateProjectionMatrix();d.camera.updateMatrixWorld(true)
  }
  q.fire=()=>{const T=q.T,ray=new T.Ray(q.from.clone(),q.point.clone().sub(q.from).normalize()),result=q.query.fire(ray),start=performance.now();q.fx.shot(q.weapon,result,q.e);q.fx.update(0,q.e,q.weapon,d.camera);q.last={solid:result.solid,hit:!!result.hit,surface:q.fx.surfaceMarks.contact.object?.name||null,markCount:q.fx.surfaceMarks.mesh.count,sprites:q.fx.impacts.surfaceSprites.count,stars:q.fx.contactFlashes.count,rings:q.fx.impacts.rings.count,sparks:q.fx.systems[0].particleNum,cpuMs:performance.now()-start,texture:q.fx.impacts.surfaceSprites.material.map.image.src};return q.last}
  q.tick=seconds=>{for(let t=0;t<seconds;t+=1/120){__MOSPEADA_VFX__.vfx.update(1/120);q.fx.update(1/120,q.e,q.weapon,d.camera)}}
  q.markPixels=()=>{const a=__ANIME__,g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight,read=()=>{a.effect.render(a.state.snapshot(),1);const p=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return p},mesh=q.fx.surfaceMarks.mesh,on=read();mesh.visible=false;const off=read();mesh.visible=true;let dark=0;for(let i=0;i<on.length;i+=4)if(off[i]+off[i+1]+off[i+2]-on[i]-on[i+1]-on[i+2]>15)dark++;return dark}
  q.arrange('log');return true
 })()`)
 await capture('01-trunk-before-hit')
 await capture('02-yellow-trunk-impact','__SURFACE_QA__.fire();__SURFACE_QA__.tick(.07)')
 report.log=await ev('({...__SURFACE_QA__.last})');assert.ok(report.log.solid&&!report.log.hit);assert.ok(report.log.surface?.includes('fallen_tree'),'Mark resolves the real fallen tree mesh');assert.equal(report.log.stars,0);assert.equal(report.log.rings,0);assert.equal(report.log.sparks,0);assert.equal(report.log.sprites,1);assert.ok(report.log.texture.includes('impascto-invid-suelo'))
 await capture('03-trunk-burn-mark','__SURFACE_QA__.tick(.5)');report.log.markPixels=await ev('__SURFACE_QA__.markPixels()');assert.ok(report.log.markPixels>15,'Trunk scorch is visibly darker after the impact sheet fades')
 await capture('04-yellow-ground-impact',"__SURFACE_QA__.arrange('ground');__SURFACE_QA__.fire();__SURFACE_QA__.tick(.08)")
 report.ground=await ev('({...__SURFACE_QA__.last})');assert.ok(report.ground.solid&&!report.ground.hit);assert.ok(report.ground.surface);assert.equal(report.ground.stars,0)
 await capture('05-ground-burn-mark','__SURFACE_QA__.tick(.5)');report.ground.markPixels=await ev('__SURFACE_QA__.markPixels()');assert.ok(report.ground.markPixels>15)
 report.resources=await ev(`(()=>{const q=__SURFACE_QA__,a=__ANIME__,r=a.renderer,g=r.info.memory.geometries,t=r.info.memory.textures,p=r.info.programs.length,material=q.fx.surfaceMarks.material,buffer=q.fx.surfaceMarks.mesh.instanceMatrix,start=performance.now();for(let i=0;i<65;i++){q.fire();q.tick(.31)}a.effect.render(a.state.snapshot(),1);return{cpuMsPerShot:(performance.now()-start)/65,geometriesAdded:r.info.memory.geometries-g,texturesAdded:r.info.memory.textures-t,programsAdded:r.info.programs.length-p,markCount:q.fx.surfaceMarks.mesh.count,reused:material===q.fx.surfaceMarks.material&&buffer===q.fx.surfaceMarks.mesh.instanceMatrix,gl:r.getContext().getError(),shader:a.state.snapshot().error}})()`)
 assert.equal(report.resources.markCount,48);assert.ok(report.resources.reused);assert.equal(report.resources.geometriesAdded,0);assert.equal(report.resources.texturesAdded,0);assert.equal(report.resources.programsAdded,0);assert.equal(report.resources.gl,0);assert.equal(report.resources.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={}};true').catch(()=>{});c.close()}
