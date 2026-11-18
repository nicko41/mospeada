import { clamp, damp } from './physicsMath.js'

// Small contact-load variations, not displaced ground: the rendered tires
// still touch the real terrain while the sprung chassis absorbs its texture.
export function updateRoadResponse(s, dt, m, c) {
  const speed = Math.abs(s.speed), moving = clamp((speed - 0.35) / 4, 0, 1)
  const frequency = 1.65 + Math.min(speed, 45) * 0.035
  s.roadPhase = (s.roadPhase || 0) + dt * frequency * Math.PI * 2 * moving
  for (const side of ['front', 'rear']) {
    const material = s[side + 'Contact']?.surface
    const amplitude = material === 'asphalt' ? c.asphaltSuspensionInput : material === 'dirt' ? c.dirtSuspensionInput : 0
    const grounded = s[side + 'Grounded'] !== false
    const phase = s.roadPhase - (side === 'rear' ? frequency * Math.PI * 2 * m.wheelbase / Math.max(speed, 1) : 0)
    const wave = 0.6 * Math.sin(phase) + 0.25 * Math.sin(phase * 2.31 + 0.8) + 0.15 * Math.max(0, Math.sin(phase * 3.83)) ** 8
    const key = side + 'RoadAmplitude'
    s[key] = damp(s[key] || 0, grounded ? amplitude * moving : 0, 10, dt)
    s[side + 'RoadOffset'] = grounded ? s[key] * wave : 0
  }
}
