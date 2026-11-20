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

test('Armor wheel lift reuses the Quarks runtime and obeys hover, jump, direction, distance and particle quotas',()=>{
  const runtime=new VFXRuntime(),effect=runtime.register('armor',new ArmorBoost()),rear={boostSocket(p,d){p.set(0,2,0);d.set(0,0,-1);return true}}
  const scene=new Scene();scene.add(runtime.root)
  const geometry=new BoxGeometry(1,1,1),wheels={groups:[-1,1].map(x=>{const mesh=new Mesh(geometry);mesh.userData.sourcePiece='Front_Tire_Rubber';mesh.position.set(x,2,0);mesh.updateMatrixWorld(true);return{parts:[{mesh}]}})}
  const armor={active:true,state:{yaw:0,boostBlend:.8,thrustForward:1,thrustSide:0,thrustX:0,thrustZ:1,lift:1,sideAcceleration:12,ax:10,az:5}}
  try{
    for(let i=0;i<50;i++){effect.prepare(1/60,{},rear,5,true,armor,wheels);runtime.update(1/60)}
    assert.ok(effect.liftRecords.every(r=>r.system.particleNum>0&&r.system.particleNum<=70));assert.notEqual(effect.liftRecords[0].level,effect.liftRecords[1].level)
    assert.ok(effect.direction.z<-.9);assert.ok(effect.liftRecords.every(r=>r.system.emitter.position.y<2))
    armor.active=false;for(let i=0;i<90;i++){effect.prepare(1/60,{},rear,5,true,armor,wheels);runtime.update(1/60)}
    assert.ok(effect.liftRecords.every(r=>r.system.particleNum===0))
  }finally{runtime.dispose();geometry.dispose()}
})

test('backward and lateral boost use wheel jets opposite to thrust; only forward uses rear1, and Shift alone stays idle',()=>{
  const effect=new ArmorBoost(),rear={boostSocket(p,d){p.set(0,2,0);d.set(0,0,-1);return true}},geometry=new BoxGeometry(1,1,1)
  const wheels={groups:[-1,1].map(x=>{const mesh=new Mesh(geometry);mesh.userData.sourcePiece='Front_Tire_Rubber';mesh.position.set(x,2,0);mesh.updateMatrixWorld(true);return{parts:[{mesh}]}})}
  try{
    for(const [forward,side,x,z]of [[1,0,0,1],[-1,0,0,-1],[0,-1,1,0],[0,1,-1,0]]){
      const state={yaw:0,boostBlend:1,thrustForward:forward,thrustSide:side,thrustX:x,thrustZ:z,lift:.25,sideAcceleration:0,ax:x*30,az:z*30}
      effect.prepare(1/60,{},rear,5,true,{active:true,state},wheels)
      if(forward>0)assert.equal(effect.level,1)
      else{assert.equal(effect.level,0);assert.ok(effect.liftRecords.every(r=>r.level>1));assert.ok(effect.liftDirection.x*x+effect.liftDirection.z*z<-.3)}
    }
    effect.prepare(1/60,{},rear,5,true,{active:true,state:{yaw:0,boostBlend:0,lift:.25,ax:0,az:0,sideAcceleration:0}},wheels);assert.equal(effect.level,0);assert.ok(effect.liftRecords.every(r=>r.level===.25))
  }finally{effect.dispose();geometry.dispose()}
})
