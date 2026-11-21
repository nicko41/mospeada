import test from 'node:test'
import assert from 'node:assert/strict'
import {advanceArmor,armorConfig,createArmorState} from './armorPhysics.js'
const flat=(x,z,c)=>{if(c)c.surface=x< -10?'dirt':'asphalt';return 0}
const state=()=>createArmorState({x:0,z:0,height:.8,yaw:0,speed:0})
function run(a,input,seconds,fps=120,sample=flat,canMove){for(let i=0;i<Math.round(seconds*fps);i++)advanceArmor(a,input,1/fps,sample,canMove);return a}
test('hover strafes without turning to velocity, settles at 0.8 m and automatically brakes with finite glide',()=>{
  const a=run(state(),{side:1,yaw:0},2)
  assert.ok(a.x< -12&&Math.abs(a.z)<1e-8);assert.equal(a.yaw,0);assert.ok(Math.abs(a.y-.8)<1e-8)
  const x=a.x;run(a,{},4);assert.equal(a.speed,0);assert.ok(a.x<x-.5&&a.x>x-5)
  assert.equal(a.surface,'dirt')
})
test('boost has higher speed and assisted inertia but never glides forever',()=>{
  const normal=run(state(),{forward:1},3),boost=run(state(),{forward:1,boost:true},3)
  assert.ok(normal.speed<=armorConfig.hoverSpeed+.001);assert.ok(boost.speed>28&&boost.speed<=armorConfig.boostSpeed+.001)
  const zN=normal.z,zB=boost.z;run(normal,{},4);run(boost,{},4)
  assert.ok(boost.z-zB>(normal.z-zN)*2);assert.equal(normal.speed,0);assert.equal(boost.speed,0)
})
test('bounded vertical thrust gives a large aerial arc; release and Ctrl return safely to hover',()=>{
  const a=run(state(),{rise:true,forward:1,boost:true},1.1)
  assert.ok(a.y>5&&a.vy>4&&a.z>8);assert.equal(a.jumpPowered,false)
  const released=structuredClone(a),descending=structuredClone(a);run(released,{},.2);run(descending,{descend:true},.2)
  assert.ok(descending.vy<released.vy-10&&descending.vy< -10);assert.ok(descending.y<released.y)
  run(a,{},14);assert.ok(Math.abs(a.y-.8)<.03);assert.ok(Math.abs(a.vy)<.02)
  run(a,{descend:true},3);assert.ok(a.y>=.025)
  run(a,{},4);assert.ok(Math.abs(a.y-.8)<.01)
})

test('Ctrl decisively reverses ascent into a faster bounded dive and releases safely',()=>{
  const a=run(state(),{rise:true},.7);assert.ok(a.vy>0)
  run(a,{descend:true},.1);assert.ok(a.vy< -8&&a.diving&&a.diveBlend>.3)
  run(a,{descend:true},.2);assert.ok(a.vy<=-14&&a.vy>=-armorConfig.maxDiveSpeed)
  run(a,{},5);assert.ok(a.y>=.025&&Math.abs(a.y-.8)<.1);assert.ok(a.diveBlend<.01)
})

test('holding Space completes exactly one jump, respects the launch-relative ceiling and requires release/repress after recovery',()=>{
  const a=state(),launch=a.y;let peak=launch,sawFall=false,maxPowered=0
  for(let i=0;i<3600;i++){
    advanceArmor(a,{rise:true,forward:1,boost:true},1/120,flat)
    peak=Math.max(peak,a.y);sawFall||=a.vy< -1
    if(a.jumpPowered)maxPowered=Math.max(maxPowered,a.jump.elapsed)
  }
  assert.ok(peak-launch>8&&peak-launch<=armorConfig.jumpMaxHeight+1e-6)
  assert.ok(sawFall);assert.ok(maxPowered<=armorConfig.jumpThrustDuration);assert.equal(a.jumpCount,1);assert.equal(a.jump,null);assert.ok(Math.abs(a.y-.8)<.01)
  run(a,{},.05);run(a,{rise:true},.5);assert.equal(a.jumpCount,2);assert.ok(a.vy>8)
  // No airborne double jumps, including releasing/repressing before landing.
  run(a,{},.1);run(a,{rise:true},1);assert.equal(a.jumpCount,2)
  const low=state(),c={...armorConfig,jumpMaxHeight:3};let max=low.y
  for(let i=0;i<1800;i++){advanceArmor(low,{rise:true},1/120,flat,undefined,c);max=Math.max(max,low.y)}
  assert.ok(max<=3.8+1e-6&&max>3);assert.ok(Math.abs(low.y-.8)<.01)
})

