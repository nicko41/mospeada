const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

export function ejectaResponse(wheel, state, side, config, rain, distance, frameSeconds) {
  const speed = Math.abs(state.speed || 0), rolling = Math.abs(state[side + 'AngularSpeed'] || 0) * wheel.radius
  const slide = Math.min(2, Math.abs(state.slip || 0) + Math.abs(state.rearLateralVelocity || 0) / 12)
  const force = Math.min(1.5, Math.abs(state.acceleration || 0) / 16 + (state.brakeBlend || 0) * .5 + (state.handbrake || 0) * .8 + (state.boostBlend || 0) * .8)
  const moving = clamp((speed - .2) / 1.8, 0, 1), humidity = config.humidity
  const lod = distance > 75 ? 0 : distance > 40 ? .2 : distance > 22 ? .5 : 1
  const performance = frameSeconds > .085 ? .55 : frameSeconds > .045 ? .75 : 1
  const base = wheel.grounded ? moving * (10 + Math.min(45, Math.max(rolling, speed * .5)) * 3.8) * (1 + slide * .7 + force * .55) * lod * performance : 0
  return {
    water: config.waterEnabled && wheel.surface === 'asphalt' ? base * config.water * clamp(rain, 0, 1) : 0,
    earth: config.earthEnabled && wheel.surface === 'dirt' ? base * (1 - humidity) * .5 * config.earth : 0,
    mud: config.mudEnabled && wheel.surface === 'dirt' ? base * humidity ** 1.35 * .72 * config.mud * (config.forestWheelFX?config.mudEmission:1) : 0,
    grass: config.forestWheelFX&&config.grassEnabled&&wheel.surface==='dirt'?base*.35*config.grassWeight*config.grassEmission:0,
    launch: 1.3 + Math.min(45, Math.max(rolling, speed * .5)) * .15 + force * 1.2,
    slide, force, quota: Math.floor(Math.min(576, config.maximum * .6) * lod * performance / (config.forestWheelFX?8:6)),
  }
}
