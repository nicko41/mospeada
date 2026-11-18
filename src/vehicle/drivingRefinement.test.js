import test from 'node:test'
import assert from 'node:assert/strict'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { reverseFootTarget } from './riderMotion.js'
import { bikeConfig as c } from './bikeConfig.js'
import { terrainHeight } from '../world/terrain.js'
import { highwayLiftAt } from '../world/sectors/highwayProfile.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const flat = () => 0
function state(speed = 20, sample = flat, start = { x: 0, z: 0, yaw: 0 }) {
  const s = createBikeState(start, m, sample); s.speed = speed; s.parked = false; s.idleBlend = 0; return s
}

test('the highway elevation launches a faster bike higher, including above engine speed', () => {
  const sample = (x, z) => terrainHeight(x, z) + highwayLiftAt(x, z)
  const peaks = [8, 20, 40, 80].map(speed => {
    const s = state(speed, sample, { x: 50, z: -104, yaw: 0 }); let peak = s.height
    for (let i = 0; i < 1000 && s.z < -20; i++) { advanceBike(s, {}, 1 / 120, m, sample); peak = Math.max(peak, s.height) }
    return peak
  })
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] > peaks[i - 1] + 0.25, JSON.stringify(peaks))
})

test('holding S brakes to zero before foot-powered reverse, with a brief planting pause', () => {
  const waiting = state(0)
  advanceBike(waiting, { brakeReverse: true, boost: true }, 1 / 120, m, flat)
  assert.equal(waiting.boostCount, 0, 'S also blocks the turbine during the foot-planting pause')
  const s = state(); let stoppedAt = null, reverseAt = null
  for (let i = 0; i < 500; i++) {
    advanceBike(s, { brakeReverse: true }, 1 / 120, m, flat)
    if (s.speed === 0) stoppedAt ??= i / 120
    if (s.speed < 0) { reverseAt = i / 120; break }
    if (stoppedAt === null) assert.ok(s.speed > 0)
  }
  assert.ok(stoppedAt !== null && reverseAt > stoppedAt + 0.15)
  for (let i = 0; i < 300; i++) advanceBike(s, { brakeReverse: true }, 1 / 120, m, flat)
  assert.ok(s.speed <= -0.5 && s.speed >= -c.reverseSpeed && s.boostTime === 0)
  for (let i = 0; i < 120; i++) advanceBike(s, {}, 1 / 120, m, flat)
  assert.equal(s.speed, 0)
})

test('reverse alternates grounded feet, locks each planted contact and lifts the returning foot', () => {
  const s = state(0), seen = new Set(); let previous = { Left: null, Right: null }
  for (let i = 0; i < 600; i++) {
    advanceBike(s, { brakeReverse: true }, 1 / 120, m, flat)
    for (const side of ['Left', 'Right']) {
      const anchor = s.reverseFeet[side], p = reverseFootTarget(s, side, c)
      if (anchor && previous[side]?.cycle === anchor.cycle) assert.deepEqual(anchor, previous[side], 'A planted foot cannot slide with the bike')
      if (s.reverseBlend > 0.99) seen.add(side + (p.lift > 0.01 ? '-swing' : '-plant'))
      previous[side] = anchor && { ...anchor }
    }
  }
  assert.deepEqual([...seen].sort(), ['Left-plant', 'Left-swing', 'Right-plant', 'Right-swing'])
})

test('road inputs create subtle suspension motion, stronger on dirt, and stop without wheel hopping', () => {
  const spans = ['asphalt', 'dirt'].map(surface => {
    const sample = (_x, _z, hit) => { if (hit) hit.surface = surface; return 0 }
    const s = state(20, sample); let low = 0, high = 0
    for (let i = 0; i < 480; i++) {
      advanceBike(s, {}, 1 / 120, m, sample)
      assert.ok(s.frontGrounded && s.rearGrounded)
      if (i > 120) { low = Math.min(low, s.height); high = Math.max(high, s.height) }
    }
    for (let i = 0; i < 360; i++) advanceBike(s, { brake: 1 }, 1 / 120, m, sample)
    assert.equal(s.speed, 0); assert.ok(Math.abs(s.height) < 0.0001)
    return high - low
  })
  assert.ok(spans[0] > 0.003 && spans[0] < 0.012 && spans[1] > spans[0] * 3 && spans[1] < 0.05)
})

test('boost kick decays quickly and the new controls and suspension remain deterministic at 30/120 FPS', () => {
  const sample = (_x, _z, hit) => { if (hit) hit.surface = 'dirt'; return 0 }
  const result = [30, 120].map(fps => {
    const s = state(12, sample)
    for (let i = 0; i < fps * 0.1; i++) {
      advanceBike(s, { boost: true, throttle: 1 }, 1 / fps, m, sample)
      if (i === 0) assert.ok(s.boostKick > 0.5)
    }
    for (const [input, seconds] of [[{ throttle: 1 }, 0.2], [{ brakeReverse: true }, 4], [{}, 1]])
      for (let i = 0; i < seconds * fps; i++) advanceBike(s, input, 1 / fps, m, sample)
    assert.ok(s.boostKick < 0.001)
    return s
  })
  for (const key of ['speed', 'x', 'z', 'height', 'reversePhase', 'reverseBlend', 'frontSpring', 'rearSpring']) assert.ok(Math.abs(result[0][key] - result[1][key]) < 1e-8, key)
})
