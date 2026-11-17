import * as THREE from 'three'
import { queryColliders } from './collisionWorld'
import { canOccupy, floorAt } from './playerCollision'
import { PLAYER_RADIUS, VAULT_CHECK_DISTANCE, MIN_VAULT_HEIGHT, MAX_VAULT_HEIGHT,
  VAULT_LANDING_MARGIN, VAULT_MAX_GROUND_CHANGE, VAULT_CLEARANCE } from './movementConfig'

const nearby = []
const probe = new THREE.Vector3()
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b)

function rayHit(collider, origin, forward) {
  if (collider.type === 'cylinder') {
    const x = origin.x - collider.x, z = origin.z - collider.z
    const along = x * forward.x + z * forward.z
    const discriminant = along * along - (x * x + z * z - collider.radius ** 2)
    if (discriminant < 0) return null
    const entry = -along - Math.sqrt(discriminant)
    return entry >= 0 ? { entry, exit: -along + Math.sqrt(discriminant) } : null
  }
  let entry = -Infinity, exit = Infinity, normalX = 0, normalZ = 0
  for (const [axis, min, max] of [['x', collider.minX, collider.maxX], ['z', collider.minZ, collider.maxZ]]) {
    const direction = forward[axis]
    if (Math.abs(direction) < 0.00001) {
      if (origin[axis] < min || origin[axis] > max) return null
      continue
    }
    const a = (min - origin[axis]) / direction
    const b = (max - origin[axis]) / direction
    const near = Math.min(a, b)
    if (near > entry) {
      entry = near
      normalX = axis === 'x' ? -Math.sign(direction) : 0
      normalZ = axis === 'z' ? -Math.sign(direction) : 0
    }
    exit = Math.min(exit, Math.max(a, b))
    if (exit < entry) return null
  }
  return entry >= 0 && exit >= 0 ? { entry, exit, normalX, normalZ } : null
}

// Lift, traverse while supported above the rail, then lower: intentionally not ballistic.
export function vaultPosition(vault, progress, result) {
  result.lerpVectors(vault.start, vault.end, smooth(0.24, 0.76, progress))
  const lift = smooth(0, 0.28, progress) * (1 - smooth(0.72, 1, progress))
  result.y = THREE.MathUtils.lerp(result.y, vault.apex, lift)
  return result
}

export function findVault(origin, forward) {
  queryColliders(origin.x - VAULT_CHECK_DISTANCE, origin.z - VAULT_CHECK_DISTANCE,
    origin.x + VAULT_CHECK_DISTANCE, origin.z + VAULT_CHECK_DISTANCE, nearby, true)
  let selected = null, hit = null
  for (const collider of nearby) {
    if (collider.maxY < origin.y + MIN_VAULT_HEIGHT || collider.minY > origin.y + MAX_VAULT_HEIGHT) continue
    const candidate = rayHit(collider, origin, forward)
    if (candidate && candidate.entry <= VAULT_CHECK_DISTANCE && (!hit || candidate.entry < hit.entry)) {
      selected = collider
      hit = candidate
    }
  }
  if (!selected?.vaultable || selected.maxY - origin.y > MAX_VAULT_HEIGHT) return null
  const alignment = Math.abs(forward.x * hit.normalX + forward.z * hit.normalZ)
  if (alignment < 0.6) return null
  const distance = hit.exit + (PLAYER_RADIUS + VAULT_LANDING_MARGIN) / alignment
  if (distance > VAULT_CHECK_DISTANCE + 1) return null
  const end = origin.clone().addScaledVector(forward, distance)
  end.y = floorAt(end.x, end.z, origin.y + VAULT_MAX_GROUND_CHANGE)
  if (Math.abs(end.y - origin.y) > VAULT_MAX_GROUND_CHANGE || !canOccupy(end)) return null
  // The footprint must have usable ground, not just a single point on a ledge.
  for (const [x, z] of [[PLAYER_RADIUS, 0], [-PLAYER_RADIUS, 0], [0, PLAYER_RADIUS], [0, -PLAYER_RADIUS]]) {
    const ground = floorAt(end.x + x, end.z + z, end.y + VAULT_MAX_GROUND_CHANGE)
    if (Math.abs(ground - end.y) > VAULT_MAX_GROUND_CHANGE) return null
  }
  const vault = { start: origin.clone(), end,
    apex: Math.max(selected.maxY, origin.y, end.y) + VAULT_CLEARANCE, elapsed: 0 }
  // One bounded clearance check on SPACE, including headroom and neighbouring posts.
  for (let step = 0; step <= 32; step += 1) {
    vaultPosition(vault, step / 32, probe)
    if (!canOccupy(probe)) return null
  }
  return vault
}
