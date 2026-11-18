let value = { clip: 'Cyclone_RidingPose', clips: [], playing: true, speed: 1, progress: 0, seek: 0, seekRequest: 0, selectionRequest: 0, cleanShoulders: true, ready: false }
const listeners = new Set()
export const originalScottState = {
  snapshot: () => value,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  set(patch) { value = { ...value, ...patch }; listeners.forEach(listener => listener()) },
  select(clip) { this.set({ clip, playing: true, progress: 0, seek: 0, seekRequest: value.seekRequest + 1, selectionRequest: value.selectionRequest + 1 }) },
  scrub(progress) { this.set({ seek: progress, seekRequest: value.seekRequest + 1, playing: false, progress }) },
  step(direction) { const duration = value.clips.find(c => c.name === value.clip)?.duration || 1; this.scrub(Math.max(0, Math.min(1, value.progress + direction / (60 * duration)))) },
}
