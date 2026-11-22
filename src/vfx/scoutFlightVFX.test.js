import test from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,Group,Matrix4,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,Vector3} from 'three'
import {DustTrail} from './DustTrail.js'
import {ScoutFlightVFX,SCOUT_FLIGHT_FX} from './ScoutFlightVFX.js'
import {VFXRuntime} from './VFXRuntime.js'

function fixture(count=1){
 const scene=new Scene(),runtime=new VFXRuntime(),base=runtime.register('bike',new DustTrail()),sample=(x,z,c)=>{if(c)c.biome='desert';return 0},fx=runtime.register('flight',new ScoutFlightVFX({shared:base,sampleGround:sample})),geometry=new BoxGeometry(),material=new MeshBasicMaterial(),camera=new PerspectiveCamera(),state={},patrol={scouts:[]},config={enabled:true,earthEnabled:true}
 scene.add(runtime.root);camera.position.set(0,5,-18);camera.lookAt(0,3,0);camera.updateMatrixWorld(true)
 for(let i=0;i<count;i++){const root=new Group(),mesh=new Mesh(geometry,material);root.add(mesh);scene.add(root);root.position.set((i%6-2)*3,2,Math.floor(i/6)*4);root.updateMatrixWorld(true);patrol.scouts.push({id:i,dead:false,mode:'flight',focus:i===0?'rand':'scott',yaw:0,health:10,position:root.position.clone(),velocity:new Vector3(0,0,-19),view:{root,levels:[mesh],motion:{matrices:[new Matrix4()]}}})}
 const step=(seconds,dt=1/60)=>{for(let t=0;t<seconds;t+=dt){fx.prepare(dt,patrol,camera,config,1,state);runtime.update(dt);fx.updateGlow(camera,patrol)}}
 return{scene,runtime,base,fx,camera,state,patrol,config,step,dispose(){runtime.dispose();geometry.dispose();material.dispose()}}
}
test('low Scouts lift sand ground dust three times the bike particle size and share the original Quarks dust draw',()=>{
 const f=fixture(),{fx,base,patrol,step}=f
 try{
  step(.8);assert.ok(fx.dust.system.particleNum>0);assert.equal(fx.dust.batch,base.batch);assert.equal(fx.dust.atlas,base.atlas);assert.equal(fx.dust.material,base.material)
  assert.ok(Math.abs(fx.dust.size.a/(.4*1.4)-3)<1e-10);assert.ok(Math.abs(fx.dust.size.b/(.9*1.4)-3)<1e-10)
  for(const p of fx.dust.system.particles.slice(0,fx.dust.system.particleNum)){assert.ok(p.dustFloor<.07);assert.ok(p.position.y>=p.dustFloor);assert.ok(p.startColor.x>p.startColor.z,'Dust remains earthy rather than white motes')}
  assert.ok(fx.stats.ignitions>0);patrol.scouts[0].view.root.rotation.y=Math.PI;patrol.scouts[0].view.root.updateMatrixWorld(true);fx.updateGlow(f.camera,patrol);assert.equal(fx.stats.ignitions,0,'Rear glow does not paint through the front of the Scout')
 }finally{f.dispose()}
})
test('landing, climbing above the wash height, death and missing ground stop emissions; old dust dissipates normally',()=>{
 const f=fixture(),{fx,patrol,step}=f,s=patrol.scouts[0]
 try{
  step(.5);const born=fx.dust.emitted;assert.ok(born>SCOUT_FLIGHT_FX.particles)
  s.mode='ground';step(.3);assert.equal(fx.dust.emitted,born);assert.equal(fx.stats.ignitions,0)
  s.mode='flight';s.position.y=10;step(.3);assert.equal(fx.dust.emitted,born)
  s.position.y=2;s.dead=true;step(.3);assert.equal(fx.dust.emitted,born)
  s.dead=false;fx.sampleGround=()=>-Infinity;step(.3);assert.equal(fx.dust.emitted,born)
  step(5);assert.equal(fx.dust.system.particleNum,0)
 }finally{f.dispose()}
})
test('thirty flying Scouts stay inside fixed particle, emitter and ground-query budgets and pause without changing AI state',()=>{
 const f=fixture(30),{fx,patrol,step}=f,particles=fx.dust.system.particles.slice(),meshBuffers=[fx.halos.instanceMatrix,fx.cores.instanceMatrix],before=patrol.scouts.map(s=>({p:s.position.toArray(),v:s.velocity.toArray(),mode:s.mode,health:s.health}))
 try{
  for(let i=0;i<120;i++){step(1/60);assert.ok(fx.stats.emitters<=8);assert.ok(fx.stats.groundQueries<=24);assert.ok(fx.stats.particles<=192)}
  assert.ok(fx.dust.system.particles.every(p=>particles.includes(p)),'Warm particle records are recycled')
  const positions=fx.dust.system.particles.slice(0,fx.dust.system.particleNum).map(p=>p.position.toArray()),clock=fx.clock;fx.prepare(0,patrol,f.camera,f.config,1,f.state);f.runtime.update(0);fx.updateGlow(f.camera,patrol);assert.equal(fx.clock,clock);assert.deepEqual(fx.dust.system.particles.slice(0,fx.dust.system.particleNum).map(p=>p.position.toArray()),positions)
  assert.deepEqual(patrol.scouts.map(s=>({p:s.position.toArray(),v:s.velocity.toArray(),mode:s.mode,health:s.health})),before);assert.deepEqual([fx.halos.instanceMatrix,fx.cores.instanceMatrix],meshBuffers)
  fx.prepare(.01,patrol,f.camera,f.config,1,{});assert.ok(fx.stats.particles<=1,'Checkpoint retry drops the previous cloud')
 }finally{f.dispose()}
})
test('the enlarged turbine sits below the rear armour and gently changes size without drifting from its outlet',()=>{
 const f=fixture(),matrix=new Matrix4(),point=new Vector3(),scale=new Vector3(),{fx,patrol,step}=f
 try{
  step(.1);fx.cores.getMatrixAt(0,matrix);point.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);const expected=patrol.scouts[0].view.root.localToWorld(new Vector3(0,-.19,-.625)),before=point.clone(),initialSize=scale.x
  assert.ok(point.distanceTo(expected)<1e-6);assert.ok(initialSize>1.98&&initialSize<2.18,'White orb is four times its previous .52 m diameter')
  step(.15);fx.cores.getMatrixAt(0,matrix);assert.ok(point.setFromMatrixPosition(matrix).distanceTo(before)<1e-6);assert.ok(Math.abs(scale.setFromMatrixScale(matrix).x-initialSize)>.005);assert.ok(Math.abs(scale.x/2.08-1)<.046)
 }finally{f.dispose()}
})
