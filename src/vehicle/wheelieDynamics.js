import { clamp } from './physicsMath.js'

// Exhibition wheelie: a stable pose around the driven rear contact, with a
// six-second maximum per hold. Exhaustion only rearms after releasing Ctrl.
export function updateWheelie(s, input, dt, c) {
  s.wheelieLandingSpeed = 0
  s.wheelieLandingKick = (s.wheelieLandingKick || 0) * Math.exp(-dt * 9)
  const available = s.riderMode === 'mounted' && s.rearGrounded && !s.airborne && s.speed > c.wheelieMinSpeed && !input.reverse && !input.brakeReverse && !input.brake && !input.handbrake
  if (!input.wheelie) { s.wheelieTime = 0; s.wheelieExhausted = false }
  if ((available || s.wheelieTime > 0) && input.wheelie && !s.wheelieExhausted) {
    s.wheelieTime = Math.min(c.wheelieDuration, s.wheelieTime + dt)
    if (s.wheelieTime >= c.wheelieDuration - 1e-8) s.wheelieExhausted = true
  }
  const active = available && input.wheelie && !s.wheelieExhausted
  s.wheelieRemaining = active ? c.wheelieDuration - s.wheelieTime : 0
  if (active) s.wheelieVelocity += ((c.wheelieAngle - s.wheelieAngle) * 48 - s.wheelieVelocity * 14) * dt
  else if (s.wheelieAngle > 0) {
    // Release the supported pose. Fall under torque instead of easing toward
    // zero: retain angular speed right up to the front contact.
    s.wheelieVelocity = Math.min(0, s.wheelieVelocity)
    s.wheelieVelocity -= (c.wheelieDropAcceleration + s.wheelieVelocity * 0.45) * dt
  }
  s.wheelieAngle += s.wheelieVelocity * dt
  if (s.wheelieAngle < 0 || !active && s.wheelieAngle < 0.025) {
    // A single contact event, consumed by the existing axle suspension solver.
    // Never plant a wheel in mid-air just because its wheelie angle reached 0.
    if (s.wheelieVelocity < -0.5 && s.rearGrounded && s.frontTerrainGrounded !== false) {
      s.wheelieLandingSpeed = Math.min(c.wheelieMaxLandingSpeed, -s.wheelieVelocity * c.wheelieImpactLever)
      s.wheelieLandingKick = clamp(s.wheelieLandingSpeed / c.landingFullCompressionSpeed, 0, 1)
    }
    s.wheelieAngle = 0; s.wheelieVelocity = 0
  }
  s.wheelieAngle = clamp(s.wheelieAngle, 0, c.wheelieAngle)
}

export function wheelieSteerBlend(s) {
  const t = clamp((s.wheelieAngle || 0) / 0.20, 0, 1)
  return t * t * (3 - 2 * t)
}

export function frontSteer(s) {
  return s.steer + ((s.wheelieSteer || 0) - s.steer) * wheelieSteerBlend(s)
}
