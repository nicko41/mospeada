import test from 'node:test'
import assert from 'node:assert/strict'
import {DroneFlightSound} from './DroneFlightSound.js'
import {SOUND_EFFECTS} from './gameAudio.js'

function fixture(){
  const calls=[],updates=[],stops=[],audio={play(name,options){const source={name,options};calls.push(source);return source},modulate(source,values){updates.push({source,...values})},stop(source,fade){stops.push({source,fade})}}
  const flight=new DroneFlightSound(audio),listener={x:0,y:0,z:0},encounter={active:true,drones:[{spawned:false,dead:false,position:{x:0,y:3,z:18}}]}
  const tick=options=>flight.update({encounter,listener,...options})
  return{flight,listener,encounter,tick,calls,updates,stops}
}

test('unspawned/dead drones stay silent, while a living drone loops through encounter phase changes',()=>{
  const f=fixture();f.tick();assert.equal(f.calls.length,0)
  f.encounter.drones[0].spawned=true;f.encounter.drones[0].dead=true;f.tick();assert.equal(f.calls.length,0)
  f.encounter.drones[0].dead=false;f.encounter.active=false;f.tick();assert.equal(f.calls.length,1);assert.ok(f.updates.at(-1).gain>0)
})

test('eleven flying drones share one full-volume test loop without multiplying volume or pitch',()=>{
  const f=fixture();f.encounter.drones[0].spawned=true;f.tick();const gain=f.updates.at(-1).gain
  for(let i=0;i<10;i++)f.encounter.drones.push({spawned:true,dead:false,position:{x:0,y:3,z:18}})
  for(let frame=0;frame<1200;frame++)f.tick()
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'droneFlight');assert.equal(f.calls[0].options.loop,true)
  assert.equal(f.updates.at(-1).gain,gain);assert.ok(gain>0&&gain<=1);assert.equal(SOUND_EFFECTS.droneFlight.volume,1);assert.equal(SOUND_EFFECTS.droneExplosion.volume,1)
})

test('full base volume retains distance attenuation and mutes outside hearing range',()=>{
  const f=fixture(),drone=f.encounter.drones[0];drone.spawned=true
  f.tick();const near=f.updates.at(-1).gain
  drone.position.z=70;f.tick();assert.ok(f.updates.at(-1).gain<near)
  drone.position.z=150;f.tick();assert.ok(f.updates.at(-1).gain>0&&f.updates.at(-1).gain<near)
  drone.position.z=250;f.tick();assert.equal(f.updates.at(-1).gain,0)
})

test('pause preserves the loop, the last explosion stops it, and a later wave reuses the buffer through a fresh voice',()=>{
  const f=fixture(),drone=f.encounter.drones[0];drone.spawned=true;f.tick();const loop=f.flight.loop
  for(const options of [{paused:true},{enabled:false}]){f.tick(options);assert.equal(f.updates.at(-1).gain,0)}
  drone.dead=true;f.tick();assert.equal(f.flight.loop,null);assert.equal(f.stops.length,1);assert.equal(f.stops[0].source,loop)
  f.encounter.active=false;f.tick();assert.equal(f.calls.length,1)
  f.encounter.active=true;drone.dead=false;f.tick();assert.equal(f.calls.length,2);assert.notEqual(f.flight.loop,loop)
  f.flight.dispose();assert.equal(f.stops.length,2);assert.equal(f.stops[1].fade,0)
})
