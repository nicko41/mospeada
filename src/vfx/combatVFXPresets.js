// Runtime-editable visual presets. Combat cadence, health and damage live in
// their existing controllers. The death uses two supplied 4x3 RGBA sheets;
// the approved impact presets and their presentation remain unchanged.
export const COMBAT_VFX_LIMITS = Object.freeze({ bursts: 24, explosions: 8, lights: 2, sparksPerHit: 48, sparksPerExplosion: 96, fragmentsPerBurst: 10, smokePerBurst: 7 })
const impact = { size: .65, intensity: 1, duration: .24, expansion: 1, particles: 8, sparks: 1, fragments: 0, smoke: 0, lightIntensity: 4, lightDistance: 3, lightDuration: .075, core: '#fffce5', color: '#ffe44b', edge: '#ff8a28', residual: '#bd54ff', smokeColor: '#43434a', sprite: null }
export const COMBAT_VFX_PRESETS = {
  gallantImpact: { ...impact, size: .5, particles: 6 },
  invidHit: { ...impact, size: 1, duration: .26, particles: 11, lightIntensity: 6, lightDistance: 3.5 },
  invidExplosion: { ...impact, size: 3.3, duration: .64, airDuration: .56, ignition: .045, overlap: .13, bodyFade: .08, smokeTail: .68, expansion: 1.1, particles: 5, fragments: 5, smoke: 5, lightIntensity: 85, lightDistance: 15, lightDuration: .24, hideDelay: .21, bodyOffset: .48, groundGap: .55, core: '#fff2bf', color: '#ffc254', edge: '#ed5024', smokeColor: '#b29a93' },
  invidLaserImpact: { ...impact, size: .8, duration: .26, particles: 8, color: '#c05bff', edge: '#772ee4', core: '#f9e1ff', lightIntensity: 4.5 },
  invidGroundImpact: { ...impact, size: 1.85, duration: .42, particles: 0, fragments: 4, smoke: 2, lightIntensity: 0, lightDuration: 0, color: '#c8ad80', edge: '#7a6044', smokeColor: '#bda782' },
}
export const createCombatVFXPresets = () => Object.fromEntries(Object.entries(COMBAT_VFX_PRESETS).map(([key, value]) => [key, { ...value }]))
