import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

// Run validate-invid-secondary-explosions.mjs first. This records the same
// real level, live Scouts, native health and Gallant destruction callbacks.
const c=await connect({port:9334}),ev=code=>c.evaluate(code),dir=process.env.MOSPEADA_EXPLOSION_ARTIFACTS||'artifacts/invid-secondary-explosions'
try{
 await ev(`(()=>{const q=__SECONDARY_QA__,d=__MOSPEADA__,s=d.runtime.state;
  q.prepare=()=>{q.p.reset();q.p.phase='active';q.p.time=10;q.p.previousPlayer.set(s.x,s.height,s.z);q.fx.clear(true);q.fx.previousTime=10;
   for(const r of q.p.scouts){const x=s.x+(r.id-2)*5,z=s.z-16-(r.id%2)*3;r.position.set(x,d.sample(x,z)+3,z);r.meleeEnabled=true;r.yaw=0;r.pitch=r.bank=0;r.cooldown=Infinity;r.view.root.visible=true;q.p.applyView(r);r.view.motion?.update(r,.016,d.sample);r.view.motion?.sync()}}
  q.prepare();q.defeat(2);q.step(.45);return true})()`)
 const smokePixels=await ev(`(()=>{const a=__ANIME__,fx=__SECONDARY_QA__.fx.secondaryExplosion,g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight,read=()=>{a.effect.render(a.state.snapshot(),1);const p=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return p};const on=read();fx.smoke.visible=false;const off=read();fx.smoke.visible=true;let changed=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>6)changed++;return changed})()`)
 assert.ok(smokePixels>15,'The new short trails visibly contribute in the real gameplay frame')
 await ev(`(()=>{const q=__SECONDARY_QA__;q.prepare();for(const id of [0,1,2,3,4])for(let i=0;i<15;i++){q.hit(id);q.step(.24)}q.step(.5);return true})()`)
 await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const result=await ev(`(async()=>{
  const q=__SECONDARY_QA__,a=__ANIME__,stream=a.renderer.domElement.captureStream(30),parts=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:4500000}),events=[{at:.15,id:2},{at:2.1,id:0},{at:2.4,id:1},{at:2.7,id:3},{at:3,id:4}];
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};recorder.start();
  let elapsed=0,last=performance.now(),peakFragments=0,peakSmoke=0,kills=0;
  await new Promise((resolve,reject)=>{function frame(now){try{const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;elapsed+=dt;while(events.length&&elapsed>=events[0].at){const e=events.shift(),result=q.hit(e.id);if(!result.dead)throw Error('Recorded hit did not destroy the prepared live Scout');kills++}q.step(dt);peakFragments=Math.max(peakFragments,q.fx.secondaryExplosion.hot.count);peakSmoke=Math.max(peakSmoke,q.fx.secondaryExplosion.ribbons.count);a.effect.render(a.state.snapshot(),1);if(elapsed<6.2)requestAnimationFrame(frame);else resolve()}catch(error){reject(error)}}requestAnimationFrame(frame)});
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(parts,{type:'video/webm'}),data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
  return{data,elapsed,kills,peakFragments,peakSmoke,gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error}
 })()`)
 fs.writeFileSync(`${dir}/gameplay-smoke-ribbons.webm`,Buffer.from(result.data,'base64'));delete result.data
 assert.equal(result.kills,5);assert.equal(result.gl,0);assert.equal(result.shader,'');assert.ok(result.peakFragments<=104&&result.peakSmoke<=16)
 const report={...result,smokeVisiblePixels:smokePixels};fs.writeFileSync(`${dir}/video-validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{c.close()}
