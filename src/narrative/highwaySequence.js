export const FIRST_SIGN_X = -36
export const SIGN_SPACING = 360
export const PHRASES = ['SEGUÍ.', 'YA FALTA POCO.', 'NO TE DETENGAS.', 'NO MIRES ATRÁS.']
const distances = [18, 22, 31, 427]
let seed = 427
while (distances.at(-1) < 700) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  distances.push(distances.at(-1) + 101 + seed % 180)
}
export const SIGNS = [...distances.map((distance) => ({ distance })), ...PHRASES.map((phrase) => ({ phrase }))]
export const signXAt = (index) => FIRST_SIGN_X - index * SIGN_SPACING
export const LAST_SIGN_X = signXAt(SIGNS.length - 1)
export const DONT_LOOK_BACK_READ_DISTANCE = 45
export const ENTITY_DISTANCE = 18
export const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x) }
// Darkness is already established when the third sign can be read. By the
// approach to the fourth, the distant town has disappeared completely.
export function highwayHazeAt(x) {
  return 0.78 * smooth((signXAt(2) + 80 - x) / 80)
    + 0.22 * smooth((signXAt(2) - x) / (SIGN_SPACING - 40))
}
export function createHighwaySequence() {
  return { phase: 'walk', passed: 0, active: false, dontLookBackActive: false,
    entityTriggered: false, entity: null, hazeProgress: 0, endProgress: 0, timer: 0,
    movementLocked: false, blackout: false, resetRequested: false, completed: false }
}
export const highwaySequence = createHighwaySequence()

// Forward on the Leones carriageway is -X. Horizontal +X means looking back.
export function stepHighwaySequence(state, { x, z, lookX, lookZ }, delta) {
  const dt = Math.min(delta, 0.1)
  state.resetRequested = false
  if (state.entity) state.entity.age += dt
  if (state.phase === 'blackout') {
    state.timer += dt
    if (state.timer >= 2) {
      state.phase = 'recover'; state.timer = 0; state.resetRequested = true
      state.endProgress = 0; state.hazeProgress = 0; state.entity = null; state.dontLookBackActive = false
    }
    return
  }
  if (state.phase === 'recover') {
    state.timer += dt
    // Rain returns under black first, then the view, then player control.
    state.blackout = state.timer < 0.2
    if (state.timer >= 0.85) {
      state.phase = 'complete'; state.completed = true; state.active = false
      state.movementLocked = false
    }
    return
  }
  if (state.completed) return
  const onHighway = Math.abs(z + 72) < 40
  if (!onHighway) return
  const passed = x < FIRST_SIGN_X ? 1 + Math.floor((FIRST_SIGN_X - x) / SIGN_SPACING) : 0
  state.passed = Math.max(state.passed, Math.min(SIGNS.length, passed))
  state.active = state.passed > 0
  state.hazeProgress = Math.max(state.hazeProgress, highwayHazeAt(x))
  // Arm on approach, before reading and turning; crossing the sign is not required.
  if (x <= LAST_SIGN_X + DONT_LOOK_BACK_READ_DISTANCE) state.dontLookBackActive = true
  const horizontal = Math.hypot(lookX, lookZ)
  if (state.dontLookBackActive && !state.entityTriggered && horizontal > 0.25 && lookX / horizontal > 0.65) {
    state.entityTriggered = true
    state.entity = { x: x + ENTITY_DISTANCE, z: Math.max(-81, Math.min(-75, z)), age: 0 }
  }
  state.endProgress = Math.max(state.endProgress, Math.max(0, Math.min(1, (LAST_SIGN_X - x) / 180)))
  if (state.endProgress >= 1 && (!state.entity || state.entity.age >= 3.2)) {
    state.phase = 'blackout'; state.timer = 0; state.blackout = true; state.movementLocked = true
  }
}

export function entityOpacity(age) {
  return age <= 2 ? 0.9 : 0.9 * (1 - smooth((age - 2) / 1.2))
}
