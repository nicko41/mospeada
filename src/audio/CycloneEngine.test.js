import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {CycloneEngine,EngineRPM} from './CycloneEngine.js'
import {ENGINE_AUDIO_DEFAULTS as config,engineAudioState} from './engineAudioState.js'
import {CYCLONE_ENGINE_URLS,SOUND_EFFECTS} from './gameAudio.js'

const state=(patch={})=>({speed:0,acceleration:0,boostTime:0,brakeBlend:0,...patch})
function run(model,seconds,physical,input={},settings=config){let output;for(let i=0;i<Math.ceil(seconds*60);i++)output=model.update(1/60,{state:physical,input},settings);return output}
function fixture(){
  const calls=[],updates=[],stops=[],audio={blocked:false,play(name,options){if(this.blocked)return null;const source={name,options};calls.push(source);return source},modulate(source,values){updates.push({source,...values})},stop(source,fade){stops.push({source,fade})}}
  const engine=new CycloneEngine(audio),physical=state()
  const tick=(options={})=>engine.update(1/60,{state:physical,...options})
  return {audio,engine,physical,tick,calls,updates,stops}
}

test('idle engine uses the minimum pitch and gain with a muffled low-pass',()=>{
  const out=run(new EngineRPM(),2,state())
  assert.equal(out.playbackRate,config.pitchMin);assert.equal(out.gain,config.volumeMin)
  assert.ok(out.frequency<2500);assert.equal(out.rpm,900)
})

test('throttle responds on the first frame, then progressively raises RPM, gain and high frequencies',()=>{
  const model=new EngineRPM(),idle=run(model,1,state())
  const first=model.update(1/60,{state:state(),input:{throttle:1}},config)
  const later=run(model,1,state({speed:15,acceleration:6}),{throttle:1})
  assert.ok(first.playbackRate>idle.playbackRate&&first.gain>idle.gain&&first.frequency>idle.frequency)
  assert.ok(later.playbackRate>first.playbackRate&&later.gain>first.gain&&later.frequency>first.frequency)
})

test('steady speed stabilizes RPM and relaxes intensity after physical acceleration ends',()=>{
  const model=new EngineRPM(),physical=state({speed:30,acceleration:6})
  const accelerating=run(model,3,physical,{throttle:1})
  physical.acceleration=0
  const cruise=run(model,3,physical,{throttle:1}),stable=run(model,1,physical,{throttle:1})
  assert.ok(cruise.gain<accelerating.gain&&cruise.frequency<accelerating.frequency)
  assert.ok(Math.abs(stable.rpm-cruise.rpm)<1)
})

test('release immediately reduces intensity while RPM falls gradually with physical speed and inertia',()=>{
  const model=new EngineRPM(),physical=state({speed:30,acceleration:6}),loaded=run(model,3,physical,{throttle:1})
  physical.acceleration=-1
  const released=model.update(1/60,{state:physical,input:{}},config)
  assert.ok(released.gain<loaded.gain*.8);assert.ok(released.normalizedRpm>loaded.normalizedRpm*.95)
  const coast=run(model,1,physical);assert.ok(coast.normalizedRpm<released.normalizedRpm)
  physical.speed=10;assert.ok(run(model,2,physical).rpm<coast.rpm)
})

test('braking drops revolutions faster than coasting; only an accepted boost raises engine load',()=>{
  const coast=new EngineRPM(),brake=new EngineRPM(),physical=state({speed:30})
  run(coast,3,physical,{throttle:1});run(brake,3,physical,{throttle:1})
  assert.ok(run(brake,.3,physical,{brakeReverse:true}).rpm<run(coast,.3,physical).rpm)
  const normal=new EngineRPM(),boosted=new EngineRPM(),ignored=new EngineRPM()
  const baseline=run(normal,2,physical,{throttle:1})
  const boost=run(boosted,2,{...physical,boostTime:.3},{throttle:1})
  const held=run(ignored,2,physical,{throttle:1,boost:true})
  assert.ok(boost.playbackRate>baseline.playbackRate&&boost.gain>baseline.gain&&boost.frequency>baseline.frequency)
  assert.equal(held.playbackRate,baseline.playbackRate)
})

