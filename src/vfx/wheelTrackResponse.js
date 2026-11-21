const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))

// Visual-only response, shared by the ribbon and particle emitters. Friction
// and suspension continue using the original terrain contact unchanged.
export function wheelTrackResponse(wheel, state, humidity = .3) {
  const surface = wheel.surface, desert = wheel.biome === 'desert' || surface === 'sand' || surface === 'desert'
  const allowed = ['dirt', 'mud', 'sand', 'desert', 'grass'].includes(surface)
  const grass = surface === 'grass' || wheel.biome === 'grass' ? 1 : wheel.biome === 'forest' ? 1 - clamp(wheel.earthWeight ?? 1) : 0
  const speed = Math.abs(state.speed || 0)
  const effort = clamp((state.brakeBlend || 0) * .65 + (state.handbrake || 0) * .8
    + Math.abs(state.slip || 0) * .65 + Math.abs(state.rearLateralVelocity || 0) / 10
    + (state.boostBlend || 0) * .8 + Math.max(0, state.acceleration || 0) / 40)
  const wet = desert ? 0 : surface === 'mud' ? 1 : clamp(humidity)
  return {
    allowed: allowed && wheel.grounded,
    kind: grass > .65 ? 'grass' : desert ? 'sand' : wet > .6 ? 'mud' : 'dirt',
    grass, effort,
    strength: clamp((.3 + clamp(speed / 22) * .2 + effort * .45 + wet * .12) * (1 + grass * .55)),
    width: (.18 + effort * .12) * (1 + grass * .4),
  }
}
