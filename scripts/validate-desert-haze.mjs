import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect(),ev=code=>c.evaluate(code),dir='artifacts/desert-haze',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=180){for(let i=0;i<seconds*4;i++){if(await ev(code).catch(()=>false))return;await wait(250)}throw Error('Timed out: '+code)}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
 await until('!!window.__MOSPEADA__?.runtime.scottInstance&&!!window.__FOREST_STAGE4__?.haze&&!document.querySelector("#entry-preloader")')
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();w.updateClimax(3000,3055);r.resetAt(w.startAt(900));r.pendingDefeatRetry=true;r.paused=false;return true})()`)
 await until('!!__DESERT_SCOUTS__.climax&&__DESERT_SCOUTS__.sequence.phase==="battle"&&!__MOSPEADA__.runtime.pendingDefeatRetry')
 await ev(`(async()=>{const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world,{createBikeState}=await import('/src/vehicle/bikePhysics.js');r.paused=true;r.combatVFX?.clear();for(let i=0;i<40;i++)w.updateClimax(3000,3055);Object.assign(r.state,createBikeState(w.startAt(3000),d.rig.metrics,d.sample));r.randEscape.resumeClimax(r.state,w);r.randEscape.protected=true;d.setCameraMode(0);r.cameraController.reset(r.state);return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))))')
 // Put existing living Scouts into the immediate combat strip for a contrast
 // comparison. No new models or mountain stand-ins are added to the scene.
 await ev(`(()=>{const d=__MOSPEADA__,p=__DESERT_SCOUTS__.climax,s=d.runtime.state;for(let i=0;i<5;i++){const r=p.scouts[i],x=s.x+[-25,-12,8,22,35][i],z=s.z-45-i*8;r.position.set(x,d.sample(x,z)+3,z);r.yaw=0;r.pitch=r.bank=0;r.view.root.visible=true;p.applyView(r);r.view.motion?.update(r,.016,d.sample);r.view.motion?.sync()}return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const report=await ev(`(()=>{
  const d=__MOSPEADA__,a=__ANIME__,h=__FOREST_STAGE4__.haze,w=__FOREST_STAGE4__.world,scene=d.scene,camera=d.camera,renderer=a.renderer,g=renderer.getContext(),W=g.drawingBufferWidth,H=g.drawingBufferHeight
  const sky=h.color.clone().set('#9bcfec'),skies=[],skyMeshes=[];scene.traverse(o=>{const u=o.material?.uniforms;if(u?.uIllustratedClear){skyMeshes.push({mesh:o,position:o.position.clone()});if(u.uIllustratedClear.value===1)skies.push(u)}})
  const draw=()=>{a.effect.render(a.state.snapshot(),1);const pixels=new Uint8Array(W*H*4);g.readPixels(0,0,W,H,g.RGBA,g.UNSIGNED_BYTE,pixels);return{pixels,image:renderer.domElement.toDataURL()}}
  const haze=enabled=>{h.restore(scene);if(enabled)h.update(scene,w,3000,1,sky);for(const u of skies){u.uHazeStrength.value=h.horizon.strength;u.uHazeColor.value.copy(h.horizon.color);u.uHazeHeight.value=h.horizon.height}}
  const compare=()=>{haze(false);const before=draw();haze(true);const after=draw();let foreground=0,count=0,background=0,bgCount=0
   for(let y=50;y<300;y++)for(let x=440;x<840;x++){const k=(y*W+x)*4;for(let c=0;c<3;c++)foreground+=Math.abs(before.pixels[k+c]-after.pixels[k+c]);count+=3}
   for(let y=H-300;y<H-230;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;for(let c=0;c<3;c++)background+=Math.abs(before.pixels[k+c]-after.pixels[k+c]);bgCount+=3}
   return{before:before.image,after:after.image,foregroundDifference:foreground/count,horizonDifference:background/bgCount}}
  const forward=compare(),saved={p:camera.position.clone(),q:camera.quaternion.clone()}
  camera.position.set(d.runtime.state.x,d.runtime.state.height+7,d.runtime.state.z-12);camera.lookAt(d.runtime.state.x,d.runtime.state.height+5,d.runtime.state.z+1000);camera.updateMatrixWorld(true)
  for(const item of skyMeshes)item.mesh.position.copy(camera.position)
  haze(true);const continuousTerrain=draw().image
  camera.position.set(d.runtime.state.x,d.runtime.state.height+12,d.runtime.state.z-1200);camera.lookAt(d.runtime.state.x,d.runtime.state.height+5,d.runtime.state.z+1000);camera.updateMatrixWorld(true)
  for(const item of skyMeshes)item.mesh.position.copy(camera.position)
  const mountains=compare();camera.position.copy(saved.p);camera.quaternion.copy(saved.q);camera.updateMatrixWorld(true);for(const item of skyMeshes)item.mesh.position.copy(item.position)
  const result={forward,mountains,continuousTerrain,fog:{type:scene.fog.isFog?'Fog':'FogExp2',distanceHaze:!!scene.fog.desertHaze,start:scene.fog.near,end:scene.fog.far,color:scene.fog.color.getHexString(),blur:scene.fog.desertHaze?.blur},clip:camera.far,outline:{linear:a.effect.composite.uniforms.uFogLinear.value,range:a.effect.composite.uniforms.uFogRange.value.toArray()},gl:g.getError(),shader:a.state.snapshot().error}
  haze(false);h.update(scene,w,2000,1,sky);result.earlierDesertFog=scene.fog.isFogExp2?'FogExp2':'Fog';haze(true);return result
 })()`)
 for(const view of ['forward','mountains'])for(const variant of ['before','after']){fs.writeFileSync(`${dir}/${view}-${variant}.png`,Buffer.from(report[view][variant].split(',')[1],'base64'));delete report[view][variant]}
 fs.writeFileSync(`${dir}/continuous-terrain.png`,Buffer.from(report.continuousTerrain.split(',')[1],'base64'));delete report.continuousTerrain
 console.log(JSON.stringify(report,null,2))
 assert.equal(report.fog.type,'FogExp2');assert.ok(report.fog.distanceHaze);assert.equal(report.fog.start,850);assert.equal(report.fog.end,3500);assert.ok(report.fog.end<report.clip)
 assert.equal(report.earlierDesertFog,'FogExp2');assert.equal(report.outline.linear,1);assert.deepEqual(report.outline.range,[850,3500])
 assert.ok(report.forward.foregroundDifference<.5,'Foreground retains contrast');assert.ok(report.forward.horizonDifference>1,'Horizon changes visibly')
 assert.equal(report.gl,0);assert.equal(report.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n')
}finally{await ev('if(window.__MOSPEADA__)__MOSPEADA__.runtime.paused=true;true').catch(()=>{});c.close()}
