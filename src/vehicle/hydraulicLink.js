import * as T from 'three'

const up = new T.Vector3(0, 1, 0)

export function closestSurfacePoint(mesh, worldPoint) {
  const target = mesh.worldToLocal(worldPoint.clone()), positions = mesh.geometry.attributes.position, index = mesh.geometry.index
  const triangle = new T.Triangle(), point = new T.Vector3(), closest = new T.Vector3()
  let distance = Infinity
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    for (const [k, vertex] of [triangle.a, triangle.b, triangle.c].entries()) vertex.fromBufferAttribute(positions, index ? index.getX(i + k) : i + k)
    triangle.closestPointToPoint(target, point)
    if (point.distanceToSquared(target) < distance) { distance = point.distanceToSquared(target); closest.copy(point) }
  }
  return closest
}

export function createHydraulicLink(body, targetFrame, base, target, options = {}) {
  const root = new T.Group(); root.name = 'Hydraulic_swivel_actuator'; root.position.copy(base); body.add(root)
  const casing = new T.MeshStandardMaterial({ color: '#b6cfcb', metalness: 0.45, roughness: 0.4 })
  const chrome = new T.MeshStandardMaterial({ color: '#c6d0d0', metalness: 0.95, roughness: 0.2 })
  const dark = new T.MeshStandardMaterial({ color: '#293a3a', metalness: 0.6, roughness: 0.55 })
  const casingRadius = options.casingRadius ?? 0.031
  const sleeve = new T.Mesh(new T.CylinderGeometry(casingRadius, casingRadius, 1, 16), casing)
  const rod = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1, 14), chrome)
  const seal = new T.Mesh(new T.TorusGeometry(0.025, 0.007, 8, 16), dark); seal.rotation.x = Math.PI / 2
  const baseJoint = new T.Mesh(new T.SphereGeometry(casingRadius, 16, 12), dark)
  const endJoint = new T.Mesh(new T.SphereGeometry(0.033, 14, 10), casing)
  const mountFrame = options.endMountFrame ?? targetFrame
  const outerMount = options.endMount?.clone() ?? target.clone().add(new T.Vector3(-Math.sign(target.x) * 0.02, 0, 0))
  const endPin = new T.Mesh(new T.CylinderGeometry(0.024, 0.024, 1, 12), casing)
  endPin.name = 'Hydraulic_end_connector'; endPin.castShadow = true; endPin.receiveShadow = true
  body.add(endPin)
  root.add(sleeve, rod, seal, baseJoint, endJoint)
  root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } })
  body.updateWorldMatrix(true, true)
  const initial = body.worldToLocal(targetFrame.localToWorld(target.clone())).distanceTo(base)
  const sleeveLength = initial * 0.58
  const state = { length: initial, stroke: 0, baseError: 0, targetError: 0, connectorLength: 0, connectorStartError: 0, connectorEndError: 0 }
  function poseBody(start,end,mount,options) {
    // Armor/V3 temporarily override these matrices. Reclaim the procedural
    // TRS frames whenever the mechanics solve the hydraulic endpoints again.
    root.matrixAutoUpdate = true; endPin.matrixAutoUpdate = true
    root.position.copy(start)
    const delta = end.clone().sub(start), length = delta.length()
    root.quaternion.setFromUnitVectors(up, delta.normalize())
    const casingLength=options?Math.min(sleeveLength*options.casingScale,Math.max(.02,length-.02)):sleeveLength
    const overlap=options?Math.min(.055,casingLength*.45):.055
    sleeve.scale.y = casingLength; sleeve.position.y = casingLength / 2
    const visibleRod = Math.max(0.02, length - casingLength + overlap)
    rod.scale.y = visibleRod; rod.position.y = casingLength - overlap + visibleRod / 2
    seal.position.y = casingLength; endJoint.position.y = length
    const connection = mount.clone().sub(end)
    endPin.position.copy(end).add(mount).multiplyScalar(0.5)
    endPin.scale.y = connection.length()
    endPin.quaternion.setFromUnitVectors(up, connection.normalize())
    state.connectorLength = endPin.scale.y
    Object.assign(state, { length, stroke: length - initial })
    body.updateWorldMatrix(true, true)
    state.baseError = root.getWorldPosition(new T.Vector3()).distanceTo(body.localToWorld(start.clone()))
    state.targetError = endJoint.getWorldPosition(new T.Vector3()).distanceTo(body.localToWorld(end.clone()))
    state.connectorStartError = endPin.localToWorld(new T.Vector3(0, -0.5, 0)).distanceTo(endJoint.getWorldPosition(new T.Vector3()))
    state.connectorEndError = endPin.localToWorld(new T.Vector3(0, 0.5, 0)).distanceTo(body.localToWorld(mount.clone()))
  }
  function update() {
    poseBody(base,body.worldToLocal(targetFrame.localToWorld(target.clone())),body.worldToLocal(mountFrame.localToWorld(outerMount.clone())))
  }
  // Presentation-only endpoint override, using the same approved meshes.
  // The normal mechanical update restores the original seats every frame.
  function poseWorld(start,end,mount,options){
    poseBody(body.worldToLocal(start.clone()),body.worldToLocal(end.clone()),body.worldToLocal(mount.clone()),options)
  }
  update()
  return { root, base, target, targetFrame, state, update, poseWorld, sleeve, rod, casingRadius, baseJoint, endJoint, endPin, mountFrame, outerMount }
}
