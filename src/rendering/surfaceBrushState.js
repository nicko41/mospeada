const defaults = Object.freeze({ enabled: true, automatic: true, speed: 1, size: 1, intensity: 0.85, irregularity: 0.8, direction: 1, sensitivity: 1, stagger: 1, color: '#dbf6ff', slow: false })
export function createBrushState() {
  let value = { ...defaults, playRequest: 0, scrubRequest: 0, scrubValue: 0, playing: false, progress: 0 }, listeners = new Set()
  const set = next => { value = { ...value, ...next }; for (const listener of listeners) listener() }
  return {
    defaults, snapshot: () => value, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) {
      const patch = { ...next }
      for (const [key, min, max] of [['speed', 0.25, 2], ['size', 0.4, 1.6], ['intensity', 0, 1.5], ['irregularity', 0, 1.5], ['sensitivity', 0, 2], ['stagger', 0, 1]]) if (patch[key] !== undefined) patch[key] = Math.max(min, Math.min(max, patch[key]))
      if (patch.direction !== undefined) patch.direction = patch.direction < 0 ? -1 : 1
      set(patch)
    },
    play() { set({ enabled: true, playRequest: value.playRequest + 1 }) },
    scrub(progress) { set({ enabled: true, scrubValue: Math.max(0, Math.min(1, progress)), scrubRequest: value.scrubRequest + 1 }) },
    publish: set,
    reset() { set(defaults) },
  }
}
export const surfaceBrushState = createBrushState()
export const BRUSH_SWEEP_SECONDS = 0.55
export const BRUSH_DELAY_SECONDS = 0.32
export const BRUSH_TOTAL_SECONDS = BRUSH_SWEEP_SECONDS + BRUSH_DELAY_SECONDS

