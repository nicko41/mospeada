import test from 'node:test'
import assert from 'node:assert/strict'
import {TargetLockSound} from './TargetLockSound.js'
import {SOUND_EFFECTS,PLAYER_INITIAL_AUDIO_URLS} from './gameAudio.js'
import fs from 'node:fs'

test('red lock announces each enemy once, including release/reacquisition, and resets at a checkpoint',()=>{
  const calls=[],sound=new TargetLockSound({play:name=>{calls.push(name);return {}}}),target={},state={},lock={target,ready:false}
  const tick=patch=>sound.update({lock,aiming:true,state,...patch})
  tick();assert.equal(calls.length,0)
  lock.ready=true;for(let i=0;i<240;i++)tick();assert.deepEqual(calls,['targetLock'])
  tick({aiming:false});lock.ready=false;tick();lock.ready=true;tick();assert.equal(calls.length,1)
  lock.target={};tick();assert.equal(calls.length,2)
  lock.target=target;tick();assert.equal(calls.length,2)
  tick({state:{}});assert.equal(calls.length,3)
})

test('disabled gameplay stays quiet and a suspended context can announce after unlock',()=>{
  let calls=0,blocked=true
  const sound=new TargetLockSound({play(){calls++;return blocked?null:{}}}),sample={state:{},lock:{target:{},ready:true},aiming:true}
  sound.update({...sample,enabled:false});sound.update({...sample,aiming:false});assert.equal(calls,0)
  sound.update(sample);assert.equal(calls,1);blocked=false;sound.update(sample);sound.update(sample);assert.equal(calls,2)
  const effect=SOUND_EFFECTS.targetLock,url=effect.variants[0].url
  assert.equal(effect.volume,.5);assert.ok(PLAYER_INITIAL_AUDIO_URLS.includes(url));assert.ok(fs.statSync(new URL(url)).size>1000)
})
