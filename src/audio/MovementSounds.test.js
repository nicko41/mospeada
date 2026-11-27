import test from 'node:test'
import assert from 'node:assert/strict'
import {MovementSounds} from './MovementSounds.js'

function fixture(){
  const calls=[],sounds=new MovementSounds({play:(name,options)=>calls.push({name,options})})
  const state={boostCount:0,riderMode:'mounted'},armor={boosting:false,mode:'ARMOR_GROUND',grounded:true,height:.025,speed:2}
  const action={time:.1,getClip:()=>({duration:1}),getEffectiveTimeScale:()=>1}
  const instance={clip:'Armor_Walk',action,armorLocomotion:{info:new Map([['Armor_Walk',{contactPhases:[0,.5]}]])}}
  const tick=(options={})=>sounds.update({state,...options})
  tick()
  return {calls,sounds,state,armor,action,instance,tick,count:name=>calls.filter(call=>call.name===name).length}
}

test('Cyclone boost sound follows only successful boost counts, never holding a key or a rejected cooldown press',()=>{
  const f=fixture();for(let i=0;i<120;i++)f.tick();assert.equal(f.calls.length,0)
  f.state.boostCount++;f.tick();for(let i=0;i<120;i++)f.tick();assert.equal(f.count('cycloneBoost'),1)
  f.state.boostCount++;f.tick();assert.equal(f.count('cycloneBoost'),2)
  f.tick({state:{boostCount:0,riderMode:'mounted'}});assert.equal(f.count('cycloneBoost'),2)
})

test('Armor strafe is one shot per effective directional maneuver and never loops while Shift is held',()=>{
  const f=fixture();f.tick({armor:f.armor});f.armor.boosting=true
  const input={walkForward:1,walkSide:0}
  for(let i=0;i<600;i++)f.tick({armor:f.armor,input})
  assert.equal(f.count('armorStrafe'),1);assert.equal(f.calls[0].options,undefined)
  input.walkForward=0;input.walkSide=-1;f.tick({armor:f.armor,input});assert.equal(f.count('armorStrafe'),2)
  f.armor.boosting=false;f.tick({armor:f.armor,input})
  f.armor.boosting=true;f.tick({armor:f.armor,input});assert.equal(f.count('armorStrafe'),3)
})

test('Armor footsteps follow both native foot contacts, phase wrap, and backwards gait',()=>{
  const f=fixture(),tick=()=>f.tick({armor:f.armor,instance:f.instance})
  tick();f.action.time=.6;tick();assert.equal(f.count('armorStep'),1)
  f.action.time=.1;tick();assert.equal(f.count('armorStep'),2)
  f.action.getEffectiveTimeScale=()=>-1
  f.action.time=.9;tick();assert.equal(f.count('armorStep'),3)
  f.action.time=.4;tick();assert.equal(f.count('armorStep'),4)
  tick();assert.equal(f.count('armorStep'),4,'A stationary animation time emits no repeated contact')
})

test('idle, Hover, airborne, jump compression, impact recovery and knocked-down poses emit no gait footsteps',()=>{
  for(const patch of [{speed:0},{mode:'ARMOR_HOVER'},{grounded:false,height:2},{jump:{phase:'compress'}},{groundLanding:{phase:'recover'}},{knockedDown:true}]){
    const f=fixture();Object.assign(f.armor,patch)
    f.tick({armor:f.armor,instance:f.instance});f.action.time=.6;f.tick({armor:f.armor,instance:f.instance})
    assert.equal(f.count('armorStep'),0)
  }
})

test('an actual landing plays exactly one heavy contact and never duplicates the gait contact in the same frame',()=>{
  const f=fixture();Object.assign(f.armor,{grounded:false,height:3,jump:{launched:true}})
  f.tick({armor:f.armor,instance:f.instance});assert.equal(f.calls.length,0)
  Object.assign(f.armor,{grounded:true,height:.025,jump:null});f.action.time=.5
  f.tick({armor:f.armor,instance:f.instance})
  assert.deepEqual(f.calls.map(call=>call.name),['armorLanding'])
  for(let i=0;i<30;i++)f.tick({armor:f.armor,instance:f.instance})
  assert.equal(f.count('armorLanding'),1)
})

test('pausing and checkpoint resets discard contact catch-up and held-boost replay',()=>{
  const f=fixture();f.tick({armor:f.armor,instance:f.instance});f.armor.boosting=true
  f.action.time=.8;f.tick({armor:f.armor,instance:f.instance,input:{walkForward:1},paused:true})
  f.tick({armor:f.armor,instance:f.instance,input:{walkForward:1}});assert.equal(f.calls.length,0)
  f.state.boostCount++;f.tick({enabled:false});f.tick();assert.equal(f.calls.length,0)
})
