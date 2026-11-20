import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Vector3 } from 'three'
import { ParticleSystem, BatchedRenderer, RenderMode } from 'three.quarks'
import { DustTrail } from './DustTrail.js'
import { VFXRuntime } from './VFXRuntime.js'
import { dustResponse } from './dustResponse.js'
import { createDustAtlas } from './dustAtlas.js'
import { vfxState } from './vfxState.js'

const config = { ...vfxState.defaults, humidity: 0 }
const wheel = () => ({ position: new Vector3(4, 0, 3), normal: new Vector3(0, 1, 0), forward: new Vector3(0, 0, 1), surface: 'dirt', grounded: true, radius: .4 })
const state = { speed: 18, rearAngularSpeed: 45, acceleration: 0, yaw: 0, rearLateralVelocity: 0, handbrake: 0, slip: 0 }
function fixture() {
  const scene = new Scene(), runtime = new VFXRuntime(), dust = runtime.register('dust', new DustTrail())
  scene.add(runtime.root)
  return { scene, runtime, dust }
}
function tick(f, w, s = state, c = config, dt = 1 / 60, distance = 3, frame = dt) { f.dust.update(dt, w, s, c, distance, 1, frame, f.runtime) }

test('dust uses tagged dry dirt, independent humidity and real rear-wheel contact; driving inputs remain unchanged', () => {
  const w = wheel(), saved = JSON.stringify(state)
  const dry = dustResponse(w, state, config, 3)
  const slow = dustResponse(w, { ...state, speed: 2, rearAngularSpeed: 5 }, config, 3)
  const acceleration = dustResponse(w, { ...state, acceleration: 16 }, config, 3)
  const skid = dustResponse(w, { ...state, rearAngularSpeed: 0, handbrake: 1, slip: .7, rearLateralVelocity: 7 }, config, 3)
  assert.ok(dry.rate > slow.rate * 2 && acceleration.rate > dry.rate && skid.rate > dry.rate)
  assert.ok(dustResponse(w, state, { ...config, humidity: .85 }, 3).rate < dry.rate * .03)
  for (const change of [{ surface: 'asphalt' }, { grounded: false }]) assert.equal(dustResponse({ ...w, ...change }, state, config, 3).rate, 0)
  assert.equal(dustResponse(w, state, { ...config, humidity: 1 }, 3).rate, 0)
  assert.equal(dustResponse(w, { ...state, speed: 0 }, config, 3).rate, 0)
  assert.ok(dustResponse(w, state, config, 45, .1).rate < dry.rate * .15)
  assert.equal(JSON.stringify(state), saved)
})

test('real Quarks particles stay in world space after moving/rotating the emitter and dissipate after stopping', () => {
  const f = fixture(), w = wheel(), saved = JSON.stringify(state)
  try {
    for (let i = 0; i < 120; i++) tick(f, w)
    assert.ok(f.dust.system instanceof ParticleSystem && f.runtime.renderer instanceof BatchedRenderer)
    assert.equal(f.dust.system.worldSpace, true); assert.equal(f.dust.system.renderMode, RenderMode.BillBoard)
    const ps = f.dust.system, p = ps.particles[0], before = p.position.clone(), emitted = f.dust.emitted
    w.position.set(18, 2, -9); w.forward.set(1, 0, 0)
    tick(f, w, { ...state, speed: 0 }, config, 0)
    assert.ok(p.position.distanceTo(before) < 1e-10, 'Emitter transform cannot drag an existing particle')
    tick(f, w, { ...state, speed: 0 })
    assert.ok(p.position.distanceTo(before) > 0, 'Existing cloud retains independent motion')
    assert.equal(f.dust.emitted, emitted)
    for (let i = 0; i < 600; i++) tick(f, w, { ...state, speed: 0 })
    assert.equal(ps.particleNum, 0)
    assert.equal(JSON.stringify(state), saved)
  } finally { f.runtime.dispose() }
})

test('Quarks emission and pending credits obey a hard cap at slow frame rates, reuse a single batch and resize live', () => {
  const f = fixture(), w = wheel(), c = { ...config, emission: 3, maximum: 96, life: 2 }
  const buffer = f.dust.batch.instanceBuffer, atlas = f.dust.atlas
  try {
    for (let i = 0; i < 60; i++) {
      w.position.z += 1
      tick(f, w, state, c, .2, 3, .2)
      assert.ok(f.dust.system.particleNum <= f.dust.response.budget)
      assert.ok(f.dust.system.particles.length <= c.maximum)
    }
    assert.ok(f.dust.emitted > 20)
    assert.equal(f.runtime.renderer.batches.length, 1)
    assert.equal(f.dust.batch.instanceBuffer, buffer); assert.equal(f.dust.atlas, atlas)
    tick(f, w, state, c, 0, 100, .2)
    assert.equal(f.dust.system.particleNum, 0); assert.equal(f.dust.batch.geometry.instanceCount, 0)
    tick(f, w, state, { ...c, enabled: false })
    assert.equal(f.dust.batch.visible, false)
  } finally { f.runtime.dispose() }
})

test('organic atlas has transparent padding and different irregular tiles; materials keep depth, fog and Anime-safe output', () => {
  const texture = createDustAtlas(64), { data, width } = texture.image
  try {
    const sums = []
    for (let tile = 0; tile < 4; tile++) {
      let sum = 0
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const alpha = data[((y + Math.floor(tile / 2) * 64) * width + x + tile % 2 * 64) * 4 + 3]
        if (x === 0 || x === 63 || y === 0 || y === 63) assert.equal(alpha, 0)
        sum += alpha
      }
      sums.push(sum)
    }
    assert.equal(new Set(sums).size, 4); assert.ok(sums.every(s => s > 10000))
  } finally { texture.dispose() }
  const f = fixture()
  try {
    const m = f.dust.batch.material, shader = { vertexShader: m.vertexShader, fragmentShader: m.fragmentShader }
    m.onBeforeCompile(shader)
    assert.equal(m.depthWrite, false); assert.equal(m.depthTest, true); assert.equal(m.fog, true)
    assert.equal(f.dust.batch.renderOrder, 3)
    assert.match(shader.fragmentShader, /fog_fragment/); assert.match(shader.fragmentShader, /colorspace_fragment/)
    assert.ok(f.dust.system.behaviors.some(b => b.type === 'TurbulenceField'))
  } finally { f.runtime.dispose() }
})

test('fractional Quarks emission preserves its debt, so wet dirt cannot emit a particle every other frame', () => {
  const f = fixture(), w = wheel()
  try {
    const wet = { ...config, humidity: .9 }
    for (let i = 0; i < 120; i++) tick(f, w, state, wet)
    const expected = f.dust.response.rate * 2
    assert.ok(f.dust.emitted > 0 && f.dust.emitted <= Math.ceil(expected) + 1)
    const emitted = f.dust.emitted
    w.surface = 'asphalt'
    for (let i = 0; i < 60; i++) tick(f, w, state, wet)
    assert.equal(f.dust.emitted, emitted, 'Pending fractional emissions must stop at the surface boundary')
  } finally { f.runtime.dispose() }
})
