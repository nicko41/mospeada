import * as THREE from 'three'

const CELL_SIZE = 8
const rayBox = new THREE.Box3(), rayPoint = new THREE.Vector3()

// Distance to existing solid primitives, including cylinder end caps. Used by
// hitscan weapons; the character and vehicle collision solvers are unchanged.
export function rayColliderDistance(ray, collider) {
  if (collider.type !== 'cylinder') {
    rayBox.min.set(collider.minX, collider.minY, collider.minZ)
    rayBox.max.set(collider.maxX, collider.maxY, collider.maxZ)
    if (rayBox.containsPoint(ray.origin)) return 0
    return ray.intersectBox(rayBox, rayPoint) ? ray.origin.distanceTo(rayPoint) : Infinity
  }
  const o = ray.origin, d = ray.direction, x = o.x - collider.x, z = o.z - collider.z
  const a = d.x*d.x + d.z*d.z, b = x*d.x + z*d.z, c = x*x + z*z - collider.radius**2
  let near = 0, far = Infinity
  if (a < 1e-12) { if (c > 0) return Infinity }
  else {
    const discriminant = b*b-a*c
    if (discriminant < 0) return Infinity
    const root = Math.sqrt(discriminant)
    near = Math.max(near, (-b-root)/a); far = Math.min(far, (-b+root)/a)
  }
  if (Math.abs(d.y) < 1e-12) { if (o.y < collider.minY || o.y > collider.maxY) return Infinity }
  else {
    const lo = (collider.minY-o.y)/d.y, hi = (collider.maxY-o.y)/d.y
    near = Math.max(near, Math.min(lo,hi)); far = Math.min(far, Math.max(lo,hi))
  }
  return near <= far ? near : Infinity
}
const cells = new Map()
const colliders = new Set()
const dynamicColliders = new Set()
const listeners = new Set()
let revision = 0
let queryId = 0
export const subscribeColliders = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
export const colliderRevision = () => revision
export const allColliders = () => Array.from(colliders)

export function boxCollider(bounds, options = {}) {
  return { type: 'box', minX: bounds.min.x, maxX: bounds.max.x,
    minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z,
    vaultable: false, walkable: true, ...options }
}

export function cylinderCollider(x, z, radius, minY, maxY) {
  return { type: 'cylinder', x, z, radius, minX: x - radius, maxX: x + radius,
    minZ: z - radius, maxZ: z + radius, minY, maxY, vaultable: false, walkable: false }
}

// Only transformed primitive bounds, never geometry/triangle intersection.
export function placedBox(center, size, position = [0, 0, 0], yaw = 0, options = {}) {
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...center), new THREE.Vector3(...size))
  const matrix = new THREE.Matrix4().makeRotationY(yaw)
  matrix.setPosition(...position)
  return boxCollider(box.applyMatrix4(matrix), options)
}

export function registerColliders(items) {
  const memberships = []
  for (const collider of items) {
    colliders.add(collider)
    for (let x = Math.floor(collider.minX / CELL_SIZE); x <= Math.floor(collider.maxX / CELL_SIZE); x += 1) {
      for (let z = Math.floor(collider.minZ / CELL_SIZE); z <= Math.floor(collider.maxZ / CELL_SIZE); z += 1) {
        const key = `${x},${z}`
        if (!cells.has(key)) cells.set(key, new Set())
        cells.get(key).add(collider)
        memberships.push([key, collider])
      }
    }
  }
  revision += 1
  listeners.forEach((listener) => listener())
  return () => {
    for (const [key, collider] of memberships) {
      const cell = cells.get(key)
      cell?.delete(collider)
      if (cell?.size === 0) cells.delete(key)
    }
    items.forEach((collider) => colliders.delete(collider))
    revision += 1
    listeners.forEach((listener) => listener())
  }
}

// A small moving population stays out of the static spatial hash. Each entry
// reuses its primitive and reads the current transform only when queried.
export function registerDynamicCollider(collider) {
  dynamicColliders.add(collider)
  return () => dynamicColliders.delete(collider)
}

export function queryColliders(minX, minZ, maxX, maxZ, result, includeDynamic = false) {
  result.length = 0
  const stamp = ++queryId
  for (let x = Math.floor(minX / CELL_SIZE); x <= Math.floor(maxX / CELL_SIZE); x += 1) {
    for (let z = Math.floor(minZ / CELL_SIZE); z <= Math.floor(maxZ / CELL_SIZE); z += 1) {
      const cell = cells.get(`${x},${z}`)
      if (!cell) continue
      for (const collider of cell) {
        if (collider.queryId === stamp) continue
        collider.queryId = stamp
        if (collider.maxX >= minX && collider.minX <= maxX && collider.maxZ >= minZ && collider.minZ <= maxZ) result.push(collider)
      }
    }
  }
  {
    for (const collider of dynamicColliders) {
      // Moving scenery also blocks queries that deliberately exclude other enemies.
      if (!includeDynamic && !collider.environment) continue
      if (!collider.sync()) continue
      if (collider.maxX >= minX && collider.minX <= maxX
        && collider.maxZ >= minZ && collider.minZ <= maxZ) result.push(collider)
    }
  }
  return result
}

export function overlapsFootprint(collider, x, z, radius) {
  if (collider.type === 'cylinder') return (x - collider.x) ** 2 + (z - collider.z) ** 2 < (radius + collider.radius) ** 2
  const dx = x - Math.max(collider.minX, Math.min(collider.maxX, x))
  const dz = z - Math.max(collider.minZ, Math.min(collider.maxZ, z))
  return dx * dx + dz * dz < radius * radius
}
