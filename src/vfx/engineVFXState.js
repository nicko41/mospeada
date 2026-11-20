const defaults = Object.freeze({ exhaustEnabled: true, exhaustIntensity: 1, exhaustSize: 1, exhaustTurbulence: .6, exhaustOpacity: .55, boostEnabled: true, boostIntensity: 1, boostSpeed: 34, boostLength: 1, boostExpansion: 1, boostTurbulence: 1, boostOpacity: .7, boostX: 0, boostY: 0, boostZ: 0, boostYaw: 0, boostPitch: 0 })
const limits = { exhaustIntensity: [0, 3], exhaustSize: [.4, 2], exhaustTurbulence: [0, 2], exhaustOpacity: [0, 1], boostIntensity: [0, 3], boostSpeed: [12, 65], boostLength: [.4, 2], boostExpansion: [.4, 2.5], boostTurbulence: [0, 2.5], boostOpacity: [0, 1], boostX: [-.4, .4], boostY: [-.4, .6], boostZ: [-.6, .4], boostYaw: [-60, 60], boostPitch: [-60, 60] }
let value = { ...defaults, exhaustActive: 0, boostActive: 0, boosting: false }
const listeners = new Set()
export const engineVFXState = {
  defaults, snapshot: () => value,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  set(values) {
    const next = { ...values }
    for (const [key, [lo, hi]] of Object.entries(limits)) if (key in next) next[key] = Math.max(lo, Math.min(hi, Number(next[key]) || 0))
    value = { ...value, ...next }; listeners.forEach(fn => fn())
  },
  reset() { this.set(defaults) },
}
