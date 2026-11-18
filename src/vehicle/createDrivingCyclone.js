import * as T from 'three'
import { createParkedCyclone } from './createParkedCyclone.js'
import { createFrontForks } from './frontForks.js'
import { createGuardHinge, seatHydraulicInHousing } from './guardMounts.js'
import { createHydraulicLink, closestSurfacePoint } from './hydraulicLink.js'
import { frontSteer } from './wheelieDynamics.js'
import { compressionStroke } from './suspensionLimits.js'

// Vehicle articulation only. Scott is a separate original skinned instance;
// none of the rejected rider IK, finger construction or weight edits run here.
export function createDrivingCyclone(source) {
  const rig = createParkedCyclone(source), { root, body, surfaces, metrics: m, presentationScale: scale } = rig
  const group = (name, parent, p = new T.Vector3()) => { const g = new T.Group(); g.name = name; g.position.copy(p); parent.add(g); return g }
  const imported = body.children[0], offset = imported.position.clone()
  const fc = new T.Vector3(0, m.frontY, m.frontZ), rc = new T.Vector3(0, m.rearY, m.rearZ)
  const neck = new T.Vector3(0, .105 * 1.3 * scale + offset.y, .27035575 * 1.3 * scale + offset.z)
  const steering = group('Steering_head', body, neck), frontLower = group('Fork_lower_sliders', steering)
  const frontAxle = group('Front_axle', frontLower, fc.clone().sub(neck)), frontSpin = group('Front_wheel_spin', frontAxle)
  const rearPivot = new T.Vector3(0, .36, -.05).multiplyScalar(scale), rearSwing = group('Rear_swingarm', body, rearPivot)
  const rearAxle = group('Rear_axle', rearSwing, rc.clone().sub(rearPivot)), rearSpin = group('Rear_wheel_spin', rearAxle)
  root.updateMatrixWorld(true)
  const profile = prefix => {
    const tire = surfaces.find(m => m.userData.sourcePiece === prefix + '_Tire_Rubber'), center = prefix === 'Front' ? fc : rc, unique = new Map()
    const p = tire.geometry.attributes.position
    for (let i = 0; i < p.count; i++) {
      const v = body.worldToLocal(tire.localToWorld(new T.Vector3().fromBufferAttribute(p, i))).sub(center)
      const r = Math.hypot(v.y, v.z); unique.set(`${v.x.toFixed(5)},${r.toFixed(5)}`, [v.x, r])
    }
    return [...unique.values()]
  }
  const frontProfile = profile('Front'), rearProfile = profile('Rear')
  for (const mesh of surfaces) {
    const name = mesh.userData.sourcePiece || mesh.name
    let parent = body
    if (/^Front_(Tire|Rim|Hub)/.test(name)) parent = frontSpin
    else if (/^Rear_(Tire|Rim|Hub)/.test(name)) parent = rearSpin
    else if (/^Fork_/.test(name)) parent = /Upper_Clamp|Upper_Chassis_Lug|Upper_Cross_Pin/.test(name) ? body : frontLower
    else if (/^Arm_Guard_/.test(name)) parent = frontLower
    if (/brazo tubular/.test(name)) mesh.visible = false
    parent.attach(mesh)
  }
  root.updateMatrixWorld(true)
  const frontForks = createFrontForks(body, frontLower, surfaces)
  const guards = [createGuardHinge(frontAxle, surfaces, 1), createGuardHinge(frontAxle, surfaces, -1)]
  const seats = [seatHydraulicInHousing(body, surfaces, 1, offset, scale), seatHydraulicInHousing(body, surfaces, -1, offset, scale)]
  const frontTarget = guards[0].root.worldToLocal(body.localToWorld(new T.Vector3(seats[0].base.x, seats[0].base.y, fc.z - .42 * scale)))
  const forkMountFrame = frontForks[0].lowerMeshes.find(m => m.userData.sourcePiece === 'Fork_Left_Lower_Reinforcement')
  const mount = closestSurfacePoint(forkMountFrame, guards[0].root.localToWorld(frontTarget.clone()))
  const hydraulics = [createHydraulicLink(body, guards[0].root, seats[0].base, frontTarget, { casingRadius: seats[0].casingRadius, endMountFrame: forkMountFrame, endMount: mount }), createHydraulicLink(body, rearAxle, seats[1].base, new T.Vector3(-.24, -.05, .02).multiplyScalar(scale), { casingRadius: seats[1].casingRadius })]
  const axis = new T.Vector3(0, .8718175736210823, -.489830703739005), v = new T.Vector3(), w = new T.Vector3()
  function support(axle, profile, sample, grounded) {
    const direction = new T.Vector3(1, 0, 0).transformDirection(axle.matrixWorld), p = axle.getWorldPosition(new T.Vector3()), h = .12
    const dx = (sample(p.x + h, p.z) - sample(p.x - h, p.z)) / (2 * h), dz = (sample(p.x, p.z + h) - sample(p.x, p.z - h)) / (2 * h)
    const normal = new T.Vector3(grounded && Number.isFinite(dx) ? -dx : 0, 1, grounded && Number.isFinite(dz) ? -dz : 0)
    const axial = direction.dot(normal), radial = Math.sqrt(Math.max(0, normal.lengthSq() - axial * axial))
    return Math.max(...profile.map(([x, radius]) => -axial * x + radial * radius))
  }
  const stand = new T.Mesh(new T.CylinderGeometry(.014, .018, 1, 8), new T.MeshStandardMaterial({ color: '#3a4545', metalness: .65, roughness: .45 }))
  stand.name = 'Deployed_kickstand'; root.add(stand)
  rig.update = (s, sample, c) => {
    const recoil = (s.boostKick || 0) * c.boostRecoilDistance
    root.position.set(s.x - Math.sin(s.yaw) * recoil, s.height, s.z - Math.cos(s.yaw) * recoil); root.rotation.y = s.yaw
    body.position.set(0, 0, 0); body.rotation.set(s.pitch, 0, s.lean + s.bank, 'YXZ')
    if (s.wheelieAngle > 0) { const rear = rc.clone().applyEuler(body.rotation); body.rotation.x -= s.wheelieAngle; body.position.copy(rear.sub(rc.clone().applyEuler(body.rotation))) }
    const steer = T.MathUtils.clamp(frontSteer(s), -c.mechanicalSteerLimit, c.mechanicalSteerLimit)
    rig.articulation.frontSteer = steer; steering.quaternion.setFromAxisAngle(axis, Math.atan(Math.tan(steer) / axis.y))
    const opening = T.MathUtils.clamp(steer / c.mechanicalSteerLimit, 0, 1)
    guards[0].root.rotation.y = -c.guardClearanceAngle * opening * opening * (3 - 2 * opening)
    frontLower.position.set(0, 0, 0); rearSwing.rotation.x = 0
    frontSpin.rotation.x = s.frontSpin; rearSpin.rotation.x = s.rearSpin; root.updateMatrixWorld(true)
    const fg = s.frontGrounded !== false, rg = s.rearGrounded !== false
    const fs = support(frontAxle, frontProfile, sample, fg), rs = support(rearAxle, rearProfile, sample, rg)
    root.position.y += ((fs - m.frontRadius) + (rs - m.rearRadius) + (m.frontY + m.rearY) * (1 - Math.cos(s.lean + s.bank))) / 2
    root.updateMatrixWorld(true)
    const axisWorld = axis.clone().transformDirection(steering.matrixWorld)
    let travel = fg ? 0 : -c.forkExtension
    frontLower.position.copy(axis).multiplyScalar(travel); root.updateMatrixWorld(true)
    for (let i = 0; fg && i < 3; i++) {
      frontAxle.getWorldPosition(v); travel += (sample(v.x, v.z) + fs - v.y) / Math.max(.5, axisWorld.y)
      travel = T.MathUtils.clamp(travel, -c.forkExtension, compressionStroke(s, 'front', c)); frontLower.position.copy(axis).multiplyScalar(travel); root.updateMatrixWorld(true)
    }
    rig.articulation.frontTravel = travel
    frontAxle.getWorldPosition(v); rig.articulation.frontContactError = v.y - fs - sample(v.x, v.z)
    const lever = Math.abs(rc.z - rearPivot.z)
    if (!rg) rearSwing.rotation.x = -c.rearExtension / lever
    for (let i = 0; rg && i < 3; i++) {
      root.updateMatrixWorld(true); rearAxle.getWorldPosition(w)
      rearSwing.rotation.x = T.MathUtils.clamp(rearSwing.rotation.x + (sample(w.x, w.z) + rs - w.y) / lever, -c.rearExtension / lever, compressionStroke(s, 'rear', c) / lever)
    }
    root.updateMatrixWorld(true); rearAxle.getWorldPosition(w)
    rig.articulation.rearTravel = rearSwing.rotation.x * lever; rig.articulation.rearContactError = w.y - rs - sample(w.x, w.z)
    frontForks.forEach(f => f.update()); hydraulics.forEach(h => h.update())
    stand.visible = s.dismountBlend > .4
    if (stand.visible) {
      const top = body.localToWorld(new T.Vector3(.18, .4, -.34).multiplyScalar(scale)), bottom = root.localToWorld(new T.Vector3(.43, 0, -.38).multiplyScalar(scale))
      bottom.y = sample(bottom.x, bottom.z) + .012; root.worldToLocal(top); root.worldToLocal(bottom)
      stand.position.copy(top).add(bottom).multiplyScalar(.5); stand.scale.y = top.distanceTo(bottom); stand.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.sub(bottom).normalize())
    }
    root.updateMatrixWorld(true)
  }
  return Object.assign(rig, { steering, frontLower, frontAxle, frontSpin, rearSwing, rearAxle, rearSpin, frontForks, guards, hydraulics, hydraulicSeats: seats })
}
