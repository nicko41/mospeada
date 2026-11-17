import { MOBILE_LOOK_DEADZONE_PX, MOBILE_LOOK_IMMEDIATE_WEIGHT,
  MOBILE_LOOK_SMOOTHING_SECONDS } from './mobileLookConfig.js'

// A moving deadzone absorbs jitter without subtracting pixels from every move.
export function createLookGesture() {
  let pointer = null
  return {
    start(id, x, y, width, height) {
      if (pointer) return false
      pointer = { id, x, y, width: Math.max(1, width), height: Math.max(1, height) }
      return true
    },
    move(id, x, y) {
      if (pointer?.id !== id) return null
      const dx = x - pointer.x, dy = y - pointer.y
      const distance = Math.hypot(dx, dy)
      if (distance <= MOBILE_LOOK_DEADZONE_PX) return null
      const scale = (distance - MOBILE_LOOK_DEADZONE_PX) / distance
      pointer.x += dx * scale; pointer.y += dy * scale
      return { x: dx * scale / pointer.width, y: dy * scale / pointer.height }
    },
    end(id) {
      if (pointer?.id !== id) return false
      pointer = null
      return true
    },
    get pointerId() { return pointer?.id ?? null },
    clear() { pointer = null },
  }
}

export function smoothLookDelta(input, axis, delta) {
  const pending = axis === 'lookX' ? 'lookPendingX' : 'lookPendingY'
  const tail = input[pending] * (1 - Math.exp(-Math.max(0, delta) / MOBILE_LOOK_SMOOTHING_SECONDS))
  const immediate = input[axis] * MOBILE_LOOK_IMMEDIATE_WEIGHT
  input[pending] = input[pending] - tail + input[axis] - immediate
  input[axis] = 0
  return immediate + tail
}
