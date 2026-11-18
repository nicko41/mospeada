import { Vector3 } from 'three'

const surfaces = new Set(), geometryGrids = new WeakMap()
const point = new Vector3(), world = new Vector3()
const CELL = 4

function gridFor(geometry) {
  let grid = geometryGrids.get(geometry)
  if (grid) return grid
  grid = new Map()
  const p = geometry.attributes.position, index = geometry.index
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j)
    const t = ids.map(id => [p.getX(id), p.getY(id), p.getZ(id)])
    const minX = Math.floor(Math.min(...t.map(v => v[0])) / CELL), maxX = Math.floor(Math.max(...t.map(v => v[0])) / CELL)
    const minZ = Math.floor(Math.min(...t.map(v => v[2])) / CELL), maxZ = Math.floor(Math.max(...t.map(v => v[2])) / CELL)
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const key = `${x},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(t)
    }
  }
  geometryGrids.set(geometry, grid)
  return grid
}

export function registerRideSurfaces(scene) {
  const owned = []
  scene.traverse(mesh => {
    if (mesh.isMesh && mesh.userData.rideSurface) { surfaces.add(mesh); gridFor(mesh.geometry); owned.push(mesh) }
  })
  return () => owned.forEach(mesh => surfaces.delete(mesh))
}

// Barycentric height of the actual rendered triangles, including asphalt crowns,
// dirt road, embankment and recycled highway chunks. No invented terrain noise.
export function sampleRideHeight(x, z, contact) {
  let highest = -Infinity
  if (contact) contact.surface = null
  for (const mesh of surfaces) {
    mesh.updateWorldMatrix(true, false)
    point.set(x, 0, z); mesh.worldToLocal(point)
    const triangles = gridFor(mesh.geometry).get(`${Math.floor(point.x / CELL)},${Math.floor(point.z / CELL)}`)
    if (!triangles) continue
    for (const [a, b, c] of triangles) {
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
      if (Math.abs(denominator) < 1e-10) continue
      const u = ((b[2] - c[2]) * (point.x - c[0]) + (c[0] - b[0]) * (point.z - c[2])) / denominator
      const v = ((c[2] - a[2]) * (point.x - c[0]) + (a[0] - c[0]) * (point.z - c[2])) / denominator
      if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue
      world.set(point.x, u * a[1] + v * b[1] + (1 - u - v) * c[1], point.z)
      const height = mesh.localToWorld(world).y
      if (height > highest) {
        highest = height
        if (contact) contact.surface = mesh.userData.rideSurfaceType || 'dirt'
      }
    }
  }
  return highest
}
