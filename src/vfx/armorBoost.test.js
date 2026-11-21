import test from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,Mesh,Scene,Vector3} from 'three'
import {ArmorBoost} from './ArmorBoost.js'
import {VFXRuntime} from './VFXRuntime.js'

test('rear1 burst stays off before closure, emits backward in world space and dissipates after its short pulse',()=>{
  const vfx=new VFXRuntime(),effect=vfx.register('armor',new ArmorBoost()),entry={armorBoostLevel:0},origin=new Vector3(2,3,4)
  const scene=new Scene();scene.add(vfx.root)
  const rear={boostSocket(p,d){p.copy(origin);d.set(0,0,-1);return true}}
  const tick=()=>{effect.prepare(1/60,entry,rear,5);vfx.update(1/60)}
  try{
    for(let i=0;i<20;i++)tick();assert.equal(effect.emitted,0)
    entry.armorBoostLevel=1;for(let i=0;i<8;i++)tick();assert.ok(effect.emitted>30)
    const ps=effect.systems[0],particle=ps.particles[0],position=particle.position.clone()
    assert.ok(particle.velocity.z<0);assert.ok(ps.worldSpace);assert.ok(ps.emitter.position.distanceTo(origin)<1e-8)
    origin.x+=5;effect.prepare(0,entry,rear,5);vfx.update(0)
    assert.ok(particle.position.distanceTo(position)<1e-8,'Moving the socket cannot drag existing particles')
    entry.armorBoostLevel=0;const emitted=effect.emitted
    for(let i=0;i<90;i++)tick()
    assert.equal(effect.emitted,emitted);assert.ok(effect.systems.every(ps=>ps.particleNum===0))
  }finally{vfx.dispose()}
})

test('return boost uses the existing rear1 socket but expels downwards for the upward launch',()=>{
  const effect=new ArmorBoost(),entry={upwardBoost:true,armorBoostLevel:1},position=new Vector3(3,4,5)
  const rear={boostSocket(p,d){p.copy(position);d.set(0,0,-1);return true}}
  try{
    effect.prepare(1/60,entry,rear,5)
    assert.deepEqual(effect.position.toArray(),position.toArray());assert.deepEqual(effect.direction.toArray(),[0,-1,0]);assert.equal(effect.level,1)
    entry.upwardBoost=false;effect.prepare(1/60,entry,rear,5);assert.deepEqual(effect.direction.toArray(),[0,0,-1])
  }finally{effect.dispose()}
})

test('Armor exposes only the original central rear1 booster: no wheel or side effect is registered',()=>{
  const runtime=new VFXRuntime(),effect=runtime.register('armor',new ArmorBoost()),scene=new Scene();scene.add(runtime.root)
  const rear={boostSocket(p,d){p.set(0,2,0);d.set(0,0,-1);return true}}
  try{
    assert.deepEqual(effect.liftRecords,[])
    assert.equal(effect.trails,undefined)
    assert.deepEqual(effect.systems.map(s=>s.emitter.name),['Quarks_armor_rear1_core','Quarks_armor_rear1_plume'])
    for(const [forward,side]of [[0,0],[0,1],[0,-1],[-1,0]]){
      for(let i=0;i<30;i++){effect.prepare(1/60,{},rear,5,true,{active:true,state:{yaw:0,boostBlend:side||forward?1:0,thrustForward:forward,thrustSide:side,lift:1}});runtime.update(1/60)}
      assert.ok(effect.systems.every(s=>s.particleNum===0),'Hover, sideways and reverse thrust must not spawn replacement effects')
    }
    for(let i=0;i<12;i++){effect.prepare(1/60,{},rear,5,true,{active:true,state:{yaw:0,boostBlend:1,thrustForward:1}});runtime.update(1/60)}
    assert.ok(effect.systems.some(s=>s.particleNum>0),'The approved central booster remains active')
  }finally{runtime.dispose()}
})
