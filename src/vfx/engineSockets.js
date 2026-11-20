import { Matrix3, Matrix4, Vector3 } from 'three'

// Measure the mouth plane, not the mesh origin or a guessed chassis position.
// The dark inset has one closed front face and an open rear rim. Its cap normal
// identifies the tube axis; the metallic sleeve gives the exterior lip depth.
export function measureEngineSockets(rig) {
  rig.body.updateWorldMatrix(true, true)
  const inverse = rig.body.matrixWorld.clone().invert(), rear = new Vector3(0, 0, -1), point = new Vector3()
  const outlets = rig.surfaces.filter(m => /Salida posterior oscura/.test(m.userData.sourcePiece || m.name))
  if (outlets.length !== 2) throw Error('Expected the two original Cyclone exhaust mouths')
  const exhausts = outlets.map(mesh => {
    const matrix = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld), normals = new Matrix3().getNormalMatrix(matrix)
    const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, index = mesh.geometry.index
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3(), axis = new Vector3(), temp = new Vector3()
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2
      a.fromBufferAttribute(p, ia).applyMatrix4(matrix); b.fromBufferAttribute(p, ib).applyMatrix4(matrix); c.fromBufferAttribute(p, ic).applyMatrix4(matrix)
      normal.fromBufferAttribute(n, ia).add(temp.fromBufferAttribute(n, ib)).add(temp.fromBufferAttribute(n, ic)).applyMatrix3(normals).normalize()
      if (Math.abs(normal.dot(rear)) < .85) continue
      if (normal.dot(rear) < 0) normal.negate()
      const area = b.sub(a).cross(c.sub(a)).length()
      axis.addScaledVector(normal, area)
    }
    if (axis.lengthSq() < 1e-10) throw Error('Cannot identify Cyclone exhaust axis')
    axis.normalize()
    let plane = -Infinity
    for (let i = 0; i < p.count; i++) plane = Math.max(plane, point.fromBufferAttribute(p, i).applyMatrix4(matrix).dot(axis))
    const ring = new Map()
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(matrix)
      if (plane - point.dot(axis) < .0005) ring.set(point.toArray().map(n => n.toFixed(5)).join(','), point.clone())
    }
    const center = new Vector3(); for (const p of ring.values()) center.add(p); center.multiplyScalar(1 / ring.size)
    const sleeves = rig.surfaces.filter(m => /Silenciador metálico/.test(m.userData.sourcePiece || m.name))
    let sleeve = null, nearest = Infinity
    for (const candidate of sleeves) {
      candidate.getWorldPosition(point); rig.body.worldToLocal(point)
      const cp = candidate.geometry.attributes.position, cm = new Matrix4().multiplyMatrices(inverse, candidate.matrixWorld), mean = new Vector3()
      for (let i = 0; i < cp.count; i++) mean.add(point.fromBufferAttribute(cp, i).applyMatrix4(cm))
      mean.multiplyScalar(1 / cp.count)
      if (mean.distanceToSquared(center) < nearest) { nearest = mean.distanceToSquared(center); sleeve = candidate }
    }
    if (sleeve) {
      const sp = sleeve.geometry.attributes.position, sm = new Matrix4().multiplyMatrices(inverse, sleeve.matrixWorld)
      for (let i = 0; i < sp.count; i++) plane = Math.max(plane, point.fromBufferAttribute(sp, i).applyMatrix4(sm).dot(axis))
    }
    center.addScaledVector(axis, plane - center.dot(axis) + .003)
    const world = rig.body.localToWorld(center.clone()), localPosition = mesh.worldToLocal(world)
    const localDirection = axis.clone().transformDirection(rig.body.matrixWorld).transformDirection(mesh.matrixWorld.clone().invert())
    return { mesh, bodyPosition: center, bodyDirection: axis, localPosition, localDirection }
  })
  const provisional = new Vector3().addVectors(exhausts[0].bodyPosition, exhausts[1].bodyPosition).multiplyScalar(.5)
  provisional.y = Math.max(...exhausts.map(s => s.bodyPosition.y)) + .18 * rig.presentationScale
  provisional.z = Math.min(...exhausts.map(s => s.bodyPosition.z)) - .025 * rig.presentationScale
  return { exhausts, provisional }
}
