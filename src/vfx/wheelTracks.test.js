import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { WheelTracks } from './WheelTracks.js'
import { wheelTrackResponse } from './wheelTrackResponse.js'
import { dustResponse } from './dustResponse.js'
import { ejectaResponse } from './ejectaResponse.js'
import { vfxState } from './vfxState.js'

const wheel = (x = 0) => ({ position: new Vector3(x, 0, 0), forward: new Vector3(0, 0, 1), grounded: true, surface: 'dirt', radius: .4 })
const motion = { x: 0, z: 0, speed: 8 }
const ground = (x, z, contact) => { Object.assign(contact, { surface: 'dirt', biome: null, earthWeight: 1 }); return x * .1 + z * .03 }
function fixture(settings, sample = ground) {
  const tracks = new WheelTracks(sample, settings), wheels = { front: wheel(-.8), rear: wheel(.8) }
  const tick = (dt = 1 / 60, state = motion, enabled = true) => tracks.update(dt, wheels, state, { humidity: .3 }, enabled)
  tick(); return { tracks, wheels, tick }
}

test('two bikes retain separate curved trails around both riders in one bounded ribbon pool',()=>{
 const sample=(x,z,contact)=>{Object.assign(contact,{surface:'dirt',biome:'desert',earthWeight:1});return 0},tracks=new WheelTracks(sample,{capacity:64,radius:30}),scott={x:0,z:0,speed:8},rand={x:200,z:0,speed:8},sw={front:wheel(-.8),rear:wheel(.8)},rw={front:wheel(199.2),rear:wheel(200.8)},other={state:rand,wheels:rw,configs:{humidity:.08},enabled:true}
 for(const w of [...Object.values(sw),...Object.values(rw)])w.biome='desert'
 try{
  const buffer=tracks.geometry.attributes.position.array,texture=tracks.texture
  for(let i=0;i<50;i++){
   scott.z=rand.z=i*.3
   sw.front.position.z=sw.rear.position.z=scott.z;rw.front.position.z=rw.rear.position.z=rand.z
   rw.front.position.x=199.2+Math.sin(i*.05)*2;rw.rear.position.x=200.8+Math.sin(i*.05)*1.8
   tracks.update(.05,sw,scott,{},true,1,scott,other)
  }
  assert.ok(tracks.stats.recycled>0);assert.ok(tracks.stats.active<=64);assert.ok(Math.abs(tracks.clock-2.5)<1e-8,'Both bikes share one age clock')
  assert.ok(tracks.history.front.x<5&&tracks.otherHistory.front.x>190)
  for(let i=0;i<tracks.highWater;i++){
   const xs=[0,1,2,3].map(v=>tracks.geometry.attributes.position.getX(i*4+v))
   assert.ok(Math.max(...xs)-Math.min(...xs)<3,'No ribbon bridges Scott to Rand')
  }
  const clock=tracks.clock,emitted=tracks.stats.emitted
  tracks.update(0,sw,scott,{},true,1,scott,other);assert.equal(tracks.clock,clock)
  for(let i=0;i<20;i++)tracks.update(.05,sw,scott,{},true,1,scott,other)
  assert.equal(tracks.stats.emitted,emitted,'Neither stationary bike stacks marks')
  rand.z+=.5;rw.front.position.z=rw.rear.position.z=rand.z
  tracks.update(.05,sw,scott,{},false,1,scott,other)
  assert.equal(tracks.history.front,null);assert.ok(tracks.otherHistory.front,'Rand continues while Scott is dismounted')
  assert.ok(tracks.stats.emitted>emitted)
  for(let i=0;i<12;i++)tracks.update(.05,sw,scott,{},false,1,scott)
  for(let i=0;i<tracks.highWater;i++)if(tracks.alive[i])assert.ok(tracks.centers[i*2]<100,'Departed Rand’s distant marks are recycled')
  assert.equal(tracks.geometry.attributes.position.array,buffer);assert.equal(tracks.texture,texture)
 }finally{tracks.dispose()}
})

