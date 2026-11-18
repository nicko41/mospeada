import test from 'node:test'
import assert from 'node:assert/strict'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { requestRiderToggle, riderCameraState } from './riderPresence.js'
import { frontSteer } from './wheelieDynamics.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const flat = () => 0, start = { x: 0, z: 0, yaw: 0 }
const state = () => createBikeState(start, m, flat)
function run(s, input, seconds, fps = 120, canWalk) {
  for (let i = 0; i < seconds * fps; i++) advanceBike(s, input, 1 / fps, m, flat, undefined, undefined, canWalk)
}
function moving() { const s = state(); s.speed = 14; s.parked = false; s.idleBlend = 0; return s }

test('Ctrl raises the front around a grounded rear; release lowers it without a terrain jump', () => {
  const s = moving()
  run(s, { throttle: 1, wheelie: true }, 0.65)
  assert.ok(s.wheelieAngle > 0.65 && s.wheelieAngle <= 0.86)
  assert.equal(s.frontGrounded, false); assert.equal(s.rearGrounded, true)
  assert.equal(s.airborne, false); assert.ok(s.riderStand < 0.01)
  run(s, { throttle: 1 }, 1.4)
  assert.equal(s.wheelieAngle, 0); assert.ok(s.wheelieAngle <= 0.86)
  assert.equal(s.frontGrounded, true)
  const stopped = state(); run(stopped, { wheelie: true }, 2); assert.equal(stopped.wheelieAngle, 0)
})

test('held Ctrl stays stable, expires after six seconds and needs release before rearming', () => {
  const s = moving(); run(s, { throttle: 1, wheelie: true }, 4)
  assert.ok(s.wheelieAngle > 0.85 && s.wheelieAngle <= 0.86)
  assert.ok(Math.abs(s.wheelieRemaining - 2) < 1e-8)
  run(s, { throttle: 1, wheelie: true }, 4)
  assert.equal(s.wheelieExhausted, true); assert.equal(s.wheelieTime, 6)
  assert.equal(s.wheelieAngle, 0); assert.equal(s.wheelieRemaining, 0)
  assert.equal(s.frontGrounded, true); assert.equal(s.rearGrounded, true)
  run(s, { throttle: 1, wheelie: true }, 2); assert.equal(s.wheelieAngle, 0)
  run(s, { throttle: 1 }, 0.1); run(s, { throttle: 1, wheelie: true }, 1)
  assert.ok(s.wheelieAngle > 0.8 && s.wheelieRemaining > 4.9)
})

test('wheelie dynamics remain identical at 30 and 120 FPS and braking ends the balance', () => {
  const a = moving(), b = moving()
  run(a, { throttle: 1, wheelie: true }, 0.7, 30); run(b, { throttle: 1, wheelie: true }, 0.7, 120)
  assert.ok(Math.abs(a.wheelieAngle - b.wheelieAngle) < 1e-10)
  run(a, { wheelie: true, brakeReverse: true }, 2)
  assert.equal(a.wheelieAngle, 0); assert.ok(a.wheelieAngle <= 0.86)
})

test('release and timeout drop the front sharply into one suspension impact, compression and rebound', () => {
  function drop(fps, timeout) {
    const s = moving(); run(s, { throttle: 1, wheelie: true }, timeout ? 6 : 2, fps)
    let contact = null, compression = 0, rebound = 0, dive = 0, maxImpact = 0
    for (let frame = 0; frame < 2 * fps; frame++) {
      advanceBike(s, { throttle: 1, wheelie: timeout }, 1 / fps, m, flat)
      if (s.frontLandingCount && contact === null) contact = (frame + 1) / fps
      compression = Math.min(compression, s.frontSpring - s.frontTarget)
      rebound = Math.max(rebound, s.frontSpring - s.frontTarget)
      dive = Math.min(dive, s.height - (s.frontTarget + s.rearTarget) / 2)
      maxImpact = Math.max(maxImpact, s.frontImpact)
      assert.equal(s.airborne, false, 'The contact rebound cannot launch a new jump')
    }
    assert.ok(contact > 0.3 && contact < 0.45, `Drop takes ${contact}s`)
    assert.ok(compression < -0.13 && dive < -0.08, `${compression} / ${dive}`)
    assert.ok(rebound > 0.025 && maxImpact > 0.7, `Rebound ${rebound}, sampled impact ${maxImpact} at ${fps} FPS`)
    assert.equal(s.frontLandingCount, 1, 'Only the first contact creates an impulse')
    assert.ok(s.frontGrounded && s.rearGrounded)
    return s
  }
  for (const timeout of [false, true]) {
    const a = drop(30, timeout), b = drop(120, timeout)
    assert.ok(Math.abs(a.height - b.height) < 1e-9 && Math.abs(a.pitch - b.pitch) < 1e-9)
  }
})

