import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {TerrainSounds,terrainSoundMix} from './TerrainSounds.js'
import {SOUND_EFFECTS,PLAYER_INITIAL_AUDIO_URLS} from './gameAudio.js'

const contact=(surface='dirt',patch={})=>({surface,grounded:true,...patch})
function fixture(){
 const calls=[],stops=[],updates=[],audio={blocked:false,play(name,options){if(this.blocked)return null;const source={name,options};calls.push(source);return source},stop(source,fade){stops.push({source,fade})},modulate(source,values){updates.push({source,...values})}}
 const sounds=new TerrainSounds(audio),state={speed:12,handbrake:0,airborne:false},wheels={front:contact(),rear:contact()},input={handbrake:false}
 const tick=options=>sounds.update({state,wheels,input,...options})
 return {sounds,state,wheels,input,audio,calls,stops,updates,tick}
}

test('terrain mixing follows actual grounded tags, forest pasture weight and desert overrides',()=>{
 const mix=(a,b=a)=>terrainSoundMix({front:a,rear:b})
 assert.deepEqual(mix(contact()),{terrainDirtPass:1,terrainGrassPass:0})
 assert.deepEqual(mix(contact('grass')),{terrainDirtPass:0,terrainGrassPass:1})
 assert.deepEqual(mix(contact('dirt',{biome:'forest',earthWeight:.25})),{terrainDirtPass:.25,terrainGrassPass:.75})
 assert.deepEqual(mix(contact('sand',{biome:'desert',earthWeight:0})),{terrainDirtPass:1,terrainGrassPass:0})
 assert.deepEqual(mix(contact('asphalt')),{terrainDirtPass:0,terrainGrassPass:0})
 assert.deepEqual(mix(contact(),contact('grass')),{terrainDirtPass:.5,terrainGrassPass:.5})
 assert.deepEqual(mix(contact(),contact('dirt',{grounded:false})),{terrainDirtPass:.5,terrainGrassPass:0})
})

test('rolling loops crossfade without restarting, duplicating, loading or changing pitch',()=>{
 const f=fixture();f.tick();const dirt=f.sounds.loops.terrainDirtPass
 for(let i=0;i<500;i++)f.tick();assert.equal(f.calls.length,1);assert.equal(dirt.options.loop,true)
 assert.equal(dirt.options.gain,0);assert.equal(f.sounds.gains.terrainDirtPass,1)
 Object.assign(f.wheels.front,{biome:'forest',earthWeight:.4});Object.assign(f.wheels.rear,f.wheels.front);f.tick()
 const grass=f.sounds.loops.terrainGrassPass
 assert.equal(f.sounds.gains.terrainDirtPass,.4);assert.equal(f.sounds.gains.terrainGrassPass,.6)
 f.wheels.front.earthWeight=f.wheels.rear.earthWeight=0;f.tick();assert.equal(f.sounds.gains.terrainDirtPass,0)
 f.wheels.front.earthWeight=f.wheels.rear.earthWeight=1;f.tick();assert.equal(f.sounds.loops.terrainDirtPass,dirt);assert.equal(f.sounds.loops.terrainGrassPass,grass)
 assert.equal(f.calls.length,2);assert.equal(f.stops.length,0)
 f.sounds.dispose();assert.equal(f.stops.length,2);assert.ok(f.stops.every(call=>call.fade===0))
})

test('standstill, airborne, pause, Armor/transform/defeat gating and unsupported ground silence rolling loops',()=>{
 const f=fixture();f.state.speed=0;f.tick();assert.equal(f.calls.length,0)
 f.state.speed=8;f.tick();const source=f.sounds.loops.terrainDirtPass
 for(const patch of [{paused:true},{enabled:false}]){f.tick(patch);assert.equal(f.sounds.gains.terrainDirtPass,0)}
 f.state.airborne=true;f.tick();assert.equal(f.sounds.gains.terrainDirtPass,0);f.state.airborne=false
 f.wheels.front.grounded=f.wheels.rear.grounded=false;f.tick();assert.equal(f.sounds.gains.terrainDirtPass,0)
 f.wheels.front.grounded=f.wheels.rear.grounded=true;f.tick();assert.equal(f.sounds.loops.terrainDirtPass,source);assert.equal(f.calls.length,1)
 f.state.speed=0;f.state.burnout={blend:1};f.tick();assert.equal(f.sounds.gains.terrainDirtPass,0)
})

test('effective handbrake skid sounds once per hold on dirt/grass/desert, never on asphalt, in air or at rest',()=>{
 const f=fixture(),skids=()=>f.calls.filter(c=>c.name==='terrainDirtDrift')
 f.input.handbrake=true;f.tick();assert.equal(skids().length,0,'Physical brake has not engaged yet')
 f.state.handbrake=.4;for(let i=0;i<300;i++)f.tick();assert.equal(skids().length,1);assert.equal(skids()[0].options.loop,undefined)
 f.wheels.front.surface=f.wheels.rear.surface='grass';f.tick();assert.equal(skids().length,1)
 f.input.handbrake=false;f.tick();f.input.handbrake=true;f.tick();assert.equal(skids().length,2)
 f.input.handbrake=false;f.tick();f.input.handbrake=true;f.tick({paused:true});f.tick();assert.equal(skids().length,2,'Pausing cannot replay the held skid')
 for(const surface of ['asphalt','dirt']){
  f.input.handbrake=false;f.tick();f.input.handbrake=true;f.wheels.front.surface=f.wheels.rear.surface=surface;f.state.speed=0;f.tick();assert.equal(skids().length,2)
 }
 f.state.speed=12;f.state.airborne=true;f.tick();assert.equal(skids().length,2)
})

test('terrain files preload with replacement dirt at 57% and grass/skid at 35%; locked contexts retry cached loop playback',()=>{
 const f=fixture();f.audio.blocked=true;f.tick();assert.equal(f.calls.length,0)
 f.audio.blocked=false;f.tick();f.tick();assert.equal(f.calls.length,1)
 for(const name of ['terrainDirtPass','terrainGrassPass','terrainDirtDrift']){
  const effect=SOUND_EFFECTS[name],url=effect.variants[0].url
  assert.equal(effect.volume,name==='terrainDirtPass'?.57:.35);assert.ok(PLAYER_INITIAL_AUDIO_URLS.includes(url));assert.ok(fs.statSync(new URL(url)).size>1000)
  if(name==='terrainDirtPass')assert.match(url,/terrain-dirt-pass2\.mp3(?:\?|$)/)
 }
})

test('skid sound fades out as soon as the gesture or effective ground slide ends, without replaying a held brake',()=>{
 for(const end of [f=>f.input.handbrake=false,f=>f.state.speed=0,f=>f.state.handbrake=0,f=>f.state.airborne=true,f=>{f.wheels.front.surface=f.wheels.rear.surface='asphalt'}]){
  const f=fixture();f.input.handbrake=true;f.state.handbrake=.8;f.tick();const source=f.sounds.drift
  assert.ok(source);assert.equal(source.options.fadeIn,.015)
  end(f);f.tick();assert.equal(f.sounds.drift,null)
  assert.deepEqual(f.stops,[{source,fade:.06}]);f.tick();assert.equal(f.stops.length,1)
  if(f.input.handbrake){f.state.speed=12;f.state.handbrake=.8;f.state.airborne=false;f.wheels.front.surface=f.wheels.rear.surface='dirt';f.tick();assert.equal(f.calls.filter(c=>c.name==='terrainDirtDrift').length,1)}
 }
})
