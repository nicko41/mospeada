import test from 'node:test'
import assert from 'node:assert/strict'
import {enemyDistanceGain,playEnemyExplosion} from './enemyAudio.js'

test('enemy falloff stays spatial but is gentler than the prior 35 m curve',()=>{
  assert.equal(enemyDistanceGain(0),1);assert.equal(enemyDistanceGain(50),.5)
  assert.ok(enemyDistanceGain(35)>.5);assert.ok(enemyDistanceGain(100)>0&&enemyDistanceGain(100)<enemyDistanceGain(35))
  assert.ok(enemyDistanceGain(199)>0);assert.equal(enemyDistanceGain(200),0)
})
test('both enemy explosion families receive the destruction position attenuation',()=>{
  const calls=[],audio={play:(name,options)=>calls.push({name,...options})},listener={x:0,y:0,z:0}
  playEnemyExplosion(audio,'invidExplosion',{position:{x:30,y:0,z:40}},listener)
  playEnemyExplosion(audio,'droneExplosion',{position:{x:0,y:0,z:100}},listener)
  assert.deepEqual(calls,[{name:'invidExplosion',gain:.5},{name:'droneExplosion',gain:.2}])
})
