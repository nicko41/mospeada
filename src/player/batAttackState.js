export const batAttack = { ready: false, active: false, phase: 'IDLE', elapsed: 0,
  checked: false, hit: false, freeze: 0, impactAge: Infinity, nextAllowed: 0,
  direction: 1, readySide: 1, queued: false }
export const batEquipment = { equipped: false, canAttack: false }

const impactListeners = new Set()
const swingListeners = new Set()
export const subscribeBatSwing = listener => {
  swingListeners.add(listener)
  return () => swingListeners.delete(listener)
}
export const notifyBatSwing = () => swingListeners.forEach(listener => listener())
// Impact feedback fires only on a confirmed hit.
export const subscribeBatImpact = (listener) => {
  impactListeners.add(listener)
  return () => impactListeners.delete(listener)
}
export const notifyBatImpact = () => impactListeners.forEach(listener => listener())
export function cancelBatAttack(completed = false) {
  if (completed === true) batAttack.readySide = -batAttack.direction
  batAttack.active = false
  batAttack.phase = 'IDLE'
  batAttack.elapsed = 0
  batAttack.freeze = 0
  batAttack.impactAge = Infinity
  batAttack.queued = false
  batAttack.direction = batAttack.readySide
}
