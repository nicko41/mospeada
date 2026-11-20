import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createDrivingCyclone } from '../vehicle/createDrivingCyclone.js'
import { VFXRuntime } from './VFXRuntime.js'
import { EngineSmoke } from './EngineSmoke.js'
import { measureEngineSockets } from './engineSockets.js'
import { engineVFXState } from './engineVFXState.js'
import { ExhaustBurstCycle } from './ExhaustBurstCycle.js'

globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const bytes = fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb')
const source = new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
const config = { ...engineVFXState.defaults }, state = { speed: 18, yaw: 0, travelYaw: 0, acceleration: 8, riderMode: 'mounted', boostTime: 0, boostCount: 0, airborne: false, verticalVelocity: 0 }
async function fixture() { const rig = createDrivingCyclone((await source).scene), runtime = new VFXRuntime(), scene = new T.Scene(); scene.add(rig.root, runtime.root); const engine = runtime.register('engine', new EngineSmoke(rig)); return { rig, runtime, scene, engine } }
function tick(f, s = state, input = { throttle: 1 }, cfg = config, dt = 1 / 60, distance = 5) { f.engine.prepare(dt, s, input, cfg, distance, 1, dt); if (dt > 0) for (let i = 0; i < Math.ceil(dt * 60); i++) f.runtime.update(dt / Math.ceil(dt * 60)) }

test('approved idle and booster profiles remain exactly unchanged', async () => {
  const f = await fixture()
  try {
    f.engine.prepare(1 / 60, { speed: 0, yaw: 0, travelYaw: 0, acceleration: 0, riderMode: 'mounted', boostTime: 0 }, { throttle: 0 }, config, 5, 1, 1 / 60)
    const actual = f.engine.records.map(r => ({ id: r.id, renderMode: r.system.renderMode, size: r.system.startSize.toJSON(), color: r.system.startColor.toJSON(), shape: r.system.emitterShape.toJSON(), speed: [r.speed.a, r.speed.b], life: [r.life.a, r.life.b], opacity: r.opacity, sizeFactor: r.sizeFactor, rate: r.desired, behaviors: r.system.behaviors.map(b => b.toJSON()) }))
    assert.deepEqual(actual, JSON.parse(fs.readFileSync('artifacts/exhaust-bursts/approved-idle-boost.json', 'utf8')))
    assert.equal(f.engine.riding.records.reduce((n, r) => n + r.cycle.bursts, 0), 0)
  } finally { f.runtime.dispose() }
})

test('burst cadence responds to load, has variable gaps, and does not advance while paused or idle', () => {
  function sample(acceleration) {
    const c = new ExhaustBurstCycle(), starts = []; let active = 0
    for (let i = 0; i < 1200; i++) { const before = c.bursts; if (c.update(1 / 120, true, 1, acceleration)) active++; if (c.bursts > before) starts.push(i) }
    return { c, starts, active }
  }
  const cruise = sample(0), acceleration = sample(14)
  assert.ok(acceleration.starts.length > cruise.starts.length * 2)
  assert.ok(acceleration.active < 1200 * .3)
  assert.ok(new Set(acceleration.starts.slice(1).map((t, i) => t - acceleration.starts[i])).size > 3)
  const c = acceleration.c, before = JSON.stringify(c)
  c.update(0, true, 1, 14); assert.equal(JSON.stringify(c), before)
  c.update(1 / 60, true, 0, 0)
  for (let i = 0; i < 3; i++) c.update(1 / 60, true, 0, 0)
  assert.equal(c.remaining, 0)
  const bursts = c.bursts
  for (let i = 0; i < 120; i++) assert.equal(c.update(1 / 60, false, 0, 0), 0)
  assert.equal(c.bursts, bursts)
})

