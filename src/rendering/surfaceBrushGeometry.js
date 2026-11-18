import { Float32BufferAttribute, Triangle, Vector2, Vector3 } from 'three'

export const UPPER_COVER = 'tapa-up + tapa-up + tapa-up + tapa-up'
const keyOf = p => p.toArray().map(n => Math.round(n * 100000)).join(',')
const edgeKey = (a, b) => [a, b].sort().join('|')
const cross = (a, b) => a.x * b.y - a.y * b.x

export function isBrushTarget(object, material) {
  if (!object.isMesh || object.isSkinnedMesh || material.name !== 'Painted Metal') return false
  let owner = object
  while (owner && owner.name !== 'Cyclone_riding_vehicle') owner = owner.parent
  if (!owner) return false
  // Painted bodywork, including both covers, lower panels, tail and guards.
  // Several mechanical parts share the paint material in this GLB: keep their
  // seals, controls, lamps and fasteners out of the animated pigment.
  return !/^(Fork_|Left_|Right_|Display_|Headlight_|Círculo|Conexión)/.test(object.userData.sourcePiece || '')
}

// Develop the real triangle surface into intrinsic coordinates. No global planar
// projection: every unfolded triangle retains its three original edge lengths.
// Cycles which cannot close isometrically become explicit chart seams.
export function buildBrushGeometry(source, selectFace = () => true) {
  const geometry = source.index ? source.toNonIndexed() : source.clone()
  const positions = geometry.attributes.position, faces = [], edges = new Map()
  for (let i = 0; i < positions.count; i += 3) {
    const points = [0, 1, 2].map(k => new Vector3().fromBufferAttribute(positions, i + k))
    const triangle = new Triangle(...points), normal = triangle.getNormal(new Vector3()), keys = points.map(keyOf)
    const face = { id: i / 3, points, keys, normal, eligible: new Set(keys).size === 3 && triangle.getArea() > 1e-12 && selectFace(normal), uv: null }
    faces.push(face)
    if (!face.eligible) continue
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(face.keys[(k + 1) % 3], face.keys[(k + 2) % 3])
      if (!edges.has(key)) edges.set(key, [])
      edges.get(key).push({ face, opposite: k })
    }
  }
  let charts = 0
  const selected = faces.filter(f => f.eligible)
  for (const seed of [...selected].sort((a, b) => b.points.reduce((s, p) => s + p.z, 0) - a.points.reduce((s, p) => s + p.z, 0))) {
    if (seed.uv) continue
    charts++
    const along = new Vector3(0, 0, 1).addScaledVector(seed.normal, -seed.normal.z)
    if (along.lengthSq() < 1e-8) along.set(0, 1, 0).addScaledVector(seed.normal, -seed.normal.y)
    along.normalize()
    const across = new Vector3().crossVectors(seed.normal, along).normalize(), origin = seed.points[0]
    seed.uv = seed.points.map(p => { const d = p.clone().sub(origin); return new Vector2(d.dot(along), d.dot(across)) })
    const queue = [seed]
    for (let head = 0; head < queue.length; head++) {
      const face = queue[head]
      for (let opposite = 0; opposite < 3; opposite++) {
        const a = (opposite + 1) % 3, b = (opposite + 2) % 3
        const neighbors = edges.get(edgeKey(face.keys[a], face.keys[b]))
        for (const { face: next } of neighbors) {
          if (next.uv) continue
          const na = next.keys.indexOf(face.keys[a]), nb = next.keys.indexOf(face.keys[b]), nc = 3 - na - nb
          const A = face.uv[a], B = face.uv[b], edge = B.clone().sub(A), length = edge.length()
          const ac = next.points[na].distanceTo(next.points[nc]), bc = next.points[nb].distanceTo(next.points[nc])
          const x = (ac * ac - bc * bc + length * length) / (2 * length)
          const y = Math.sqrt(Math.max(0, ac * ac - x * x))
          const sign = Math.sign(cross(edge, face.uv[opposite].clone().sub(A))) || 1
          const unit = edge.divideScalar(length), perpendicular = new Vector2(-unit.y, unit.x)
          next.uv = []
          next.uv[na] = A.clone(); next.uv[nb] = B.clone()
          next.uv[nc] = A.clone().addScaledVector(unit, x).addScaledVector(perpendicular, -sign * y)
          queue.push(next)
        }
      }
    }
  }
  if (!selected.length) { geometry.dispose(); throw Error('La tapa no tiene caras exteriores de pintura elegibles.') }
  const min = new Vector2(Infinity, Infinity), max = new Vector2(-Infinity, -Infinity)
  for (const face of selected) for (const uv of face.uv) { min.min(uv); max.max(uv) }
  const span = max.clone().sub(min).max(new Vector2(1e-5, 1e-5)), atlas = new Float32Array(positions.count * 2), distances = new Float32Array(positions.count * 3), data = new Float32Array(positions.count * 4)
  let cutEdges = 0, boundaryEdges = 0
  for (const face of selected) {
    const borders = [0, 0, 0], altitude = []
    for (let k = 0; k < 3; k++) {
      const a = (k + 1) % 3, b = (k + 2) % 3, neighbors = edges.get(edgeKey(face.keys[a], face.keys[b]))
      const next = neighbors.find(n => n.face !== face)?.face
      const cut = next && [a, b].some(i => face.uv[i].distanceTo(next.uv[next.keys.indexOf(face.keys[i])]) > 0.0001)
      // Suppress a chart cut only on an actual hard fold. Smooth curved skins
      // must not acquire a dark seam on every non-developable triangle cycle.
      borders[k] = !next || cut && face.normal.dot(next.normal) < 0.65 ? 1 : 0
      if (!next) boundaryEdges++
      if (cut) cutEdges++
      altitude[k] = new Triangle(...face.points).getArea() * 2 / face.points[a].distanceTo(face.points[b])
    }
    for (let k = 0; k < 3; k++) {
      const index = face.id * 3 + k, uv = face.uv[k].clone().sub(min).divide(span)
      atlas.set([uv.x, uv.y], index * 2)
      distances[index * 3 + k] = altitude[k]
      data.set([1, ...borders], index * 4)
    }
  }
  geometry.setAttribute('aBrushAtlas', new Float32BufferAttribute(atlas, 2))
  geometry.setAttribute('aBrushEdgeDistance', new Float32BufferAttribute(distances, 3))
  geometry.setAttribute('aBrushData', new Float32BufferAttribute(data, 4))
  return { geometry, report: { triangles: faces.length, exteriorTriangles: selected.length, excludedTriangles: faces.length - selected.length, charts, cutEdges: cutEdges / 2, boundaryEdges, atlasSize: span.toArray() } }
}
