import test from 'node:test'
import assert from 'node:assert/strict'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { bikeConfig as c } from './bikeConfig.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const flat = () => 0
const crest = (_x, z) => z < 5 ? 0 : z < 15 ? (z - 5) * 0.16 : z < 18 ? 1.6 : z < 28 ? 1.6 - (z - 18) * 0.16 : 0
function moving(speed = 20, sample = flat) {
  const s = createBikeState({ x: 0, z: 0, yaw: 0 }, m, sample)
  s.speed = speed; s.parked = false; s.idleBlend = 0
  s.frontAngularSpeed = speed / m.frontRadius; s.rearAngularSpeed = speed / m.rearRadius
  return s
}
function run(s, input, seconds, sample = flat, fps = 120) {
  for (let i = 0; i < Math.round(seconds * fps); i++) advanceBike(s, input, 1 / fps, m, sample)
}

test('100 km/h braking bites, bottoms the front stroke and keeps both tires planted', () => {
  const s = moving(100 / 3.6)
  let time = 0, maxPitch = 0, compression = 0
  while (s.speed > 0 && time < 3) {
    advanceBike(s, { brake: 1 }, 1 / 120, m, flat); time += 1 / 120
    maxPitch = Math.max(maxPitch, s.pitch); compression = Math.max(compression, -s.frontSpring)
    assert.ok(s.frontGrounded && s.rearGrounded)
  }
  assert.equal(s.speed, 0); assert.ok(time < 1.15 && s.distance < 16)
  assert.ok(maxPitch > 4 * Math.PI / 180)
  assert.ok(compression > c.forkCompression * 0.872 * 0.95)
  run(s, {}, 2)
  assert.ok(Math.abs(s.pitch) < 0.001 && Math.abs(s.verticalVelocity) < 0.001)
})

test('locked rear fishtails with straight steering and swings opposite either steering direction', () => {
  const straight = moving()
  let min = 0, max = 0
  for (let i = 0; i < 66; i++) {
    advanceBike(straight, { handbrake: true }, 1 / 120, m, flat)
    min = Math.min(min, straight.slip); max = Math.max(max, straight.slip)
  }
  assert.ok(min < -0.07 && max > 0.03, 'Rear movement must change side without steering')
  assert.ok(Math.abs(straight.rearAngularSpeed) < 0.001 && straight.frontAngularSpeed > 20)
  for (const direction of [-1, 1]) {
    const s = moving(); run(s, { handbrake: true, steer: direction }, 0.65)
    assert.ok(s.slip * direction > 0.6, 'The rear steps out before the faster stop')
    assert.ok(s.rearLateralVelocity * direction < -3, 'Tail slides outward')
    assert.ok(Math.abs(s.slip) <= c.maxDriftAngle)
    const slip = s.slip; run(s, {}, 1 / 120)
    assert.ok(Math.abs(s.slip - slip) < 0.08, 'Grip recovery cannot snap the chassis')
    run(s, {}, 2)
    assert.ok(Math.abs(s.slip) < 0.005)
  }
})

test('boost loads the rear and pitches back without launching from suspension rebound', () => {
  const s = moving(12)
  run(s, { boost: true, throttle: 1 }, 0.2)
  assert.ok(s.boostBlend > 0.65 && s.pitch < -3 * Math.PI / 180)
  assert.ok(s.rearSpring < -0.045 && s.frontSpring > 0.025)
  for (let i = 0; i < 600; i++) {
    advanceBike(s, i < 120 ? { throttle: 1 } : { brake: 1 }, 1 / 120, m, flat)
    assert.ok(s.frontGrounded && s.rearGrounded, 'Flat-ground load changes must not become jumps')
  }
})

test('high crest jumps retain heavy gravity and first landing loads its own axle', () => {
  for (const speed of [20, 40, 60]) {
    const s = moving(speed, crest)
    let start = null, landed = false, airTime = 0, peak = 0
    for (let i = 0; i < 600; i++) {
      advanceBike(s, {}, 1 / 120, m, crest)
      peak = Math.max(peak, s.frontAirGap, s.rearAirGap)
      if (s.airborne) { start ??= s.z; airTime += 1 / 120 }
      if (start !== null && s.frontGrounded && s.rearGrounded) {
        assert.ok(s.z - start < 90 && airTime > 1 && airTime < 1.6 && peak > 2.7 && peak < 5.7)
        assert.ok(s.frontLandingCount > 0 && s.rearLandingCount > 0)
        landed = true; break
      }
    }
    assert.ok(landed)
  }
  for (const first of ['front', 'rear']) {
    const other = first === 'front' ? 'rear' : 'front', s = moving(10)
    s.frontGrounded = s.rearGrounded = false
    s[first + 'Spring'] = 0.075; s[other + 'Spring'] = 0.35
    s.frontVelocity = s.rearVelocity = -3
    for (let i = 0; i < 10 && !s[first + 'LandingCount']; i++) advanceBike(s, {}, 1 / 120, m, flat)
    assert.equal(s[first + 'LandingCount'], 1)
    assert.equal(s[other + 'LandingCount'], 0)
    assert.ok(s[first + 'Impact'] > 0.95 && s[other + 'Impact'] === 0)
    assert.ok(s[first + 'LandingLoad'] > 0.95 && s[other + 'LandingLoad'] === 0)
    const stroke = first === 'front' ? c.forkCompression * 0.872 : c.rearCompression
    let compression = s[first + 'Spring']
    for (let i = 0; i < 8; i++) {
      advanceBike(s, {}, 1 / 120, m, flat)
      compression = Math.min(compression, s[first + 'Spring'])
    }
    assert.ok(compression <= -stroke * 0.95, 'Impact compresses over time instead of teleporting the chassis')
    run(s, {}, 2)
    assert.ok(s.frontGrounded && s.rearGrounded && Math.abs(s.verticalVelocity) < 0.01)
  }
})

