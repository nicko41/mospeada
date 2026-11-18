import { clamp } from './physicsMath.js'

// Extra stroke is available only while absorbing a landing. Both simulation
// and wheel contact articulation must use the same allowance.
export function compressionStroke(state, side, config) {
  const normal = side === 'front' ? config.forkCompression : config.rearCompression
  const landing = side === 'front' ? config.landingForkCompression : config.landingRearCompression
  return normal + (landing - normal) * clamp(state[side + 'LandingLoad'] || 0, 0, 1)
}
