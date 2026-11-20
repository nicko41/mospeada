const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

// Visual inputs only. Terrain comes from the existing tagged triangle sampler.
export function dustResponse(wheel, state, config, distance, frameSeconds = 1 / 60) {
  const speed = Math.abs(state.speed || 0), rolling = Math.abs(state.rearAngularSpeed || 0) * wheel.radius
  const slide = clamp(Math.abs(state.slip || 0) * 1.3 + Math.abs(state.rearLateralVelocity || 0) / 10, 0, 2)
  const acceleration = clamp(Math.max(0, state.acceleration || 0) / 14, 0, 1.5)
  const skid = clamp((state.handbrake || 0) + (state.brakeBlend || 0) * slide, 0, 1)
  const lod = distance > 75 ? 0 : distance > 40 ? .2 : distance > 22 ? .5 : 1
  const performance = frameSeconds > .085 ? .45 : frameSeconds > .045 ? .7 : 1
  const budget = Math.floor(config.maximum * lod * performance)
  const moving = clamp((speed - .35) / 2, 0, 1)
  const dryness = (1 - config.humidity) ** 2.2
  const allowed = config.enabled && wheel.grounded && wheel.surface === 'dirt' && budget > 0
  const rate = allowed ? (20 + Math.min(45, Math.max(rolling, speed * .5)) * 5.7) * moving * (1 + acceleration * .7 + slide * .7 + skid * .55) * dryness * config.emission * lod * performance : 0
  return { rate, budget, slide, acceleration, speed, launch: .65 + Math.min(45, Math.max(rolling, speed * .5)) * .075 + acceleration * .65, persistence: 1 + Math.min(speed, 40) * .012 }
}