test('airtime gently lowers pitch and landing restores it without changing load or restarting the loop',()=>{
  const f=fixture();f.physical.speed=45
  const input={throttle:1}
  for(let i=0;i<300;i++)f.tick({input})
  const grounded=f.engine.model.output,source=f.engine.loop
  f.physical.airborne=true
  f.tick({input});const first=f.engine.model.output
  for(let i=0;i<30;i++)f.tick({input})
  const airborne=f.engine.model.output
  assert.ok(first.playbackRate<grounded.playbackRate&&first.playbackRate>airborne.playbackRate)
  assert.ok(airborne.playbackRate>grounded.playbackRate*.9)
  assert.ok(airborne.playbackRate<grounded.playbackRate*.95)
  assert.ok(Math.abs(airborne.gain-grounded.gain)<1e-6)
  assert.ok(Math.abs(airborne.frequency-grounded.frequency)<.01)
  f.physical.airborne=false
  f.tick({input});const landing=f.engine.model.output
  assert.ok(landing.playbackRate>airborne.playbackRate&&landing.playbackRate<grounded.playbackRate)
  for(let i=0;i<90;i++)f.tick({input})
  assert.ok(Math.abs(f.engine.model.output.playbackRate-grounded.playbackRate)<.001)
  assert.equal(f.engine.loop,source);assert.equal(f.calls.length,1);assert.equal(f.stops.length,0)
  const fixed=run(new EngineRPM(),1,Object.freeze(state({speed:60,airborne:true,boostTime:1})),input,{...config,pitchMin:1,pitchMax:1})
  assert.equal(fixed.playbackRate,1)
  f.physical.airborne=true;f.tick({input});assert.ok(f.engine.model.airborneBlend>0)
  f.tick({state:state()});assert.equal(f.engine.model.airborneBlend,0)
})

test('one loop survives speed changes, throttle release, pause, transformation, Armor and checkpoints',()=>{
  const f=fixture();f.tick();const source=f.engine.loop
  for(const speed of [0,5,30,60,0]){f.physical.speed=speed;f.tick({input:{throttle:1}})}
  f.tick({paused:true});assert.equal(f.updates.at(-1).gain,0)
  f.tick({enabled:false});assert.equal(f.updates.at(-1).gain,0);assert.equal(f.updates.at(-1).timeConstant,.12)
  f.tick({state:state()});assert.equal(f.engine.loop,source);assert.equal(f.calls.length,1);assert.equal(f.stops.length,0)
  assert.ok(f.calls[0].options.loop);assert.equal(f.calls[0].options.filter.type,'lowpass')
  assert.equal(f.calls[0].options.playbackRate,config.pitchMin)
  f.engine.dispose();assert.equal(f.stops.length,1);assert.equal(f.stops[0].fade,0)
})

test('locked audio retries only the same cached loop after unlock and never loads alternative engine files',()=>{
  const f=fixture();f.audio.blocked=true;f.tick();assert.equal(f.calls.length,0)
  f.audio.blocked=false;f.tick();f.tick();assert.equal(f.calls.length,1)
  assert.equal(CYCLONE_ENGINE_URLS.length,1);assert.match(CYCLONE_ENGINE_URLS[0],/02-engine-loop1.mp3$/)
  assert.equal(SOUND_EFFECTS.cycloneAcceleration,undefined);assert.equal(SOUND_EFFECTS.cycloneIgnition,undefined)
  assert.ok(fs.statSync(new URL(CYCLONE_ENGINE_URLS[0])).size>1000)
})

test('live parameters change the same source, enforce ordered bounds and restore defaults',()=>{
  const f=fixture();f.tick();const source=f.engine.loop
  try{
    engineAudioState.set('pitchMin',1.2);engineAudioState.set('volumeMin',.3);f.tick()
    assert.equal(f.engine.loop,source);assert.equal(f.calls.length,1)
    assert.equal(f.updates.at(-1).playbackRate,1.2);assert.equal(f.updates.at(-1).gain,.3)
    engineAudioState.set('pitchMax',.5);assert.equal(engineAudioState.snapshot().pitchMin,.5)
    engineAudioState.set('volumeMin',1);assert.equal(engineAudioState.snapshot().volumeMax,1)
    const noFilter=run(new EngineRPM(),1,state(),{},{...config,filterIntensity:0});assert.equal(noFilter.frequency,18000)
  }finally{engineAudioState.reset()}
  assert.deepEqual(engineAudioState.snapshot(),config)
})

test('model uses configurable up/down inertia and reads the frozen physical state without modifying it',()=>{
  const physical=Object.freeze(state({speed:20})),input=Object.freeze({throttle:1})
  const fast=run(new EngineRPM(),.2,physical,input,{...config,riseTime:.05})
  const slow=run(new EngineRPM(),.2,physical,input,{...config,riseTime:2})
  assert.ok(fast.rpm>slow.rpm)
  const a=new EngineRPM(),b=new EngineRPM();a.rpm=b.rpm=.8
  assert.ok(run(a,.3,state(),{},{...config,fallTime:.1}).rpm<run(b,.3,state(),{},{...config,fallTime:3}).rpm)
  const out=run(new EngineRPM(),1,physical,input,{...config,pitchMin:1,pitchMax:1,volumeMin:.2,volumeMax:.2})
  assert.equal(out.playbackRate,1);assert.equal(out.gain,.2)
})
