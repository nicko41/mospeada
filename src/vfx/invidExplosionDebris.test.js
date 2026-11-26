import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,PerspectiveCamera,Scene,Vector3} from 'three'
import {InvidExplosionDebris,INVID_EXPLOSION_DEBRIS as C} from './InvidExplosionDebris.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {VFXRuntime} from './VFXRuntime.js'

function fixture(){const map=new DataTexture(),fx=new InvidExplosionDebris({sparkMap:map,smokeMap:map,random:()=>.5}),camera=new PerspectiveCamera();camera.position.set(0,3,15);camera.lookAt(0,3,0);camera.updateMatrixWorld(true);return{map,fx,camera,dispose(){fx.dispose();map.dispose()}}}
test('secondary ejection covers a 3D sphere, starts fast, brakes quickly and keeps the requested short lifetimes',()=>{
 const f=fixture(),{fx,camera}=f,origin=new Vector3(0,3,0)
 try{
  assert.equal(fx.burst(origin),true);const r=fx.records[0];assert.equal(r.fragments,16);assert.equal(r.trails,5)
  const active=[...r.particles.slice(0,r.fragments),...r.particles.slice(fx.capacity.fragments,fx.capacity.fragments+r.trails)]
  for(const p of active){assert.ok(p.speed>=15&&p.speed<=30);assert.ok(p.life>=.4&&p.life<=.8);assert.ok(p.smokeLife>=.8&&p.smokeLife<=1.5);assert.ok(Math.abs(p.direction.length()-1)<1e-12)}
  for(const axis of ['x','y','z']){assert.ok(active.some(p=>p.direction[axis]>.35));assert.ok(active.some(p=>p.direction[axis]<-.35))}
  const heads=r.particles.slice(fx.capacity.fragments,fx.capacity.fragments+r.trails);assert.ok(heads.some(p=>p.direction.y>.3)&&heads.some(p=>p.direction.y<-.3),'Smoke-bearing fragments also cover the whole sphere')
  const p=active.reduce((a,b)=>Math.abs(a.direction.y)<Math.abs(b.direction.y)?a:b),a=fx.position(r,p,.1,new Vector3()),b=fx.position(r,p,.2,new Vector3()),d=fx.position(r,p,.5,new Vector3()),e=fx.position(r,p,.6,new Vector3())
  assert.ok(a.distanceTo(origin)>1.5,'Initial ejection is not a slow drift');assert.ok(e.distanceTo(d)<b.distanceTo(a),'Air drag quickly brakes the fragment')
  fx.update(0,camera);assert.equal(fx.hot.count,21);assert.equal(fx.smoke.count,0)
 }finally{f.dispose()}
})
test('short smoke samples follow only the selected heads, persist after their light, and pause without drifting',()=>{
 const f=fixture(),{fx,camera}=f
 try{
  fx.burst(new Vector3(0,3,0));fx.update(0,camera);fx.update(.2,camera)
  assert.ok(fx.smoke.count>0&&fx.smoke.count<=5*C.trailSamples)
  const matrices=fx.smoke.instanceMatrix.array.slice(),alpha=fx.smokeAlpha.array.slice();fx.update(0,camera);assert.deepEqual(fx.smoke.instanceMatrix.array,matrices);assert.deepEqual(fx.smokeAlpha.array,alpha)
  for(let i=0;i<fx.smoke.count;i++)assert.ok(fx.smokeAlpha.getX(i)>0&&fx.smokeAlpha.getX(i)<=C.smokeOpacity)
  fx.update(.65,camera);assert.equal(fx.hot.count,0);assert.ok(fx.smoke.count>0,'Smoke outlasts its incandescent head')
  fx.update(.7,camera);assert.equal(fx.smoke.count,0);assert.equal(fx.stats.activeBursts,0)
 }finally{f.dispose()}
})
test('simultaneous deaths stay in fixed pools; fresh explosions can replace only an old smoke tail',()=>{
 const f=fixture(),{fx,camera}=f,buffers=[fx.hot.instanceMatrix,fx.smoke.instanceMatrix,fx.smokeAlpha],records=fx.records.slice(),materials=[fx.hotMaterial,fx.smokeMaterial]
 try{
  for(let i=0;i<30;i++)fx.burst(new Vector3(i%4,3,0))
  assert.equal(fx.stats.bursts,4);assert.equal(fx.stats.dropped,26);fx.update(0,camera);fx.update(.2,camera)
  assert.ok(fx.hot.count<=104);assert.ok(fx.smoke.count<=144)
  fx.update(.65,camera);assert.equal(fx.hot.count,0);assert.equal(fx.burst(new Vector3(0,3,0)),true);assert.equal(fx.stats.recycledTails,1)
  assert.deepEqual([fx.hot.instanceMatrix,fx.smoke.instanceMatrix,fx.smokeAlpha],buffers);assert.deepEqual(fx.records,records);assert.deepEqual([fx.hotMaterial,fx.smokeMaterial],materials)
  fx.clear();assert.equal(fx.hot.count+fx.smoke.count,0);fx.settings.enabled=false;assert.equal(fx.burst(new Vector3()),false)
  let disposed=false;f.map.addEventListener('dispose',()=>disposed=true);fx.dispose();assert.equal(disposed,false,'The original explosion owns its shared textures')
 }finally{f.map.dispose()}
})
test('visual variation never consumes the random stream used by gameplay during a death',()=>{
 const map=new DataTexture(),fx=new InvidExplosionDebris({sparkMap:map,smokeMap:map}),original=Math.random;let calls=0
 try{Math.random=()=>{calls++;return .5};fx.burst(new Vector3(0,3,0));assert.equal(calls,0)}finally{Math.random=original;fx.dispose();map.dispose()}
})
test('actual Invid destruction adds one secondary burst, keeps the approved main preset/lights, and does not affect impact events',()=>{
 const atlas=new DataTexture(),runtime=new VFXRuntime(),fx=runtime.register('combat',new Plano3CombatVFX({explosionAtlases:{air:atlas}})),camera=new PerspectiveCamera(),scene=new Scene(),target={dead:true,position:new Vector3(0,3,-10),height:5.2},e={active:true,time:1,bolts:[]},weapon={root:{visible:false}}
 scene.add(runtime.root);camera.updateMatrixWorld(true)
 try{
  const preset=structuredClone(fx.presets.invidExplosion),lights=fx.impacts.lights.slice(),systems=fx.systems.slice()
  fx.destroyTarget(target);fx.destroyTarget(target);fx.update(0,e,weapon,camera)
  assert.equal(fx.stats.explosions,1);assert.equal(fx.secondaryExplosion.stats.bursts,1);assert.ok(fx.secondaryExplosion.hot.count>=16);assert.ok(fx.impacts.airSprites.count>0);assert.ok(fx.systems[4].particleNum>0)
  fx.enemyImpact(new Vector3(1,0,-5));fx.enemyWorldImpact(new Vector3(1,0,-6));assert.equal(fx.secondaryExplosion.stats.bursts,1)
  assert.deepEqual(fx.presets.invidExplosion,preset);assert.deepEqual(fx.impacts.lights,lights);assert.deepEqual(fx.systems,systems)
  fx.clear();assert.equal(fx.secondaryExplosion.hot.count+fx.secondaryExplosion.smoke.count,0)
 }finally{runtime.dispose();atlas.dispose()}
})
