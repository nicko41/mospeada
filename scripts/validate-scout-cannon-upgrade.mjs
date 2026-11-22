import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

// The shared ride validation also checks the larger Scout dust against both
// bikes, its suspended tail, and the fixed pool with thirty ground shadows.
await import('./validate-scout-shadows-desert-trails.mjs')
const c=await connect(),dir='artifacts/scout-cannon-upgrade'
fs.mkdirSync(dir,{recursive:true})
try{
 const report=await c.evaluate(`(()=>{
  const q=__TRAIL_SHADOW_QA__,d=__MOSPEADA__,a=__ANIME__,T=q.T,fx=d.runtime.combatVFX,s=q.scout;
  q.reset();s.yaw=.25;s.position.y=d.sample(s.position.x,s.position.z)+1.5;q.p.applyView(s);s.view.motion.sync();
  d.runtime.orbit.target.copy(s.position).add(new T.Vector3(0,3,0));d.camera.position.copy(s.position).add(new T.Vector3(7,5,15));d.runtime.orbit.update();d.camera.fov=44;d.camera.updateProjectionMatrix();d.camera.updateMatrixWorld(true);
  const weapon={root:{visible:false}},g=a.renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight;
  const render=()=>{for(const squad of __DESERT_SCOUTS__.squads)q.renderScoutSquad(squad,d.camera.position,fx);fx.update(0,q.p,weapon,d.camera);a.effect.render(a.state.snapshot(),1)};
  const read=()=>{const pixels=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,pixels);return pixels};
  fx.clear();s.charging=false;s.cannonFlash.fill(0);render();const off=read(),offImage=a.renderer.domElement.toDataURL();
  const pulses=[];
  for(const side of [0,1]){s.cannonFlash.fill(0);s.cannonFlash[side]=.13;s.side=1-side;render();const on=read();let changed=0,brighter=0;for(let i=0;i<on.length;i+=4){const delta=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2];if(Math.abs(delta)>8)changed++;if(delta>15)brighter++}pulses.push({side,changed,brighter,cores:fx.cannonFlashes.count,halos:fx.cannonHalos.count,image:a.renderer.domElement.toDataURL()})}
  const geometry=fx.cannonHalos.geometry,material=fx.cannonHaloMaterial,buffer=fx.cannonHalos.instanceMatrix,memory={...a.renderer.info.memory},programs=a.renderer.info.programs.length;
  const stress={active:true,time:1,bolts:[],scouts:Array.from({length:30},()=>({dead:false,charging:false,cannonFlash:[.13,.1],view:s.view}))};
  for(let i=0;i<120;i++)fx.update(1/60,stress,weapon,d.camera);a.effect.render(a.state.snapshot(),1);
  const resources={halos:fx.cannonHalos.count,reused:geometry===fx.cannonHalos.geometry&&material===fx.cannonHaloMaterial&&buffer===fx.cannonHalos.instanceMatrix,geometries:a.renderer.info.memory.geometries-memory.geometries,textures:a.renderer.info.memory.textures-memory.textures,programs:a.renderer.info.programs.length-programs,gl:g.getError(),shader:a.state.snapshot().error};
  q.p.reset();const target=q.p.scouts[0];target.meleeEnabled=true;for(let i=0;i<15;i++)q.p.receiveHit(target);const before={hits:target.hits,health:target.health,dead:target.dead};q.p.receiveHit(target);const after={hits:target.hits,health:target.health,dead:target.dead};q.p.reset();q.reset();render();
  return{offImage,pulses,resources,before,after};
 })()`)
 fs.writeFileSync(`${dir}/01-no-cannon-pulse.png`,Buffer.from(report.offImage.split(',')[1],'base64'));delete report.offImage
 for(const pulse of report.pulses){fs.writeFileSync(`${dir}/0${pulse.side+2}-barrel-${pulse.side}-glow.png`,Buffer.from(pulse.image.split(',')[1],'base64'));delete pulse.image;assert.ok(pulse.brighter>200);assert.equal(pulse.cores,1);assert.equal(pulse.halos,1)}
 assert.deepEqual(report.before,{hits:15,health:1,dead:false});assert.deepEqual(report.after,{hits:16,health:0,dead:true})
 assert.equal(report.resources.halos,60);assert.ok(report.resources.reused);assert.equal(report.resources.geometries,0);assert.equal(report.resources.textures,0);assert.equal(report.resources.programs,0);assert.equal(report.resources.gl,0);assert.equal(report.resources.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{c.close()}
