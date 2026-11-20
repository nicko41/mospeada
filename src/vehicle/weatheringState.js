const defaults = Object.freeze({ enabled: true, accumulation: true, buildup: 1, maximum: .78, cleaning: 1, scottEnabled: true, scottBuildup: 1 })
const limits = { buildup: [0, 4], maximum: [0, 1], cleaning: [0, 4], scottBuildup: [0, 4] }
let snapshot = { ...defaults, cleanRequest: 0, soilRequest: 0, bothCleanRequest: 0, bothSoilRequest: 0, front: null, rear: null, frontGrounded: false, rearGrounded: false, dirt: 0, scottDirt: 0 }
const listeners = new Set()
export const weatheringState = {
  defaults, snapshot: () => snapshot,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  set(values) {
    const next = { ...values }
    for (const [key, [lo, hi]] of Object.entries(limits)) if (key in next) next[key] = Math.max(lo, Math.min(hi, Number(next[key]) || 0))
    snapshot = { ...snapshot, ...next }; listeners.forEach(fn => fn())
  },
  clean() { this.set({ cleanRequest: snapshot.cleanRequest + 1 }) },
  soil() { this.set({ soilRequest: snapshot.soilRequest + 1 }) },
  cleanBoth() { this.set({ bothCleanRequest: snapshot.bothCleanRequest + 1, cleanRequest: snapshot.cleanRequest + 1 }) },
  soilBoth() { this.set({ bothSoilRequest: snapshot.bothSoilRequest + 1, soilRequest: snapshot.soilRequest + 1 }) },
  reset() { this.set(defaults) },
}
