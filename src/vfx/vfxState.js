const defaults = Object.freeze({ enabled: true, emission: 1, size: 1, life: 1, gravity: .65, drag: 1.35, turbulence: .55, spread: 1, wind: .35, humidity: .7, maximum: 640, waterEnabled: true, earthEnabled: true, mudEnabled: true, water: 1, earth: 1, mud: 1 })
const limits = { emission: [0, 3], size: [.4, 2], life: [.4, 2], gravity: [0, 3], drag: [0, 4], turbulence: [0, 2], spread: [.2, 2.5], wind: [0, 4], humidity: [0, 1], maximum: [64, 960], water: [0, 3], earth: [0, 3], mud: [0, 3] }
let value = { ...defaults, active: 0, budget: 640, rate: 0, rearSurface: null, grounded: false }
const listeners = new Set()
export const vfxState = {
  defaults, snapshot: () => value,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  set(values) {
    const next = { ...values }
    for (const [key, [min, max]] of Object.entries(limits)) if (key in next) next[key] = Math.max(min, Math.min(max, Number(next[key]) || 0))
    if ('maximum' in next) next.maximum = Math.round(next.maximum)
    value = { ...value, ...next }; listeners.forEach(fn => fn())
  },
  reset() { this.set(defaults) },
}