test('a hard landing plants both tires while the chassis squats, rebounds and settles at 30/120 FPS', () => {
  const states = [flat, (_x, z) => -0.001 * z].flatMap(sample => [30, 120].map(fps => {
    const s = moving(15, sample)
    s.frontSpring += 3; s.rearSpring += 3; s.height += 3
    s.frontGrounded = s.rearGrounded = false
    let contactTime = null, minimum = 0, rebound = 0, secondCompression = 0
    for (let i = 0; i < fps * 3; i++) {
      advanceBike(s, {}, 1 / fps, m, sample)
      if (s.frontGrounded && s.rearGrounded) contactTime ??= i / fps
      if (contactTime === null) continue
      assert.ok(s.frontGrounded && s.rearGrounded && !s.airborne, 'Only the sprung chassis rebounds')
      const offset = (s.frontSpring - s.frontTarget + s.rearSpring - s.rearTarget) / 2
      minimum = Math.min(minimum, offset)
      if (i / fps - contactTime > 0.15) rebound = Math.max(rebound, offset)
      if (i / fps - contactTime > 0.35) secondCompression = Math.min(secondCompression, offset)
    }
    assert.ok(minimum < -0.17 && rebound > 0.035 && secondCompression < -0.01)
    assert.equal(s.frontLandingCount, 1); assert.equal(s.rearLandingCount, 1)
    assert.ok(Math.abs(s.height - (s.frontTarget + s.rearTarget) / 2) < 0.002)
    assert.ok(Math.abs(s.verticalVelocity - (s.frontSurfaceVelocity + s.rearSurfaceVelocity) / 2) < 0.01)
    return s
  }))
  for (const i of [0, 2]) for (const key of ['height', 'verticalVelocity', 'pitch', 'frontSpring', 'rearSpring']) assert.ok(Math.abs(states[i][key] - states[i + 1][key]) < 1e-9, key)
})

test('holding the handbrake after releasing throttle stops the bike and all tail rotation', () => {
  for (const steer of [0, -1, 1]) {
    const s = moving(20)
    let stopTime = null
    for (let tick = 0; tick < 300; tick++) {
      const before = s.speed
      advanceBike(s, { handbrake: true, steer }, 1 / 120, m, flat)
      assert.ok(s.speed <= before, 'A locked rear must keep braking without throttle')
      if (s.speed === 0) { stopTime = (tick + 1) / 120; break }
    }
    assert.ok(stopTime !== null && stopTime < 1.05)
    const { x, z, yaw, frontSpin, rearSpin } = s
    run(s, { handbrake: true, steer }, 2)
    assert.deepEqual([s.x, s.z, s.yaw, s.frontSpin, s.rearSpin], [x, z, yaw, frontSpin, rearSpin])
    assert.equal(s.slip, 0); assert.equal(s.yawRate, 0); assert.equal(Math.abs(s.rearLateralVelocity), 0)
  }
  const fading = moving(60)
  run(fading, { handbrake: true }, 1.5)
  assert.ok(fading.speed > 20 && Math.abs(fading.yawRate) < 0.01, 'Entry sway expires even while still moving')
  const fast = moving(60)
  run(fast, { handbrake: true, steer: 1 }, 3)
  assert.equal(fast.speed, 0)
  assert.ok(Math.abs(fast.yaw) < Math.PI / 2, 'Holding the brake cannot keep spinning through circles')
})

test('coleada, boost, brake and impact stay deterministic at 30 and 120 FPS', () => {
  const states = [30, 120].map(fps => {
    const s = moving(25)
    for (const [input, seconds] of [[{ handbrake: true, steer: 1 }, 0.6], [{ handbrake: true, steer: -1 }, 0.4], [{ boost: true, throttle: 1 }, 0.2], [{ brake: 1 }, 0.8]]) run(s, input, seconds, flat, fps)
    return s
  })
  for (const key of ['x', 'z', 'speed', 'yaw', 'slip', 'pitch', 'frontSpring', 'rearSpring']) assert.ok(Math.abs(states[0][key] - states[1][key]) < 1e-9, key)
})
