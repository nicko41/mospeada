import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,PerspectiveCamera,Scene,Vector3} from 'three'
import {VFXRuntime} from './VFXRuntime.js'
import {DustTrail} from './DustTrail.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {INVID_IMPACT_DUST} from './InvidImpactDust.js'

function fixture(){
 const runtime=new VFXRuntime(),dust=runtime.register('bike',new DustTrail()),sheet=new DataTexture(new Uint8Array([255,255,255,255]),1,1),fx=runtime.register('combat',new Plano3CombatVFX({sharedDust:dust,sampleGround:()=>0,explosionAtlases:{terrain:sheet}})),camera=new PerspectiveCamera(),e={active:true,time:1,bolts:[]},weapon={root:{visible:false}}
 new Scene().add(runtime.root);return{runtime,dust,fx,camera,e,weapon,dispose(){runtime.dispose();sheet.dispose()}}
}

test('orb ground impact keeps its PNG and adds exactly one warm desert dust system to the original shared draw',()=>{
 const f=fixture(),{fx,dust}=f,module=fx.impactDust
 try{const batches=f.runtime.renderer.batches.length;fx.enemyWorldImpact(new Vector3(3,0,-10),new Vector3(0,-42,0));fx.update(0,f.e,f.weapon,f.camera);assert.equal(fx.impacts.terrainSprites.count,1);assert.equal(module.systems.length,1);assert.equal(module.system.particleNum,INVID_IMPACT_DUST.perImpact);assert.equal(module.dust.batch,dust.batch);assert.equal(module.dust.material,dust.material);assert.equal(module.dust.atlas,dust.atlas);assert.equal(f.runtime.renderer.batches.length,batches);assert.equal(fx.systems[0].particleNum,0,'No extra spark module is emitted');assert.equal(module.system.startColor.a.w,.5);assert.equal(module.system.startColor.b.w,.7);for(const p of module.system.particles.slice(0,module.system.particleNum)){assert.ok(p.startColor.x>p.startColor.z);assert.ok(Math.abs(p.position.x-3)<.25);assert.ok(Math.abs(p.position.z+10)<.25);assert.ok(p.position.y>=0)} }finally{f.dispose()}
})

test('pooled impact dust stays visible with idle wheels, pauses, dissipates and remains bounded under heavy volleys',()=>{
 const f=fixture(),d=f.fx.impactDust,ps=d.system,pool=ps.particles.slice(),material=d.dust.material,atlas=d.dust.atlas
 try{f.fx.enemyWorldImpact(new Vector3(0,0,-10));f.dust.batch.visible=false;f.fx.update(0,f.e,f.weapon,f.camera);assert.equal(f.dust.batch.visible,true);const age=ps.particles[0].age;f.runtime.update(0);assert.equal(ps.particles[0].age,age);for(let i=0;i<200;i++)f.fx.enemyWorldImpact(new Vector3(i*.1,0,-10));assert.ok(ps.particleNum<=INVID_IMPACT_DUST.capacity);for(let i=0;i<120;i++)f.runtime.update(1/60);assert.equal(ps.particleNum,0);f.fx.enemyWorldImpact(new Vector3(0,0,-10));assert.ok(ps.particles.every(p=>pool.includes(p)));assert.equal(d.dust.material,material);assert.equal(d.dust.atlas,atlas);f.fx.clear();assert.equal(ps.particleNum,0)}finally{f.dispose()}
})

test('aerial or wall impacts do not produce ground dust and the shared terrain VFX toggle is respected',()=>{
 const f=fixture(),ps=f.fx.impactDust.system
 try{f.fx.enemyWorldImpact(new Vector3(0,3,-10));assert.equal(ps.particleNum,0);f.dust.config={enabled:false};f.fx.enemyWorldImpact(new Vector3(0,0,-10));assert.equal(ps.particleNum,0);f.dust.config={enabled:true,earthEnabled:false};f.fx.enemyWorldImpact(new Vector3(0,0,-10));assert.equal(ps.particleNum,0);f.dust.config={enabled:true,earthEnabled:true};f.fx.enemyWorldImpact(new Vector3(0,0,-10));assert.ok(ps.particleNum>0)}finally{f.dispose()}
})
