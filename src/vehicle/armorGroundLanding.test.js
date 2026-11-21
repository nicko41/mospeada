import test from 'node:test'
import assert from 'node:assert/strict'
import {advanceArmor,createArmorState} from './armorPhysics.js'
import {advanceGroundLanding,beginGroundLanding} from './armorGroundLanding.js'

test('Ctrl after a rising directional boost retains horizontal speed and direction throughout airborne descent',()=>{
  const a=createArmorState({x:0,z:0,height:.8,yaw:.4,speed:0}),flat=()=>0
  for(let i=0;i<72;i++)advanceArmor(a,{forward:1,side:.4,yaw:.4,boost:true,rise:true},1/120,flat)
  const before={x:a.x,y:a.y,z:a.z,vx:a.vx,vz:a.vz,speed:a.speed}
  assert.ok(before.speed>25&&a.vy>0)
  beginGroundLanding(a,'dive')
  for(let i=0;i<36;i++)advanceGroundLanding(a,{forward:1,boost:true,rise:true,descend:true},1/120,flat)
  assert.equal(a.groundLanding.phase,'descend')
  assert.ok(a.y<before.y&&a.vy< -8)
  assert.equal(a.vx,before.vx);assert.equal(a.vz,before.vz)
  assert.ok(Math.abs(a.speed-before.speed)<1e-10)
  assert.ok(Math.abs(a.x-before.x-before.vx*.3)<1e-8)
  assert.ok(Math.abs(a.z-before.z-before.vz*.3)<1e-8)
})
