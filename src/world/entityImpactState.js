const listeners = new Set()
export function subscribeEntityImpact(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
// Coordinates are borrowed temporaries: listeners copy them into their pool.
export function emitEntityImpact(position, direction, target) {
  for (const listener of listeners) listener(position, direction, target)
}
