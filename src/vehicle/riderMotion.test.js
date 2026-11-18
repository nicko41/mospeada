import test from 'node:test'
import assert from 'node:assert/strict'
import { createBikeState, advanceBike } from './bikePhysics.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const flat = () => 0
const crest = (_x, z) => z < 5 ? 0 : z < 15 ? (z - 5) * 0.16 : z < 18 ? 1.6 : z < 28 ? 1.6 - (z - 18) * 0.16 : 0
function moving(sample = flat) {
  const s = createBikeState({ x: 0, z: 0, yaw: 0 }, m, sample)
  s.speed = 20; s.parked = false; s.idleBlend = 0
  return s
}

test('Scott stands through the jump and returns to the seat on landing at 30/120 FPS', () => {
  const result = [30, 120].map(fps => {
    const s = moving(crest)
    let stood = false, landed = false, previousStand = 0
    for (let i = 0; i < fps * 4; i++) {
      advanceBike(s, {}, 1 / fps, m, crest)
      if (s.airborne && s.airTime > 0.35) {
        assert.ok(s.riderStand > 0.97 && s.riderDabLeft === 0 && s.riderDabRight === 0)
        stood = true
      }
      if (stood && s.frontGrounded && s.rearGrounded) {
        if (!landed) assert.ok(s.riderStand > 0.5, 'Knees bend into the landing instead of snapping to seated')
        landed = true
        if (previousStand > 0) assert.ok(s.riderStand <= previousStand)
      }
      previousStand = s.riderStand
    }
    assert.ok(stood && landed && s.riderStand < 0.001)
    return s
  })
  assert.ok(Math.abs(result[0].riderStand - result[1].riderStand) < 1e-10)
})

test('coleada extends only the leg on the actual lean side and retracts after braking', () => {
  for (const steer of [-1, 1]) {
    const s = moving()
    for (let i = 0; i < 66; i++) advanceBike(s, { handbrake: true, steer }, 1 / 120, m, flat)
    const left = s.lean + s.bank < 0
    assert.ok(s[left ? 'riderDabLeft' : 'riderDabRight'] > 0.95)
    assert.equal(s[left ? 'riderDabRight' : 'riderDabLeft'], 0)
    const normal = moving()
    for (let i = 0; i < 66; i++) advanceBike(normal, { steer }, 1 / 120, m, flat)
    assert.equal(normal.riderDabLeft + normal.riderDabRight, 0, 'A normal corner keeps both boots on the pegs')
    for (let i = 0; i < 240; i++) advanceBike(s, { brake: 1 }, 1 / 120, m, flat)
    assert.ok(s.riderDabLeft + s.riderDabRight < 1e-6)
  }
})
