import * as T from 'three'

// Keep each guard's authored wheel contact fixed when its housing opens.
export function createGuardHinge(frontAxle, surfaces, side) {
  const meshes = surfaces.filter(mesh => /^Arm_Guard_/.test(mesh.userData.sourcePiece)
    && new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).x * side > 0)
  const base = meshes.find(mesh => mesh.userData.sourcePiece === 'Arm_Guard_Base')
  const positions = base.geometry.attributes.position, index = base.geometry.index
  let distance = Infinity, pivot
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    const triangle = [0, 1, 2].map(j => frontAxle.worldToLocal(base.localToWorld(new T.Vector3().fromBufferAttribute(positions, index ? index.getX(i + j) : i + j))))
    const point = new T.Triangle(...triangle).closestPointToPoint(new T.Vector3(), new T.Vector3())
    if (point.lengthSq() < distance) { distance = point.lengthSq(); pivot = point }
  }
  const root = new T.Group(); root.name = side > 0 ? 'Left_guard_wheel_hinge' : 'Right_guard_wheel_hinge'
  root.position.copy(pivot); frontAxle.add(root); frontAxle.updateWorldMatrix(true, true)
  meshes.forEach(mesh => root.attach(mesh))
  return { root, meshes, pivot, side, angle: 0 }
}

// The source housing's slot floor is measured on its actual triangles. This
// avoids the previous external spacer placing the actuator outside the disk.
export function seatHydraulicInHousing(body, surfaces, side, offset, scale = 1) {
  const housing = surfaces.find(mesh => /alojamiento lateral/.test(mesh.userData.sourcePiece)
    && new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).x * side > 0)
  const y = -0.29403515625 * 1.3 * scale + offset.y, z = 0.0096826171875 * 1.3 * scale + offset.z
  const origin = body.localToWorld(new T.Vector3(side * 0.4 * scale, y, z))
  const direction = new T.Vector3(-side, 0, 0).transformDirection(body.matrixWorld)
  const hit = new T.Raycaster(origin, direction).intersectObject(housing, false)[0]
  if (!hit) throw Error('No se encontró el fondo de la ranura del hidráulico.')
  const floor = body.worldToLocal(hit.point.clone()).x
  const bounds = new T.Box3().setFromObject(housing)
  const outer = side > 0 ? bounds.max.x : bounds.min.x
  const base = new T.Vector3((floor + outer) / 2, y, z)
  return { base, floor, outer, housing, casingRadius: Math.abs(outer - floor) / 2 - 0.0015 }
}
