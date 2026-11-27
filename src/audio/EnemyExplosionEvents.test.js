import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Ray,Vector3} from 'three'
import {CycloneShooterEncounter} from '../world/forest/CycloneShooterEncounter.js'
import {DesertScoutPatrol} from '../world/forest/DesertScoutPatrol.js'

test('a drone destruction emits exactly one sound event after its last effective hit, and can emit again after reset',()=>{
  const destroyed=[],encounter=new CycloneShooterEncounter({onDestroyed:target=>destroyed.push(target)}),drone=encounter.drones[0]
  const ray=new Ray(new Vector3(0,1,0),new Vector3(0,0,-1)),state={x:0,z:0,height:0,yaw:Math.PI}
  function prepare(){encounter.phase='active';drone.spawned=true;drone.position.set(0,1,-10)}
  prepare()
  for(let hit=0;hit<3;hit++){encounter.fireCooldown=0;encounter.fire(ray,state);assert.equal(destroyed.length,hit===2?1:0)}
  assert.equal(destroyed[0],drone);encounter.fire(ray,state);assert.equal(destroyed.length,1)
  encounter.fireCooldown=0;encounter.fire(ray,state);assert.equal(destroyed.length,1,'Dead targets never explode twice')
  encounter.reset();assert.equal(destroyed.length,1);prepare()
  for(let hit=0;hit<3;hit++){encounter.fireCooldown=0;encounter.fire(ray,state)}
  assert.equal(destroyed.length,2)
})

test('Scout Gallant and missile kills emit once each, while nonlethal hits, dead targets and resets stay silent',()=>{
  const destroyed=[],patrol=new DesertScoutPatrol([{root:new Group()}],()=>0,()=>.5,{onDestroyed:target=>destroyed.push(target)})
  const scout=patrol.scouts[0],direction=new Vector3(0,0,-1)
  scout.meleeEnabled=true
  for(let hit=0;hit<15;hit++)scout.receiveHit(1,direction)
  assert.equal(destroyed.length,0);scout.receiveHit(1,direction);assert.equal(destroyed.length,1)
  assert.equal(destroyed[0],scout);scout.receiveMissileHit(direction);assert.equal(destroyed.length,1)
  patrol.reset();assert.equal(destroyed.length,1)
  scout.meleeEnabled=true;scout.receiveMissileHit(direction);assert.equal(destroyed.length,2)
  scout.receiveHit(1,direction);assert.equal(destroyed.length,2)
})