test('ground response distinguishes mud, sand and exposed soil on grass; maneuvers deepen and widen soil marks', () => {
  const w = wheel(), slow = wheelTrackResponse(w, { speed: 1 }, .3)
  for (const force of [{ brakeBlend: 1 }, { handbrake: 1 }, { boostBlend: 1 }, { slip: .8, rearLateralVelocity: 8 }]) {
    const strong = wheelTrackResponse(w, { speed: 1, ...force }, .3)
    assert.ok(strong.strength > slow.strength && strong.width > slow.width)
  }
  const grass = wheelTrackResponse({ ...w, biome: 'forest', earthWeight: 0 }, { speed: 1 }, .3)
  assert.equal(grass.kind, 'grass'); assert.ok(grass.strength > slow.strength && grass.width > slow.width)
  assert.equal(wheelTrackResponse({ ...w, biome: 'grass' }, motion).kind, 'grass')
  assert.equal(wheelTrackResponse(w, motion, .9).kind, 'mud')
  assert.equal(wheelTrackResponse({ ...w, biome: 'desert' }, motion, .9).kind, 'sand')
  for (const change of [{ surface: 'asphalt' }, { surface: null }, { surface: 'water' }, { grounded: false }]) assert.equal(wheelTrackResponse({ ...w, ...change }, motion).allowed, false)
  const c = { ...vfxState.defaults, humidity: .2 }
  for (const action of [{ boostBlend: 1 }, { brakeBlend: 1 }, { handbrake: 1 }]) {
    assert.ok(dustResponse(w, { ...motion, ...action }, c, 3).rate > dustResponse(w, motion, c, 3).rate)
    assert.ok(ejectaResponse(w, { ...motion, ...action }, 'rear', c, 0, 3, .016).mud > ejectaResponse(w, motion, 'rear', c, 0, 3, .016).mud)
  }
})

test('ribbons follow independent curved wheel paths and sampled slopes with shared seam vertices', () => {
  const { tracks, wheels, tick } = fixture()
  try {
    wheels.front.position.z = wheels.rear.position.z = .4; tick()
    wheels.front.position.x += .2; wheels.rear.position.x += .1
    wheels.front.position.z += .35; wheels.rear.position.z += .35; tick()
    assert.ok(tracks.stats.emitted >= 4)
    const p = tracks.geometry.attributes.position
    for (let i = 0; i < p.count && i < tracks.highWater * 4; i++) assert.ok(Math.abs(p.getY(i) - (p.getX(i) * .1 + p.getZ(i) * .03 + .018)) < 1e-6)
    // First front segment, rear segment, then next front: exact joined edges.
    for (let v = 0; v < 2; v++) for (let axis = 0; axis < 3; axis++) assert.equal(p.array[(2 + v) * 3 + axis], p.array[(8 + v) * 3 + axis])
    assert.ok(tracks.history.front.x < tracks.history.rear.x)
    const before = tracks.stats.emitted, clock = tracks.clock
    tick(0); assert.equal(tracks.clock, clock)
    for (let i = 0; i < 30; i++) tick()
    assert.equal(tracks.stats.emitted, before, 'Resting wheels do not stack decals')
  } finally { tracks.dispose() }
})

test('no connection crosses road strips, airborne wheels, disabled forms, teleports or reversals', () => {
  const sample = (x, z, contact) => { ground(x, z, contact); if (z > .25 && z < .75) contact.surface = 'asphalt'; return 0 }
  const { tracks, wheels, tick } = fixture({}, sample)
  try {
    wheels.front.position.z = wheels.rear.position.z = 1; tick()
    assert.equal(tracks.stats.emitted, 0, 'Subsamples reject an asphalt strip even when both ends are dirt')
    tick(); wheels.front.position.z = wheels.rear.position.z = 1.3; tick()
    const before = tracks.stats.emitted; assert.ok(before > 0)
    wheels.front.grounded = wheels.rear.grounded = false; tick()
    wheels.front.position.z = wheels.rear.position.z = 2
    wheels.front.grounded = wheels.rear.grounded = true; tick(); assert.equal(tracks.stats.emitted, before)
    tick(.016, motion, false); wheels.front.position.z = wheels.rear.position.z = 2.5; tick(); assert.equal(tracks.stats.emitted, before)
    wheels.front.position.z = wheels.rear.position.z = 100; tick(); assert.equal(tracks.stats.emitted, before)
    wheels.front.position.z = wheels.rear.position.z = 99; tick(.016, { ...motion, speed: -8 }); assert.equal(tracks.stats.emitted, before)
  } finally { tracks.dispose() }
})

test('fixed segment pool reuses buffers, expires distant/old tracks and clears without allocating geometry', () => {
  const { tracks, wheels, tick } = fixture({ capacity: 12, lifetime: 2, radius: 10 })
  const position = tracks.geometry.attributes.position.array, texture = tracks.texture
  try {
    for (let i = 0; i < 30; i++) { wheels.front.position.z += .3; wheels.rear.position.z += .3; tick(.016) }
    assert.equal(tracks.stats.active, 12); assert.ok(tracks.stats.recycled > 0)
    assert.equal(tracks.geometry.drawRange.count, 72); assert.equal(tracks.geometry.attributes.position.array, position)
    for (let i = 0; i < 16; i++) tick(.25, motion, false)
    assert.equal(tracks.stats.active, 0)
    tick(); wheels.front.position.z += .3; wheels.rear.position.z += .3; tick()
    assert.ok(tracks.stats.active > 0)
    tick(.6, { ...motion, x: 1000 }, false); assert.equal(tracks.stats.active, 0)
    tracks.clear(); assert.equal(tracks.geometry.drawRange.count, 0); assert.equal(tracks.texture, texture)
  } finally { tracks.dispose() }
})
