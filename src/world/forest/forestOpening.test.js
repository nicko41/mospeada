import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {FOREST_SPAWN,FOREST_CRASH} from './forestCrashConfig.js'
import {ForestOpeningShot,FOREST_OPENING} from './forestOpeningShot.js'
import {shouldShowForestOpening} from './forestOpeningState.js'

test('every Forest refresh shows the opening, without an account or persistent visit marker',()=>{
  for(let refresh=0;refresh<3;refresh++)assert.ok(shouldShowForestOpening('forest'))
  assert.ok(shouldShowForestOpening('forest','?intro=1'))
  assert.equal(shouldShowForestOpening('forest','?intro=0'),false)
  assert.equal(shouldShowForestOpening('highway','?intro=1'),false)
})
test('opening starts in front, orbits without discontinuities, and exactly restores the gameplay pose',()=>{
  const state={...FOREST_SPAWN,height:-1.15},initial={...state},endPosition=new Vector3(state.x-Math.sin(state.yaw)*4.1,state.height+2.1,state.z-Math.cos(state.yaw)*4.1),endTarget=new Vector3(state.x+Math.sin(state.yaw)*.4,state.height+1.05,state.z+Math.cos(state.yaw)*.4)
  const shot=new ForestOpeningShot(state,new Vector3(FOREST_CRASH.x,1,FOREST_CRASH.z),endPosition,endTarget,70),first=shot.sample(0)
  assert.ok((first.position.x-state.x)*Math.sin(state.yaw)+(first.position.z-state.z)*Math.cos(state.yaw)>17)
  assert.equal(first.opacity,1);assert.equal(shot.sample(FOREST_OPENING.fadeIn).opacity,0)
  let last=shot.sample(0).position.clone()
  for(let t=.01;t<13;t+=.01){const frame=shot.sample(t);assert.ok(frame.position.toArray().every(Number.isFinite));assert.ok(frame.position.distanceTo(last)<.2);last.copy(frame.position)}
  const end=shot.sample(13);assert.equal(end.complete,true);assert.ok(end.position.distanceTo(endPosition)<1e-9);assert.ok(end.target.distanceTo(endTarget)<1e-9);assert.equal(end.fov,70);assert.deepEqual(state,initial)
  // The old two-phase shot reached zero velocity at ten seconds. It must now
  // keep rotating and approaching throughout that whole handoff region.
  for(let t=8;t<=11.5;t+=.1){
    const a=shot.sample(t-.01).position.clone(),b=shot.sample(t+.01).position.clone()
    assert.ok(a.distanceTo(b)/.02>.3,`No intermediate stop at ${t}s`)
    const angleA=Math.atan2(a.x-state.x,a.z-state.z),angleB=Math.atan2(b.x-state.x,b.z-state.z)
    assert.ok(Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA))<0,'Rotation continues during the dolly')
  }
})
