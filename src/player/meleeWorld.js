import * as THREE from 'three'
import { emitEntityImpact } from '../world/entityImpactState.js'
import { queryColliders, overlapsFootprint } from './collisionWorld.js'
import { MELEE_RANGE, MELEE_RADIUS, MELEE_DAMAGE, ENTITY_STATE } from './meleeConfig.js'

const targets = new Set()
const blockers = []
const ray = new THREE.Ray()
const bottom = new THREE.Vector3()
const top = new THREE.Vector3()
const onRay = new THREE.Vector3()
const onBody = new THREE.Vector3()
const impact = new THREE.Vector3()
const selectedImpact = new THREE.Vector3()
const impactNormal = new THREE.Vector3()
const toward = new THREE.Vector3()
const impulse = new THREE.Vector3()

export function registerMeleeTarget(target) {
  targets.add(target)
  return () => targets.delete(target)
}
// Ranged weapons share the same live target registrations as melee.
export function combatTargets() { return targets.values() }

// Segment/primitive intersection; no visual mesh raycasting.
function blocksSegment(collider, origin, end) {
  let near = 0, far = 1
  for (const [axis, min, max] of [
    ['x', collider.minX, collider.maxX], ['y', collider.minY, collider.maxY], ['z', collider.minZ, collider.maxZ],
  ]) {
    const delta = end[axis] - origin[axis]
    if (Math.abs(delta) < 0.000001) {
      if (origin[axis] < min || origin[axis] > max) return false
    } else {
      const a = (min - origin[axis]) / delta, b = (max - origin[axis]) / delta
      near = Math.max(near, Math.min(a, b))
      far = Math.min(far, Math.max(a, b))
      if (near > far) return false
    }
  }
  if (collider.type === 'cylinder') {
    const dx = end.x - origin.x, dz = end.z - origin.z
    const ox = origin.x - collider.x, oz = origin.z - collider.z
    const a = dx * dx + dz * dz
    const b = ox * dx + oz * dz
    const c = ox * ox + oz * oz - collider.radius * collider.radius
    if (a < 0.000001) return c <= 0
    const discriminant = b * b - a * c
    if (discriminant < 0) return false
    near = Math.max(near, (-b - Math.sqrt(discriminant)) / a)
    far = Math.min(far, (-b + Math.sqrt(discriminant)) / a)
  }
  return near <= far && far > 0.001 && near < 0.999
}

export function occluded(origin, end) {
  queryColliders(Math.min(origin.x, end.x), Math.min(origin.z, end.z),
    Math.max(origin.x, end.x), Math.max(origin.z, end.z), blockers)
  return blockers.some((collider) => blocksSegment(collider, origin, end))
}

export function entityPositionFree(position, radius, height) {
  queryColliders(position.x - radius, position.z - radius, position.x + radius, position.z + radius, blockers)
  return !blockers.some((collider) => position.y < collider.maxY - 0.025
    && position.y + height > collider.minY + 0.025 && overlapsFootprint(collider, position.x, position.z, radius))
}

export function strikeMelee(origin, forward, swingDirection) {
  ray.set(origin, forward)
  let selected = null, bestDistance = Infinity
  for (const target of targets) {
    if (target.state === ENTITY_STATE.DEAD || target.meleeEnabled === false) continue
    target.syncPosition()
    // Reject targets behind the player even when the camera is pitched down.
    const ahead = (target.position.x - origin.x) * forward.x + (target.position.z - origin.z) * forward.z
    if (ahead <= 0) continue
    bottom.copy(target.position); bottom.y += target.radius
    top.copy(target.position); top.y += target.height - target.radius
    const distanceSq = ray.distanceSqToSegment(bottom, top, onRay, onBody)
    const distance = Math.max(0, origin.distanceTo(onBody) - target.radius)
    if (distance > MELEE_RANGE || distance >= bestDistance
      || distanceSq > (MELEE_RADIUS + target.radius) ** 2) continue
    toward.subVectors(onBody, origin)
    if (toward.dot(forward) / Math.max(toward.length(), 0.001) < 0.65) continue
    // Check the line to the near surface of the logical capsule, not through the model.
    impact.copy(origin).addScaledVector(toward.normalize(), distance)
    if (occluded(origin, impact)) continue
    selected = target
    bestDistance = distance
    selectedImpact.copy(impact)
  }
  if (!selected) return false
  impulse.subVectors(selected.position, origin); impulse.y = 0
  if (impulse.lengthSq() < 0.0001) impulse.set(forward.x, 0, forward.z)
  impulse.normalize()
  const accepted = selected.receiveHit(MELEE_DAMAGE, impulse, swingDirection)
  if (accepted) {
    impactNormal.subVectors(origin, selectedImpact).normalize()
    // Lift the visual off the simplified capsule's surface to avoid clipping.
    selectedImpact.addScaledVector(impactNormal, 0.08)
    emitEntityImpact(selectedImpact, impactNormal, selected)
  }
  return accepted
}