test('reverse keeps idle smoke and trails start only above 50 km/h forward', async () => {
  const f = await fixture()
  try {
    for (const speed of [-18, -.9, 0, 30 / 3.6, 50 / 3.6]) {
      const before = f.engine.movingEmitted
      for (let i = 0; i < 120; i++) tick(f, { ...state, speed, acceleration: 0 }, { throttle: speed > 0 ? 1 : 0 })
      assert.equal(f.engine.movingEmitted, before, `unexpected trails at ${speed * 3.6} km/h`)
      for (const r of f.engine.records.slice(0, 2)) {
        assert.equal(r.speed.a, .7); assert.equal(r.speed.b, 1.3)
        assert.ok(r.desired <= .3)
      }
    }
    for (let i = 0; i < 60; i++) tick(f, { ...state, speed: 50.1 / 3.6 })
    assert.ok(f.engine.movingEmitted > 0)
    assert.ok(f.engine.records.slice(0, 2).every(r => r.desired === 0))
    const before = f.engine.movingEmitted
    for (let i = 0; i < 60; i++) tick(f, { ...state, speed: -.9 }, { throttle: 0 })
    assert.equal(f.engine.movingEmitted, before)
    assert.ok(f.engine.riding.systems.every(ps => ps.particleNum === 0))
  } finally { f.runtime.dispose() }
})

test('riding steam stays horizontal despite exhaust rake, wheelie and suspension, retaining world inertia after a turn', async () => {
  const f = await fixture()
  try {
    f.rig.body.rotation.x = -.55; f.rig.root.rotation.y = .7; f.rig.root.updateMatrixWorld(true)
    tick(f)
    for (let i = 0; i < 5; i++) {
      f.rig.root.position.add(new T.Vector3(.03, .1, .08)); f.rig.root.updateMatrixWorld(true); tick(f)
    }
    for (const r of f.engine.riding.records) {
      assert.equal(r.direction.y, 0); assert.equal(r.inertia.y, 0)
      assert.ok(Math.abs(r.direction.length() - 1) < 1e-10)
      assert.ok(r.system.worldSpace && r.system.particleNum > 0)
      assert.ok(Math.abs(r.inertia.x - 1.8) < 1e-8 && Math.abs(r.inertia.z - 4.8) < 1e-8)
    }
    // Idle smoke still follows the real, tilted silencer axis.
    assert.ok(Math.abs(f.engine.records[0].direction.y) > .1)
    const r = f.engine.riding.records[0], p = r.system.particles[0], position = p.position.clone(), rotation = p.rotation.clone()
    f.rig.root.position.x += 3; f.rig.root.rotation.y += .8; f.rig.root.updateMatrixWorld(true)
    tick(f, state, {}, config, 0)
    assert.equal(p.position.distanceTo(position), 0); assert.deepEqual(p.rotation, rotation)
  } finally { f.runtime.dispose() }
})

test('exhaust mouths are measured on the real model, match metal lip depth and follow articulated transforms without adding bike geometry', async () => {
  const rig = createDrivingCyclone((await source).scene), count = rig.body.children.length, geometries = rig.surfaces.map(m => m.geometry), sockets = measureEngineSockets(rig)
  assert.equal(sockets.exhausts.length, 2)
  assert.ok(sockets.exhausts[0].bodyPosition.x * sockets.exhausts[1].bodyPosition.x < 0)
  for (const s of sockets.exhausts) {
    assert.ok(s.bodyDirection.z < -.9 && s.bodyDirection.y > .1)
    assert.ok(s.bodyPosition.z < rig.metrics.rearZ)
    assert.ok(s.bodyPosition.distanceTo(rig.body.worldToLocal(s.mesh.localToWorld(s.localPosition.clone()))) < 1e-8)
  }
  assert.ok(sockets.provisional.y > Math.max(...sockets.exhausts.map(s => s.bodyPosition.y)) + .1)
  assert.equal(rig.body.children.length, count); rig.surfaces.forEach((m, i) => assert.equal(m.geometry, geometries[i]))
  rig.root.rotation.y = .7; rig.body.rotation.x = -.35; rig.root.position.y = 4; rig.root.updateMatrixWorld(true)
  const socket = sockets.exhausts[0], actual = socket.mesh.localToWorld(socket.localPosition.clone()), expected = rig.body.localToWorld(socket.bodyPosition.clone())
  assert.ok(actual.distanceTo(expected) < 1e-8)
})

