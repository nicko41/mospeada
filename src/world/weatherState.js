const listeners = new Set()
let selection = 'storm'

// Shared by atmosphere, audio, rain, weathering and wheel spray.
export const weatherState = {
  rainIntensity: 1,
  clear: 0,
  get fogDensity() { return this.clear ? 0 : .068 },
  snapshot: () => selection,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  setPreset(preset) {
    if (preset !== 'sunny' && preset !== 'storm') return
    selection = preset
    this.clear = preset === 'sunny' ? 1 : 0
    this.rainIntensity = preset === 'sunny' ? 0 : 1
    listeners.forEach(fn => fn())
  },
}