test('four-way and diagonal boost normalize camera-relative direction, never accelerate on Shift alone and retain brief assisted inertia',()=>{
  for(const yaw of [0,.73,Math.PI/2])for(const [forward,side] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){
    const a=run(state(),{forward,side,yaw,boost:true},2)
    const n=Math.hypot(forward,side),x=(Math.sin(yaw)*forward-Math.cos(yaw)*side)/n,z=(Math.cos(yaw)*forward+Math.sin(yaw)*side)/n
    assert.ok(a.speed>30&&a.speed<=armorConfig.boostSpeed+1e-6);assert.ok(a.vx*x+a.vz*z>30);assert.ok(Math.abs(a.vx*z-a.vz*x)<1e-6)
    const before={x:a.x,z:a.z};run(a,{},.15);assert.ok(a.speed>25&&Math.hypot(a.x-before.x,a.z-before.z)>3)
    run(a,{},4);assert.equal(a.speed,0)
  }
  const idle=run(state(),{boost:true},4);assert.equal(idle.speed,0);assert.equal(idle.boostBlend,0)
})

test('Ground idle ignores camera orientation, Hover freely follows it, and Ground turns only during foot motion',()=>{
  const a=state();a.mode='ARMOR_GROUND';run(a,{yaw:Math.PI},3)
  assert.equal(a.yaw,0);assert.equal(a.speed,0)
  a.mode='ARMOR_HOVER';run(a,{yaw:Math.PI},2);assert.ok(Math.abs(a.yaw-Math.PI)<1e-6)
})
test('Ground walks/runs and turbine jumps return to the floor, with repeatable impacts and no held-key auto hopping',()=>{
  const a=state();a.mode='ARMOR_GROUND';run(a,{forward:1},4)
  assert.ok(a.grounded&&a.y>=.025&&a.y<.12);assert.ok(Math.abs(a.speed-2.5)<.03)
  run(a,{forward:1,boost:true},2);assert.ok(Math.abs(a.speed-armorConfig.runSpeed)<.03)
  run(a,{rise:true},.5);assert.equal(a.mode,'ARMOR_GROUND');assert.ok(a.y>1&&a.lift>1)
  let contact=0;for(let i=0;i<1800;i++){advanceArmor(a,{rise:true},1/120,flat);contact=Math.max(contact,a.settle)}
  assert.equal(a.mode,'ARMOR_GROUND');assert.ok(a.grounded&&a.height<.12);assert.equal(a.jumpCount,1);assert.ok(contact>.6)
  run(a,{},.05);run(a,{rise:true},.5);assert.equal(a.jumpCount,2);assert.ok(a.vy>8)
})
test('terrain is sampled by geometry tags, floor never penetrates, obstacles stop actual acceleration and 30/120 FPS agree',()=>{
  const terrain=(x,z,c)=>{if(c)c.surface='dirt';return Math.max(0,Math.min(1,z*.04))}
  const a=state(),b=state()
  run(a,{forward:1,side:.3},5,30,terrain);run(b,{forward:1,side:.3},5,120,terrain)
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-6);assert.ok(a.y+a.soleOffset>=terrain(a.x,a.z));assert.equal(a.surface,'dirt')
  const blocked=state();run(blocked,{side:1},2,120,flat,x=>x> -2);assert.ok(blocked.x> -2&&blocked.vx===0&&blocked.ax===0)
})
