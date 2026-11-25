import test from 'node:test'
import assert from 'node:assert/strict'
import {armorTransformationUnlocked,observeArmorUnlock} from './armorUnlock.js'
import {FrontTransformEntry} from './FrontTransformEntry.js'

const world=()=>({bound:true,position:{y:10},contains:()=>true,distance:z=>-z})
const runtime=()=>({levelProgress:{},armorUnlocked:false,state:{x:0,z:-650,height:10,speed:25,riderMode:'mounted'},desertPatrol:{phase:'sighting'}})
function store(){let value={ready:true,progress:0,inspection:false};return{snapshot:()=>value,set:p=>value={...value,...p},reset(){this.set({progress:0,playing:false})},pause(){this.set({playing:false})}}}

test('Armor unlock requires the actual descent and first Scout encounter, not earlier jumps or sightings',()=>{
 const r=runtime(),w=world();assert.equal(armorTransformationUnlocked(r),false);assert.equal(observeArmorUnlock(r,w),false)
 r.desertPatrol.phase='entering';assert.equal(observeArmorUnlock(r,w),false,'A rider still on the plateau remains locked')
 r.state.height=5;r.state.z=-590;assert.equal(observeArmorUnlock(r,w),false,'Earlier terrain drops do not unlock Armor')
 r.state.z=-650;r.desertPatrol.phase='sighting';assert.equal(observeArmorUnlock(r,w),false)
 r.desertPatrol.phase='entering';assert.equal(observeArmorUnlock(r,w),true);assert.equal(armorTransformationUnlocked(r),true)
})

test('transformation request is gated centrally, checkpoint retry preserves unlock and full level restart locks it again',()=>{
 const r=runtime(),s=store(),entry=new FrontTransformEntry(s,r);entry.request()
 assert.equal(entry.phase,'idle');assert.equal(s.snapshot().progress,0);assert.match(s.snapshot().message,/barranco/)
 r.desertPatrol.phase='entering';r.state.height=5;observeArmorUnlock(r,world());entry.request();assert.equal(entry.phase,'wheelie')
 entry.reset();r.state={...r.state,height:10,z:-550};assert.equal(armorTransformationUnlocked(r),true,'Retry must preserve reached progression')
 entry.resetLevelCamera();assert.equal(armorTransformationUnlocked(r),false);entry.request();assert.equal(entry.phase,'idle')
})

test('standalone driving and authoring scenarios keep their existing transformation access',()=>{
 const r=runtime();delete r.levelProgress;assert.equal(armorTransformationUnlocked(r),true)
 const entry=new FrontTransformEntry(store(),r);entry.request();assert.equal(entry.phase,'wheelie')
})
