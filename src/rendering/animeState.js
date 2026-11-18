const defaults = Object.freeze({ cel: true, levels: 3, shadow: 0.72, outlines: true, width: 1.2, color: '#111b2e', highlights: 0.55 })
let snapshot = { mode: 'ANIME', compare: false, split: 0.5, ready: false, error: '', ...defaults }
const listeners = new Set()
export const animeState = {
  defaults,
  snapshot: () => snapshot,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  set(next) {
    const value = { ...next }
    if (value.mode === 'PBR') value.compare = false
    if (value.levels !== undefined) value.levels = Math.max(2, Math.min(5, Math.round(value.levels)))
    if (value.width !== undefined) value.width = Math.max(0.5, Math.min(3, value.width))
    if (value.shadow !== undefined) value.shadow = Math.max(0, Math.min(1, value.shadow))
    if (value.highlights !== undefined) value.highlights = Math.max(0, Math.min(1.5, value.highlights))
    if (value.split !== undefined) value.split = Math.max(0, Math.min(1, value.split))
    snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener())
  },
  reset() { this.set(defaults) },
}
