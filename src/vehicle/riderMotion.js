import { clamp, damp } from './physicsMath.js'

export function updateRiderMotion(s, dt, config) {
  const takingOff = !s.frontWheelieLifted && (s.frontGrounded === false || s.rearGrounded === false) && s.verticalVelocity > 0
  const stand = s.airborne ? 1 : takingOff ? 0.7 : 0
  s.riderStand = damp(s.riderStand || 0, stand, stand ? 12 : 11, dt)
  const roll = s.lean + s.bank
  const reversing = !s.airborne && (s.reverseIntent || s.speed < -0.01)
  s.reverseBlend = damp(s.reverseBlend || 0, reversing ? 1 : 0, 12, dt)
  s.reversePhase = (s.reversePhase || 0) + Math.max(0, -s.speed) * dt / config.reverseStride * Math.PI * 2
  s.reverseFeet ||= { Left: null, Right: null }
  if (s.reverseBlend > 0.001) for (const side of ['Left', 'Right']) {
    const phase = s.reversePhase / (Math.PI * 2) + (side === 'Right' ? 0.5 : 0)
    const cycle = Math.floor(phase), part = phase - cycle
    if (part >= 0.65) { s.reverseFeet[side] = null; continue }
    if (s.reverseFeet[side]?.cycle !== cycle) {
      const x = side === 'Left' ? 0.43 : -0.43, z = -0.30 + config.reverseStride * part
      s.reverseFeet[side] = { cycle, x: s.x + Math.cos(s.yaw) * x + Math.sin(s.yaw) * z, z: s.z - Math.sin(s.yaw) * x + Math.cos(s.yaw) * z }
    }
  } else { s.reverseFeet.Left = s.reverseFeet.Right = null; s.reversePhase = 0 }
  const burnout=s.burnout?.blend||0
  const dab = !s.airborne && !takingOff ? Math.max(s.handbrake * clamp(Math.abs(s.speed) / 4, 0, 1),burnout) * clamp(Math.abs(roll) / 0.24, 0, 1) * (1 - s.riderStand) * (1 - s.reverseBlend) : 0
  // Negative roll tips the chassis toward +X, Scott's left side.
  s.riderDabLeft = damp(s.riderDabLeft || 0, roll < -0.035 ? dab : 0, 15, dt)
  s.riderDabRight = damp(s.riderDabRight || 0, roll > 0.035 ? dab : 0, 15, dt)
}

export function reverseFootTarget(s, side, config) {
  const anchor = s.reverseFeet?.[side]
  if (anchor) return { x: anchor.x, z: anchor.z, lift: 0 }
  const phase = (s.reversePhase || 0) / (Math.PI * 2) + (side === 'Right' ? 0.5 : 0)
  const part = phase - Math.floor(phase), swing = clamp((part - 0.65) / 0.35, 0, 1)
  const x = side === 'Left' ? 0.43 : -0.43, z = -0.30 + config.reverseStride * 0.65 * (1 - swing)
  return { x: s.x + Math.cos(s.yaw) * x + Math.sin(s.yaw) * z, z: s.z - Math.sin(s.yaw) * x + Math.cos(s.yaw) * z, lift: 0.07 * Math.sin(swing * Math.PI) }
}
