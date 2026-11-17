import { getWalkableHeightAt } from './getWalkableHeight'
import { queryColliders, overlapsFootprint } from './collisionWorld'
import { PLAYER_RADIUS as R, PLAYER_HEIGHT as H, STEP_HEIGHT, GROUND_EPSILON as EPS } from './movementConfig'

const nearby = []
const occupancy = []
const floors = []
const stepProbe = { x: 0, y: 0, z: 0 }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function floorAt(x, z, maxHeight) {
  let floor = getWalkableHeightAt(x, z)
  queryColliders(x - R, z - R, x + R, z + R, floors)
  for (const collider of floors) {
    if (collider.walkable && collider.maxY <= maxHeight + EPS && collider.maxY > floor
      && overlapsFootprint(collider, x, z, R)) floor = collider.maxY
  }
  return floor
}

export function canOccupy(position) {
  queryColliders(position.x - R, position.z - R, position.x + R, position.z + R, occupancy, true)
  for (const collider of occupancy) {
    if (position.y < collider.maxY - EPS && position.y + H > collider.minY + EPS
      && overlapsFootprint(collider, position.x, position.z, R)) return false
  }
  return position.y >= getWalkableHeightAt(position.x, position.z) - EPS
}

// Horizontal disk + vertical interval: a cheap upright human collider.
// Small motion steps prevent tunnelling; normal-only corrections preserve tangential motion.
export function moveAndSlide(position, dx, dz, dy, grounded, result) {
  const oldY = position.y
  const targetX = position.x + dx
  const targetZ = position.z + dz
  if (grounded && dy <= 0) {
    const stepFloor = floorAt(targetX, targetZ, oldY + STEP_HEIGHT)
    if (stepFloor >= oldY && stepFloor - oldY <= STEP_HEIGHT) {
      stepProbe.x = targetX; stepProbe.y = stepFloor; stepProbe.z = targetZ
      if (canOccupy(stepProbe)) position.y = stepFloor
    }
  }
  position.x = targetX
  position.z = targetZ
  queryColliders(position.x - R - 0.2, position.z - R - 0.2,
    position.x + R + 0.2, position.z + R + 0.2, nearby, true)
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false
    for (const collider of nearby) {
      if (position.y >= collider.maxY - EPS || position.y + H <= collider.minY + EPS) continue
      let nx, nz, distance, penetration
      if (collider.type === 'cylinder') {
        nx = position.x - collider.x; nz = position.z - collider.z
        distance = Math.hypot(nx, nz)
        penetration = R + collider.radius - distance
      } else {
        nx = position.x - clamp(position.x, collider.minX, collider.maxX)
        nz = position.z - clamp(position.z, collider.minZ, collider.maxZ)
        distance = Math.hypot(nx, nz)
        penetration = R - distance
        if (distance < 0.000001) {
          const sides = [position.x - collider.minX, collider.maxX - position.x,
            position.z - collider.minZ, collider.maxZ - position.z]
          const nearest = sides.indexOf(Math.min(...sides))
          nx = nearest === 0 ? -1 : nearest === 1 ? 1 : 0
          nz = nearest === 2 ? -1 : nearest === 3 ? 1 : 0
          penetration = R + sides[nearest]
          distance = 1
        }
      }
      if (penetration <= 0) continue
      if (distance < 0.000001) { nx = 1; nz = 0; distance = 1 }
      position.x += nx / distance * (penetration + 0.0001)
      position.z += nz / distance * (penetration + 0.0001)
      moved = true
    }
    if (!moved) break
  }
  const beforeY = position.y
  position.y += dy
  result.ceiling = false
  result.grounded = false
  queryColliders(position.x - R, position.z - R, position.x + R, position.z + R, nearby, true)
  if (dy > 0) {
    for (const collider of nearby) {
      if (beforeY + H <= collider.minY + EPS && position.y + H >= collider.minY
        && overlapsFootprint(collider, position.x, position.z, R)) {
        position.y = Math.min(position.y, collider.minY - H)
        result.ceiling = true
      }
    }
  }
  const floor = floorAt(position.x, position.z, Math.max(oldY, beforeY) + EPS)
  // Terrain slopes and low stairs stay grounded, but walking off a ledge falls.
  const snap = grounded && dy <= 0 ? STEP_HEIGHT : EPS
  if (dy <= 0 && position.y <= floor + snap) {
    position.y = floor
    result.grounded = true
  }
  return result
}