test('idle smoke stays occasional; riding uses short bursts and cuts emission on throttle release', async () => {
  const f = await fixture(), idle = { ...state, speed: 0, acceleration: 0 }
  try {
    for (let i = 0; i < 720; i++) tick(f, idle, { throttle: 0 })
    const idling = f.engine.emitted.exhaust
    assert.ok(idling > 0 && idling < 25)
    for (let i = 0; i < 120; i++) tick(f)
    assert.ok(f.engine.emitted.exhaust - idling > 5)
    assert.equal(f.engine.movingEmitted, f.engine.emitted.exhaust - idling)
    assert.ok(f.engine.records.slice(0, 2).every(r => r.desired === 0))
    tick(f, { ...state, acceleration: 0 }, { throttle: 0 })
    for (let i = 0; i < 3; i++) tick(f, { ...state, acceleration: 0 }, { throttle: 0 })
    const emitted = f.engine.movingEmitted
    for (let i = 0; i < 30; i++) tick(f, { ...state, acceleration: 0 }, { throttle: 0 })
    assert.equal(f.engine.movingEmitted, emitted)
    assert.ok(f.engine.riding.systems.every(ps => ps.particleNum === 0))
    assert.equal(f.engine.emitted.boost, 0)
  } finally { f.runtime.dispose() }
})

test('boost has two distinct zones, leaves world-space inertia after turning and dissipates after state ends even in the air', async () => {
  const f = await fixture(), s = { ...state, boostTime: .55, airborne: true, verticalVelocity: 3 }, saved = JSON.stringify(s)
  try {
    f.rig.root.position.y = 5; f.rig.body.rotation.x = -.35; f.rig.root.updateMatrixWorld(true)
    for (let i = 0; i < 30; i++) tick(f, s)
    const core = f.engine.records[2], plume = f.engine.records[3]
    assert.notEqual(core.system.renderMode, plume.system.renderMode)
    // These are independent emissions: exhaust burst density is no longer
    // a useful denominator for checking the unchanged boost impulse.
    assert.ok(f.engine.emitted.core > 30 && f.engine.emitted.plume > 50)
    assert.ok(core.current.y > 5 && core.direction.dot(new T.Vector3(0, 0, -1).transformDirection(f.rig.body.matrixWorld)) > .999)
    const p = plume.system.particles[0], before = p.position.clone()
    f.rig.root.position.x = 8; f.rig.root.rotation.y = .8; f.rig.root.updateMatrixWorld(true)
    tick(f, { ...s, boostTime: 0 }, {}, config, 0)
    assert.equal(p.position.distanceTo(before), 0)
    const emitted = f.engine.emitted.boost
    for (let i = 0; i < 30; i++) tick(f, { ...s, boostTime: 0 }, { throttle: 0 })
    assert.equal(f.engine.emitted.boost, emitted); assert.ok(plume.system.particleNum > 0); assert.equal(core.system.particleNum, 0)
    for (let i = 0; i < 300; i++) tick(f, { ...s, boostTime: 0 }, { throttle: 0 })
    assert.equal(plume.system.particleNum, 0); assert.equal(JSON.stringify(s), saved)
  } finally { f.runtime.dispose() }
})

test('smoke shares three Quarks batches, obeys quotas on slow frames and keeps independent controls and resources', async () => {
  const f = await fixture(), cfg = { ...config, boostIntensity: 3, boostLength: 2 }, s = { ...state, boostTime: .55 }
  const buffers = [...f.engine.batches].map(b => b.instanceBuffer), atlas = f.engine.atlas
  try {
    for (let i = 0; i < 60; i++) { tick(f, s, { throttle: 1 }, cfg, .2); for (const r of [...f.engine.records, ...f.engine.riding.records]) assert.ok(r.system.particleNum <= r.quota) }
    assert.equal(f.runtime.renderer.batches.length, 3)
    assert.equal(f.runtime.renderer.systemToBatchIndex.size, 6)
    assert.equal(f.engine.atlas, atlas); [...f.engine.batches].forEach((b, i) => assert.equal(b.instanceBuffer, buffers[i]))
    const emitted = f.engine.emitted.boost
    for (let i = 0; i < 60; i++) tick(f, s, {}, { ...cfg, boostEnabled: false })
    assert.equal(f.engine.emitted.boost, emitted)
    const old = f.engine.records[3].current.clone()
    tick(f, s, {}, { ...cfg, boostX: .2, boostY: .1, boostPitch: 20 }, 0)
    assert.ok(f.engine.records[3].current.distanceTo(old) > .2)
    tick(f, s, {}, cfg, 0, 100)
    for (const r of [...f.engine.records, ...f.engine.riding.records]) assert.equal(r.system.particleNum, 0)
  } finally { f.runtime.dispose() }
})