test('A/D turns the raised front fully at highway speed without a sharp yaw impulse on contact', () => {
  for (const steer of [-1, 1]) {
    const s = moving(); s.speed = 55
    run(s, { throttle: 1, wheelie: true, steer }, 2)
    assert.ok(frontSteer(s) * steer > 0.50, 'The airborne wheel has the full mechanical steering range')
    assert.ok(Math.abs(s.steer) < 0.01, 'Ground handling retains its speed-dependent steering limit')
    assert.ok(s.lean * steer < -0.04, 'Scott and the chassis add a small balancing lean')
    let maxYawRate = 0
    for (let i = 0; i < 180; i++) {
      advanceBike(s, { throttle: 1, steer }, 1 / 120, m, flat)
      maxYawRate = Math.max(maxYawRate, Math.abs(s.yawRate))
    }
    assert.equal(frontSteer(s), s.steer)
    assert.ok(maxYawRate < 0.2, 'A stylish wheel pose cannot become grounded steering at 200 km/h')
  }
})

test('F stops before dismounting, parks the bike, transfers movement/camera and remounts nearby', () => {
  const s = moving(); requestRiderToggle(s)
  run(s, { throttle: 1, boost: true }, 0.2)
  assert.equal(s.riderMode, 'stopping'); assert.ok(s.speed < 14); assert.equal(s.boostCount, 0)
  run(s, {}, 2)
  assert.equal(s.riderMode, 'onFoot'); assert.equal(s.dismountBlend, 1); assert.equal(s.speed, 0)
  const bike = { x: s.x, z: s.z }, p = { ...s.pedestrian }
  run(s, { throttle: 1, boost: true, wheelie: true, walkForward: 1, walkYaw: 0 }, 0.3)
  assert.ok(s.pedestrian.z > p.z + 0.45)
  assert.equal(s.x, bike.x); assert.equal(s.z, bike.z); assert.equal(s.wheelieAngle, 0)
  const camera = riderCameraState(s); assert.equal(camera.x, s.pedestrian.x); assert.equal(camera.z, s.pedestrian.z)
  assert.equal(requestRiderToggle(s), true); run(s, {}, 1.5)
  assert.equal(s.riderMode, 'mounted'); assert.equal(s.dismountBlend, 0); assert.equal(s.pedestrian, null)
  run(s, { throttle: 1 }, 0.5); assert.ok(s.speed > 1)
})

test('dismount chooses a clear side, rejects blocked exits and cannot mount from far away', () => {
  const s = state(); requestRiderToggle(s); run(s, {}, 1.5, 120, x => x < 0)
  assert.equal(s.riderMode, 'onFoot'); assert.ok(s.pedestrian.x < 0)
  const p = { ...s.pedestrian }; run(s, { walkForward: 1 }, 0.5, 120, () => false)
  assert.equal(s.pedestrian.x, p.x); assert.equal(s.pedestrian.z, p.z)
  s.pedestrian.x = 10; assert.equal(requestRiderToggle(s), false)
  const blocked = state(); requestRiderToggle(blocked); run(blocked, {}, 0.1, 120, () => false)
  assert.equal(blocked.riderMode, 'mounted'); assert.equal(blocked.pedestrian, null)
})
