let snapshot = { speed: 0, lean: 0, frontTravel: 0, rearTravel: 0, paused: false, location: 'Autopista' }
const listeners = new Set()
export const rideUI = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  snapshot: () => snapshot,
  publish(next) { snapshot = { ...snapshot, ...next }; listeners.forEach(listener => listener()) },
}
export const rideCommand = detail => window.dispatchEvent(new CustomEvent('ride-command', { detail }))
