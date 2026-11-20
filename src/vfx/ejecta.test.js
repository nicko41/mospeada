import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Vector3 } from 'three'
import { VFXRuntime } from './VFXRuntime.js'
import { DustTrail } from './DustTrail.js'
import { WheelEjecta } from './WheelEjecta.js'
import { ejectaResponse } from './ejectaResponse.js'
import { vfxState } from './vfxState.js'

const config = { ...vfxState.defaults }, state = { speed: 18, rearAngularSpeed: 45, frontAngularSpeed: 45, acceleration: 8, yaw: 0, slip: .3, rearLateralVelocity: 3, handbrake: .5 }
const wheel = (surface = 'dirt', z = 0) => ({ position: new Vector3(3, 0, z), normal: new Vector3(0, 1, 0), forward: new Vector3(0, 0, 1), grounded: true, radius: .4, surface })
function fixture() { const scene = new Scene(), runtime = new VFXRuntime(), dust = runtime.register('dust', new DustTrail()), ejecta = runtime.register('ejecta', new WheelEjecta()); scene.add(runtime.root); return { scene, runtime, dust, ejecta } }
function tick(f, wheels, c = config, s = state, dt = 1 / 60, distance = 5) {
  f.ejecta.prepare(dt, wheels, s, c, 1, distance, 1, dt)
  f.dust.update(dt, wheels.rear, s, c, distance, 1, dt, f.runtime)
}

test('water requires wet asphalt, earth/mud trade with humidity, skids intensify all wheel emissions', () => {
  const road = ejectaResponse(wheel('asphalt'), state, 'rear', config, 1, 5, .016)
  assert.ok(road.water > 0); assert.equal(road.earth + road.mud, 0)
  assert.equal(ejectaResponse(wheel('asphalt'), state, 'rear', config, 0, 5, .016).water, 0)
  const dry = ejectaResponse(wheel(), state, 'rear', { ...config, humidity: 0 }, 1, 5, .016)
  const wet = ejectaResponse(wheel(), state, 'rear', { ...config, humidity: 1 }, 1, 5, .016)
  assert.ok(dry.earth > 0 && dry.mud === 0 && wet.mud > 0 && wet.earth === 0)
  const moving = { ...state, acceleration: 0, slip: 0, rearLateralVelocity: 0, handbrake: 0 }
  assert.ok(ejectaResponse(wheel(), state, 'rear', config, 1, 5, .016).mud > ejectaResponse(wheel(), moving, 'rear', config, 1, 5, .016).mud)
  assert.equal(ejectaResponse({ ...wheel(), grounded: false }, state, 'rear', config, 1, 5, .016).mud, 0)
})

test('all dynamic effects share Quarks: 7 unique wheel/dust systems, 3 batches, bounded reusable buffers', () => {
  const f = fixture(), wheels = { front: wheel('asphalt', 1), rear: wheel('dirt', -1) }, c = { ...config, maximum: 96, water: 3, earth: 3, mud: 3 }, saved = JSON.stringify(state)
  const buffers = f.runtime.renderer.batches.map(b => b.instanceBuffer)
  try {
    for (let i = 0; i < 90; i++) {
      tick(f, wheels, c, state, .2)
      for (const r of f.ejecta.records) { assert.ok(r.system.particleNum <= r.response.quota); assert.ok(r.system.particles.length <= Math.ceil(c.maximum * .6 / 6)) }
    }
    assert.equal(f.runtime.renderer.systemToBatchIndex.size, 7); assert.equal(f.runtime.renderer.batches.length, 3)
    f.runtime.renderer.batches.forEach((b, i) => assert.equal(b.instanceBuffer, buffers[i]))
    assert.ok(f.ejecta.emitted.water > 0 && f.ejecta.emitted.earth > 0 && f.ejecta.emitted.mud > 0)
    assert.equal(JSON.stringify(state), saved)
    const waterEmitted = f.ejecta.emitted.water
    for (let i = 0; i < 60; i++) tick(f, wheels, { ...c, waterEnabled: false })
    assert.equal(f.ejecta.emitted.water, waterEmitted)
    tick(f, wheels, c, state, 0, 100)
    for (const ps of f.ejecta.systems) assert.equal(ps.particleNum, 0)
  } finally { f.runtime.dispose() }
})

test('ejecta keeps world inertia, earth bounces once, and stopping emits nothing while old particles dissipate', () => {
  const f = fixture(), wheels = { front: wheel('dirt', 1), rear: wheel('dirt', -1) }, c = { ...config, humidity: .4 }
  try {
    for (let i = 0; i < 120; i++) tick(f, wheels, c)
    assert.ok(f.ejecta.bounces > 0)
    const r = f.ejecta.records.find(r => r.type === 'mud' && r.side === 'rear'), p = r.system.particles[0], before = p.position.clone()
    wheels.rear.position.x += 8; wheels.rear.forward.set(1, 0, 0)
    tick(f, wheels, c, state, 0)
    assert.equal(p.position.distanceTo(before), 0)
    for (const ps of f.ejecta.systems) assert.equal(ps.worldSpace, true)
    const emitted = { ...f.ejecta.emitted }
    for (let i = 0; i < 90; i++) tick(f, wheels, c, { ...state, speed: 0 })
    assert.deepEqual(f.ejecta.emitted, emitted)
    for (const ps of f.ejecta.systems) assert.equal(ps.particleNum, 0)
  } finally { f.runtime.dispose() }
})
