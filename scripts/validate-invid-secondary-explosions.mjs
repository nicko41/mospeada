import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect({port:9334}),ev=code=>c.evaluate(code),dir='artifacts/invid-secondary-explosions',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=120){for(let i=0;i<seconds*4;i++){if(await ev(code).catch(()=>false))return;await wait(250)}throw Error('Timed out: '+code)}
async function frames(n=3){await ev(`new Promise(resolve=>{let n=${n};const tick=()=>{if(--n)requestAnimationFrame(tick);else resolve(true)};requestAnimationFrame(tick)})`)}
async function capture(name){await frames(2);const url=await ev(`(()=>{const a=__ANIME__;a.effect.render(a.state.snapshot(),1);return a.renderer.domElement.toDataURL('image/png')})()`);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))}
try{
 await until('!!window.__MOSPEADA__?.runtime.combatVFX?.secondaryExplosion&&!!window.__FOREST_STAGE4__&&!document.querySelector("#entry-preloader")&&window.__ANIME__?.state.snapshot().ready')
 await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});d.runtime.resetAt(w.startAt(900));d.runtime.paused=true;return true})()`)
 await frames(5)
 await ev(`(async()=>{const T=await import('/node_modules/.vite/deps/three.js'),{GallantHitscan}=await import('/src/vehicle/GallantShot.js'),d=__MOSPEADA__,s=d.runtime.state,p=__DESERT_SCOUTS__.opening,fx=d.runtime.combatVFX;
  p.reset();p.phase='active';p.time=10;p.previousPlayer.set(s.x,s.height,s.z);fx.clear(true);fx.previousTime=10;
  for(const r of p.scouts){const x=s.x+(r.id-2)*5,z=s.z-16-(r.id%2)*3;r.position.set(x,d.sample(x,z)+3,z);r.meleeEnabled=true;r.yaw=0;r.pitch=r.bank=0;r.cooldown=Infinity;r.view.root.visible=true;p.applyView(r);r.view.motion?.update(r,.016,d.sample);r.view.motion?.sync()}
  d.setCameraMode(3);d.runtime.orbit.enableDamping=false;d.runtime.orbit.target.set(s.x,s.height+3.5,s.z-12);d.camera.position.set(s.x+6,s.height+6,s.z+4);d.runtime.orbit.update();
  const q=window.__SECONDARY_QA__={T,p,fx,weapon:d.runtime.gallant.weapon,query:new GallantHitscan(),muzzle:new T.Vector3(),ray:new T.Ray()};
  q.step=seconds=>{for(let t=0;t<seconds;t+=1/120){const dt=Math.min(1/120,seconds-t);__MOSPEADA_VFX__.vfx.update(dt);fx.update(dt,p,q.weapon,d.camera)}};
  q.hit=id=>{const target=p.scouts[id];q.weapon.getMuzzle(q.muzzle);q.ray.origin.copy(q.muzzle);q.ray.direction.copy(target.position).add(new T.Vector3(0,target.height*.5,0)).sub(q.muzzle).normalize();const result=q.query.fire(q.ray);if(result.hit!==target)throw Error('Gallant did not hit the live Scout '+id);fx.shot(q.weapon,result,p);fx.update(0,p,q.weapon,d.camera);return{hits:target.hits,dead:target.dead,explosions:fx.stats.explosions}};
  q.defeat=id=>{let result;for(let i=0;i<16;i++){result=q.hit(id);if(i<15)for(let j=0;j<30;j++)q.step(.008)}return result};
  return true})()`)
 await frames()
 const report={}
 report.death=await ev('__SECONDARY_QA__.defeat(2)');assert.equal(report.death.hits,16);assert.equal(report.death.dead,true);assert.equal(report.death.explosions,1)
 await ev('__SECONDARY_QA__.step(.24);true');await capture('01-fast-radial-burst')
 report.initial=await ev(`(()=>{const f=__SECONDARY_QA__.fx.secondaryExplosion;return{...f.stats,settings:{...f.settings},active:f.records.filter(r=>r.age<r.life).map(r=>({fragments:r.fragments,trails:r.trails,age:r.age,life:r.life}))}})()`)
 assert.ok(report.initial.fragments>=16&&report.initial.fragments<=26);assert.ok(report.initial.smoke>0)
 // Compare actual rendered pixels with only the two new batches hidden.
 report.visiblePixels=await ev(`(()=>{const a=__ANIME__,fx=__SECONDARY_QA__.fx.secondaryExplosion,g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight,read=()=>{a.effect.render(a.state.snapshot(),1);const p=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return p};const on=read();fx.root.visible=false;const off=read();fx.root.visible=true;let count=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>8)count++;return count})()`)
 assert.ok(report.visiblePixels>30,'The new secondary fragments are visible in the gameplay render')
 await ev('__SECONDARY_QA__.step(.18);true');await capture('02-short-smoke-trails')
 await ev('__SECONDARY_QA__.step(.46);true');await capture('03-smoke-after-the-flash')
 report.tail=await ev('({...__SECONDARY_QA__.fx.secondaryExplosion.stats})');assert.equal(report.tail.fragments,0);assert.ok(report.tail.smoke>0)
 await ev('__SECONDARY_QA__.step(.8);true')
 // Prepare actual living enemies one shot short of destruction, using their
 // normal 16-hit health and real Gallant queries, for an overlapping volley.
 await ev(`(()=>{const q=__SECONDARY_QA__;for(const id of [0,1,3,4])for(let i=0;i<15;i++){q.hit(id);q.step(.24)}q.step(.8);q.fx.secondaryExplosion.clear();return true})()`)
 for(const id of [0,1,3,4])await ev(`__SECONDARY_QA__.hit(${id})`)
 await ev('__SECONDARY_QA__.step(.26);true');await capture('04-overlapping-destructions')
 report.simultaneous=await ev('({...__SECONDARY_QA__.fx.secondaryExplosion.stats})');assert.equal(report.simultaneous.activeBursts,4);assert.ok(report.simultaneous.fragments<=104&&report.simultaneous.smoke<=144)
 await ev('__SECONDARY_QA__.step(1.6);true');report.remaining=await ev('({...__SECONDARY_QA__.fx.secondaryExplosion.stats})');assert.equal(report.remaining.fragments+report.remaining.smoke,0)
 report.integrity=await ev(`(()=>{const a=__ANIME__,fx=__SECONDARY_QA__.fx;return{gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error,lights:fx.impacts.lights.length,borrowedSparkMap:fx.secondaryExplosion.hotMaterial.map===fx.impacts.haloTexture,borrowedSmokeMap:fx.secondaryExplosion.smokeMaterial.map===fx.impacts.smokeBallTexture}})()`)
 assert.equal(report.integrity.gl,0);assert.equal(report.integrity.shader,'');assert.equal(report.integrity.lights,2);assert.ok(report.integrity.borrowedSparkMap&&report.integrity.borrowedSmokeMap)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{c.close()}
