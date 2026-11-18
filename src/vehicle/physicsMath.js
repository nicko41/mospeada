export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const damp = (v, target, rate, dt) => target + (v - target) * Math.exp(-rate * dt)
export const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value))
export function spring(value, velocity, target, stiffness, damping, dt) {
  velocity += ((target - value) * stiffness - velocity * damping) * dt
  return [value + velocity * dt, velocity]
}
