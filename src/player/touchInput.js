export const touchInput = { enabled: false, active: false, x: 0, y: 0, sprint: false,
  lookX: 0, lookY: 0, lookPendingX: 0, lookPendingY: 0 }

export const desktopInput = { ready: false, paused: false }

export const isGameInputActive = () => !document.hidden && document.hasFocus() &&
  (touchInput.enabled ? touchInput.active : desktopInput.ready && !desktopInput.paused)

export function resetTouchInput() {
  Object.assign(touchInput, { x: 0, y: 0, sprint: false, lookX: 0, lookY: 0 })
  resetTouchLook()
}

export function resetTouchLook() {
  Object.assign(touchInput, { lookX: 0, lookY: 0, lookPendingX: 0, lookPendingY: 0 })
}

export function joystickVector(dx, dy, radius) {
  const distance = Math.hypot(dx, dy)
  const scale = distance > radius ? radius / distance : 1
  const x = dx * scale / radius, y = -dy * scale / radius
  return { x, y, sprint: y >= 0.82 }
}

const listeners = new Map()
export function subscribeTouchAction(action, listener) {
  if (!listeners.has(action)) listeners.set(action, new Set())
  listeners.get(action).add(listener)
  return () => listeners.get(action).delete(listener)
}
export function triggerTouchAction(action) {
  if (isGameInputActive()) listeners.get(action)?.forEach(listener => listener())
}
