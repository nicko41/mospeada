import * as T from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { fitRiderHands } from './riderHandFit.js'
import { createHydraulicLink, closestSurfacePoint } from './hydraulicLink.js'
import { createGuardHinge, seatHydraulicInHousing } from './guardMounts.js'
import { createFrontForks } from './frontForks.js'
import { createCycloneLights } from './cycloneLights.js'
import { compressionStroke } from './suspensionLimits.js'
import { readFootSupport, groundFootOrientation } from './riderFootSupport.js'
import { reverseFootTarget } from './riderMotion.js'
import { pedestrianFoot } from './riderPresence.js'
import { frontSteer } from './wheelieDynamics.js'
import { createFingerController } from './scottFingers.js'
import { ScottAnimations } from './ScottAnimations.js'

const v = new T.Vector3(), w = new T.Vector3(), q = new T.Quaternion()
function part(name, parent, position = [0, 0, 0]) {
  const group = new T.Group(); group.name = name; group.position.fromArray(position); parent.add(group); return group
}

export function createCycloneRig(source, scottSource, pose, clips = []) {
  const root = new T.Group(), body = part('Chassis', root)
  root.name = 'Cyclone_riding_vehicle'
  const model = source.clone(true)
  const meshes = []; model.traverse(n => { if (n.isMesh) meshes.push(n) })
  const tire = prefix => meshes.find(n => n.userData.sourcePiece === prefix + '_Tire_Rubber')
  const fb = new T.Box3().setFromObject(tire('Front')), rb = new T.Box3().setFromObject(tire('Rear'))
  const fc = fb.getCenter(new T.Vector3()), rc = rb.getCenter(new T.Vector3())
  const offset = new T.Vector3(-(fc.x + rc.x) / 2, -(fb.min.y + rb.min.y) / 2, -(fc.z + rc.z) / 2)
  fc.add(offset); rc.add(offset)
  const metrics = {
    frontZ: fc.z, rearZ: rc.z, frontY: fc.y, rearY: rc.y,
    frontRadius: (fb.max.y - fb.min.y) / 2, rearRadius: (rb.max.y - rb.min.y) / 2,
    wheelbase: fc.z - rc.z, tireHalfWidth: (fb.max.x - fb.min.x) / 2,
  }
  const neck = new T.Vector3(0, 0.105 * 1.3 + offset.y, 0.27035575 * 1.3 + offset.z)
  const steering = part('Steering_head', body, neck.toArray())
  const frontLower = part('Fork_lower_sliders', steering)
  const frontAxle = part('Front_axle', frontLower, fc.clone().sub(neck).toArray())
  const frontSpin = part('Front_wheel_spin', frontAxle)
  const rearPivot = new T.Vector3(0, 0.36, -0.05)
  const rearSwing = part('Rear_swingarm', body, rearPivot.toArray())
  const rearAxle = part('Rear_axle', rearSwing, rc.clone().sub(rearPivot).toArray())
  const rearSpin = part('Rear_wheel_spin', rearAxle)
  const surfaces = []
  root.updateMatrixWorld(true)
  for (const original of meshes) {
    const mesh = original.clone(); mesh.geometry = original.geometry.clone(); mesh.geometry.translate(...offset.toArray())
    mesh.material = Array.isArray(original.material) ? original.material.map(material => material.clone()) : original.material.clone()
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1)
    const name = original.userData.sourcePiece || original.name
    mesh.castShadow = true; mesh.receiveShadow = true
    body.add(mesh); root.updateMatrixWorld(true)
    let parent = body
    if (/^Front_(Tire|Rim|Hub)/.test(name)) parent = frontSpin
    else if (/^Rear_(Tire|Rim|Hub)/.test(name)) parent = rearSpin
    else if (/^Fork_/.test(name)) parent = /Upper_Clamp|Upper_Chassis_Lug|Upper_Cross_Pin/.test(name) ? body : frontLower
    else if (/^Arm_Guard_/.test(name)) parent = frontLower
    // The fairings and cockpit controls remain on the chassis. Only the front
    // fork/axle assembly steers; its actuator transmits the concealed input.
    else if (/^(Left_|Right_|Display_Recessed)/.test(name)) parent = body
    else if (/brazo tubular/.test(name)) {
      mesh.geometry.computeBoundingBox()
      parent = mesh.geometry.boundingBox.getCenter(new T.Vector3()).z > 0 ? frontLower : rearSwing
    }
    parent.attach(mesh)
    surfaces.push(mesh)
    if (/brazo tubular/.test(name)) mesh.visible = false
  }
  const frontForks = createFrontForks(body, frontLower, surfaces)
  const guards = [createGuardHinge(frontAxle, surfaces, 1), createGuardHinge(frontAxle, surfaces, -1)]
  const hydraulicSeats = [seatHydraulicInHousing(body, surfaces, 1, offset), seatHydraulicInHousing(body, surfaces, -1, offset)]
  const normalization = part('Scott_coordinate_conversion', body, offset.toArray())
  normalization.rotation.y = pose.modelRotationY; normalization.scale.setScalar(pose.modelScale)
  const rider = clone(scottSource); normalization.add(rider)
  rider.position.fromArray(pose.position); rider.rotation.set(...pose.rotation.map(T.MathUtils.degToRad)); rider.scale.fromArray(pose.scale)
  const bones = new Map(), originals = new Map()
  const animations = clips.length ? new ScottAnimations(scottSource, clips) : null
  const restWorld = new Map()
  scottSource.updateWorldMatrix(true, true)
  scottSource.traverse(node => {
    if (node.isBone) restWorld.set(node.name.replace(/^mixamorig[:_]?/, ''), { orientation: node.getWorldQuaternion(new T.Quaternion()), position: node.getWorldPosition(new T.Vector3()) })
  })
  function applyPose(node, key) {
    if (node.isBone) {
      const data = pose.pose.bones.find(b => b.key === key)
      if (!data) throw Error('La pose guardada no coincide con el rig de Scott: ' + key)
      node.position.fromArray(data.position); node.quaternion.fromArray(data.quaternion); node.scale.fromArray(data.scale)
      bones.set(node.name.replace(/^mixamorig[:_]?/, ''), node); originals.set(node, node.quaternion.clone())
    }
    if (node.isSkinnedMesh) {
      node.frustumCulled = false; node.castShadow = true
      node.material = Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone()
    }
    node.children.forEach((child, i) => applyPose(child, `${key}/${i}`))
  }
  // Apply saved paths relative to the GLTF scene, before coordinate conversion.
  applyPose(rider, 'scene')
  const fingers = createFingerController(rider)
  fingers.apply(0.85)
  root.updateMatrixWorld(true)
  const handFits = fitRiderHands(body, rider, bones, surfaces, restWorld)
  // Preserve the authored elbow plane. IK rotates joints; it never scales bones.
  const arms = ['Left', 'Right'].map((side, index) => {
    const upper = bones.get(side + 'Arm'), elbow = bones.get(side + 'ForeArm'), hand = bones.get(side + 'Hand')
    const pole = body.worldToLocal(elbow.getWorldPosition(new T.Vector3()))
    return { upper, elbow, hand, pole, ...handFits[index], error: 0 }
  })
  const legs = ['Left', 'Right'].map(side => {
    const upper = bones.get(side + 'UpLeg'), elbow = bones.get(side + 'Leg'), hand = bones.get(side + 'Foot')
    const target = body.worldToLocal(hand.getWorldPosition(new T.Vector3()))
    target.x = Math.sign(target.x) * Math.min(Math.abs(target.x), 0.36); target.y -= 0.025
    const toe = bones.get(side + 'ToeBase')
    const support = readFootSupport(scottSource, side, hand.getWorldScale(new T.Vector3()))
    const pegOrientation = body.getWorldQuaternion(new T.Quaternion()).invert().multiply(support.stanceOrientation)
    const pole = body.worldToLocal(elbow.getWorldPosition(new T.Vector3()))
    const standingPole = new T.Vector3(side === 'Left' ? 0.22 : -0.22, pole.y, 0.25)
    return { upper, elbow, hand, toe, target, pole, standingPole, side, ...support, skin: rider.getObjectByName(support.skin.name), pegOrientation, error: 0 }
  })
  normalization.position.z += 0.13
  const hips = bones.get('Hips'), hipsRestPosition = hips.position.clone()
  function rotateBone(bone, tail, target) {
    const origin = bone.getWorldPosition(new T.Vector3())
    const current = tail.getWorldPosition(new T.Vector3()).sub(origin).normalize(), desired = target.clone().sub(origin).normalize()
    const worldRotation = bone.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(current, desired))
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldRotation))
    root.updateMatrixWorld(true)
  }
  function poseRider(acceleration, steer, s, sample, config) {
    for (const [bone, original] of originals) bone.quaternion.copy(original)
    hips.position.copy(hipsRestPosition)
    root.updateMatrixWorld(true)
    const stand = s.riderStand || 0, wheelie = Math.min(s.wheelieAngle || 0, 1.4), slam = s.wheelieLandingKick || 0
    const boost = s.boostBlend || 0, reverse = s.reverseBlend || 0
    if (stand > 0 || boost > 0 || reverse > 0 || s.boostKick > 0 || wheelie > 0 || slam > 0) {
      const position = body.worldToLocal(hips.getWorldPosition(new T.Vector3()))
      position.y += config.riderStandHeight * stand - boost * config.boostRiderCrouch - reverse * 0.025 - slam * 0.035
      position.z += config.riderStandForward * stand + boost * config.boostRiderForward - (s.boostKick || 0) * config.boostRiderRecoil - wheelie * 0.025
      hips.position.copy(hips.parent.worldToLocal(body.localToWorld(position)))
      root.updateMatrixWorld(true)
    }
    const spine = bones.get('Spine')
    const axis = new T.Vector3(1, 0, 0).applyQuaternion(body.getWorldQuaternion(new T.Quaternion()))
    const impact = Math.max(s.frontImpact || 0, s.rearImpact || 0)
    const flex = (animations?.drivingLean ?? 0.43) + Math.abs(steer) * 0.18 - T.MathUtils.clamp(acceleration * 0.003, -0.055, 0.055)
      + boost * config.boostRiderLean + (s.brakeBlend || 0) * config.brakeRiderLean + impact * 0.045 + stand * config.riderStandTorsoLean - reverse * 0.08 + wheelie * 0.12 + slam * 0.18
    const rotation = spine.getWorldQuaternion(new T.Quaternion()).premultiply(q.setFromAxisAngle(axis, flex))
    const up = new T.Vector3(0, 1, 0).applyQuaternion(body.getWorldQuaternion(new T.Quaternion()))
    rotation.premultiply(q.setFromAxisAngle(up, steer * 0.85))
    spine.quaternion.copy(spine.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation))
    root.updateMatrixWorld(true)
    const neck = bones.get('Neck')
    const neckWorld = neck.getWorldQuaternion(new T.Quaternion()).premultiply(q.setFromAxisAngle(axis, -flex * 0.7))
    neck.quaternion.copy(neck.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(neckWorld))
    root.updateMatrixWorld(true)
    const idle = s.idleBlend || 0
    const head = bones.get('Head'), headWorld = head.getWorldQuaternion(new T.Quaternion())
    headWorld.premultiply(q.setFromAxisAngle(up, Math.sin((s.idleTime || 0) * config.idleHeadSpeed) * config.idleHeadAngle * idle))
    head.quaternion.copy(head.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(headWorld)); root.updateMatrixWorld(true)
    for (const arm of [...arms, ...legs]) {
      const a = arm.upper.getWorldPosition(new T.Vector3()), b = arm.elbow.getWorldPosition(new T.Vector3()), end = arm.hand.getWorldPosition(new T.Vector3())
      const target = body.localToWorld(arm.target.clone())
      const dab = arm.side === 'Left' ? s.riderDabLeft || 0 : arm.side === 'Right' ? s.riderDabRight || 0 : 0
      let groundOrientation = null
      if (arm.side === 'Left' && idle > 0) {
        const planted = root.localToWorld(new T.Vector3(config.idleFootOffset, 0, -0.13))
        const support = groundFootOrientation(root, planted, sample, arm.stanceOrientation)
        planted.y = sample(planted.x, planted.z) + arm.soleOffset / support.normal.y
        groundOrientation = support.orientation
        target.lerp(planted, idle)
      }
      if (dab > 0) {
        const sign = arm.side === 'Left' ? 1 : -1
        const extended = root.localToWorld(new T.Vector3(sign * config.riderDabOffset, 0, config.riderDabForward))
        const support = groundFootOrientation(root, extended, sample, arm.stanceOrientation)
        extended.y = sample(extended.x, extended.z) + arm.soleOffset / support.normal.y + 0.02
        groundOrientation = support.orientation
        // Keep the sole above the ground without stretching either leg bone.
        const reach = a.distanceTo(b) + b.distanceTo(end) - 0.015
        const horizontal = Math.hypot(extended.x - a.x, extended.z - a.z)
        const available = Math.sqrt(Math.max(0, reach * reach - (extended.y - a.y) ** 2))
        if (horizontal > available && horizontal > 0) {
          const ratio = available / horizontal
          extended.x = a.x + (extended.x - a.x) * ratio; extended.z = a.z + (extended.z - a.z) * ratio
        }
        target.lerp(extended, dab * (1 - idle))
      }
      if (arm.side && reverse > 0) {
        const step = reverseFootTarget(s, arm.side, config)
        const pushing = new T.Vector3(step.x, 0, step.z)
        const support = groundFootOrientation(root, pushing, sample, arm.stanceOrientation)
        pushing.y = sample(pushing.x, pushing.z) + arm.soleOffset / support.normal.y + step.lift
        groundOrientation = support.orientation
        target.lerp(pushing, reverse)
      }
      const l1 = a.distanceTo(b), l2 = b.distanceTo(end), direction = target.clone().sub(a)
      const distance = T.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 0.005, l1 + l2 - 0.008)
      direction.normalize()
      const kneePole = arm.pole.clone()
      if (arm.standingPole) kneePole.lerp(arm.standingPole, stand)
      const pole = body.localToWorld(kneePole).sub(a)
      pole.addScaledVector(direction, -pole.dot(direction)).normalize()
      const along = (distance * distance + l1 * l1 - l2 * l2) / (2 * distance)
      const desiredElbow = a.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
      rotateBone(arm.upper, arm.elbow, desiredElbow)
      rotateBone(arm.elbow, arm.hand, a.clone().addScaledVector(direction, distance))
      if (arm.orientation) {
        const wristWorld = body.getWorldQuaternion(new T.Quaternion()).multiply(arm.orientation)
        arm.hand.quaternion.copy(arm.hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(wristWorld))
        root.updateMatrixWorld(true)
      } else if (arm.side) {
        // The entire boot has a fixed frame on its peg while hips and knees
        // move. Holding only the ankle allowed the sole to pitch upward.
        const current = body.getWorldQuaternion(new T.Quaternion()).multiply(arm.pegOrientation)
        const contactBlend = Math.max(arm.side === 'Left' ? idle : 0, dab, reverse)
        if (groundOrientation) current.slerp(groundOrientation, contactBlend)
        arm.toe.quaternion.copy(arm.toeRestOrientation)
        arm.hand.quaternion.copy(arm.hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(current)); root.updateMatrixWorld(true)
      }
      arm.error = arm.hand.getWorldPosition(v).distanceTo(target)
    }
  }
  function solveOnFootLimb(limb, target, pole, orientation) {
    const a = limb.upper.getWorldPosition(new T.Vector3()), b = limb.elbow.getWorldPosition(new T.Vector3()), end = limb.hand.getWorldPosition(new T.Vector3())
    const l1 = a.distanceTo(b), l2 = b.distanceTo(end), direction = target.clone().sub(a)
    const distance = T.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 0.005, l1 + l2 - 0.008)
    direction.normalize(); pole.sub(a); pole.addScaledVector(direction, -pole.dot(direction)).normalize()
    const along = (distance * distance + l1 * l1 - l2 * l2) / (2 * distance)
    rotateBone(limb.upper, limb.elbow, a.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along))))
    rotateBone(limb.elbow, limb.hand, a.clone().addScaledVector(direction, distance))
    if (orientation) limb.hand.quaternion.copy(limb.hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(orientation))
    root.updateMatrixWorld(true)
    limb.onFootError = limb.hand.getWorldPosition(new T.Vector3()).distanceTo(target)
  }
  function poseOnFoot(s, sample) {
    if (!s.pedestrian || !s.dismountBlend) return
    const p = s.pedestrian, t = s.dismountBlend, blend = t * t * (3 - 2 * t)
    const seated = new Map([...bones.values()].map(bone => [bone, bone.quaternion.clone()]))
    const seatedHips = hips.getWorldPosition(new T.Vector3()), yaw = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.yaw)
    const animated = animations?.sample(p)
    // The source rig's actual rest frames define the upright pose. No guessed
    // Euler corrections, changed weights, bone lengths or model scales.
    for (const [name, bone] of bones) {
      const desired = yaw.clone().multiply(animated?.orientations.get(name) || restWorld.get(name).orientation)
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(desired))
      bone.updateWorldMatrix(true, false)
    }
    const scale = hips.getWorldScale(new T.Vector3()).x / 0.01
    const hipHeight = restWorld.get('Hips').position.y * scale - 0.065 + (animated?.hipDelta || 0) * scale
    const hipTarget = new T.Vector3(p.x, p.ground + hipHeight + 0.16 * Math.sin(Math.PI * t), p.z)
    if (p.moving) hipTarget.y += Math.abs(Math.sin(p.phase)) * 0.012
    hips.position.copy(hips.parent.worldToLocal(hipTarget)); root.updateMatrixWorld(true)
    const point = (x, y, z) => new T.Vector3(x, y, z).applyQuaternion(yaw).add(new T.Vector3(p.x, p.ground, p.z))
    for (const [i, arm] of arms.entries()) {
      const authored = [arm.upper, arm.elbow, arm.hand].map(bone => bone.quaternion.clone())
      const sign = i === 0 ? 1 : -1, swing = p.moving ? Math.sin(p.phase + i * Math.PI) * 0.14 : 0
      solveOnFootLimb(arm, point(sign * 0.37, 1.12, 0.06 - swing), point(sign * 0.54, 1.20, -0.14), null)
      if (animated) {
        ;[arm.upper, arm.elbow, arm.hand].forEach((bone, j) => bone.quaternion.slerp(authored[j], animated.armWeight))
        root.updateMatrixWorld(true)
      }
    }
    for (const leg of legs) {
      const foot = pedestrianFoot(p, leg.side), target = new T.Vector3(foot.x, 0, foot.z)
      const support = groundFootOrientation({ getWorldQuaternion: q => q.copy(yaw) }, target, sample, leg.stanceOrientation)
      target.y = sample(target.x, target.z) + leg.soleOffset / support.normal.y + foot.lift
      // The far boot passes up and behind the saddle while stepping over it.
      if ((p.side > 0 ? 'Right' : 'Left') === leg.side) {
        const lift = Math.sin(Math.PI * t)
        target.y += lift * 0.95; target.addScaledVector(new T.Vector3(0, 0, -1).applyQuaternion(yaw), lift * 0.35)
      }
      leg.toe.quaternion.copy(leg.toeRestOrientation)
      solveOnFootLimb(leg, target, point(leg.side === 'Left' ? 0.20 : -0.20, 0.6, 0.65), support.orientation)
    }
    const standingHips = hips.getWorldPosition(new T.Vector3()), rotations = new Map([...bones.values()].map(bone => [bone, bone.quaternion.clone()]))
    for (const [bone, rotation] of seated) bone.quaternion.copy(rotation).slerp(rotations.get(bone), blend)
    hips.position.copy(hips.parent.worldToLocal(seatedHips.lerp(standingHips, blend))); root.updateMatrixWorld(true)
  }
  const forkAxis = new T.Vector3(0, 0.8718175736, -0.4898307037)
  // Put the moving end in the same longitudinal plane as its seated base.
  // The actuator stops behind the cover; its connector reaches the actual
  // lower reinforcement of the vertical fork and follows that moving surface.
  const frontMount = new T.Vector3(hydraulicSeats[0].base.x, hydraulicSeats[0].base.y, fc.z - 0.42)
  const frontTarget = guards[0].root.worldToLocal(body.localToWorld(frontMount))
  const forkMountFrame = frontForks[0].lowerMeshes.find(mesh => /Lower_Reinforcement$/.test(mesh.userData.sourcePiece))
  const forkMount = closestSurfacePoint(forkMountFrame, guards[0].root.localToWorld(frontTarget.clone()))
  const hydraulics = [
    createHydraulicLink(body, guards[0].root, hydraulicSeats[0].base, frontTarget, { casingRadius: hydraulicSeats[0].casingRadius, endMountFrame: forkMountFrame, endMount: forkMount }),
    createHydraulicLink(body, rearAxle, hydraulicSeats[1].base, new T.Vector3(-0.24, -0.05, 0.02), { casingRadius: hydraulicSeats[1].casingRadius }),
  ]
  function tireProfile(mesh, center) {
    const values = new Map(), points = mesh.geometry.attributes.position
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i) + offset.x - center.x
      const radius = Math.hypot(points.getY(i) + offset.y - center.y, points.getZ(i) + offset.z - center.z)
      const key = `${x.toFixed(5)},${radius.toFixed(5)}`
      if (!values.has(key)) values.set(key, [x, radius])
    }
    return [...values.values()]
  }
  const frontProfile = tireProfile(tire('Front'), fc), rearProfile = tireProfile(tire('Rear'), rc)
  function support(axle, profile, sample, grounded = true) {
    const axis = new T.Vector3(1, 0, 0).transformDirection(axle.matrixWorld)
    const center = axle.getWorldPosition(new T.Vector3()), h = 0.12
    const dx = (sample(center.x + h, center.z) - sample(center.x - h, center.z)) / (2 * h)
    const dz = (sample(center.x, center.z + h) - sample(center.x, center.z - h)) / (2 * h)
    const normal = new T.Vector3(grounded && Number.isFinite(dx) ? -dx : 0, 1, grounded && Number.isFinite(dz) ? -dz : 0)
    const axial = axis.dot(normal), radial = Math.sqrt(Math.max(0, normal.lengthSq() - axial * axial))
    return Math.max(...profile.map(([x, radius]) => -axial * x + radial * radius))
  }
  const articulation = { frontTravel: 0, rearTravel: 0, frontContactError: 0, rearContactError: 0 }
  const lighting = createCycloneLights(body, surfaces)
  const sunlight = new T.DirectionalLight('#f1f3df', 0.6)
  sunlight.position.set(4, 7, 3); sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  Object.assign(sunlight.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.1, far: 16 })
  sunlight.shadow.normalBias = 0.02; sunlight.shadow.bias = -0.0001
  root.add(sunlight, sunlight.target)
  // Soft contact shading also works on the inherited custom terrain shaders.
  const shadePixels = new Uint8Array(32 * 32 * 4)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const r = ((x - 15.5) / 15.5) ** 2 + ((y - 15.5) / 15.5) ** 2
    shadePixels[(y * 32 + x) * 4 + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 150)
  }
  const shadeMap = new T.DataTexture(shadePixels, 32, 32, T.RGBAFormat)
  shadeMap.magFilter = T.LinearFilter; shadeMap.needsUpdate = true
  const shadeGeometry = new T.PlaneGeometry(1.1, 2.7, 2, 8); shadeGeometry.rotateX(-Math.PI / 2)
  const shade = new T.Mesh(shadeGeometry, new T.MeshBasicMaterial({ map: shadeMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  shade.renderOrder = 3; root.add(shade)
  const stand = new T.Mesh(new T.CylinderGeometry(0.014, 0.018, 1, 8), new T.MeshStandardMaterial({ color: '#3a4545', metalness: 0.65, roughness: 0.45 }))
  stand.name = 'Deployed_kickstand'; stand.castShadow = true; root.add(stand)
  function update(s, sample, config) {
    const recoil = (s.boostKick || 0) * config.boostRecoilDistance
    root.position.set(s.x - Math.sin(s.yaw) * recoil, s.height, s.z - Math.cos(s.yaw) * recoil)
    root.rotation.y = s.yaw
    body.rotation.set(s.pitch, 0, s.lean + s.bank, 'YXZ')
    body.position.set(0, 0, 0)
    if (s.wheelieAngle > 0) {
      const restRear = rc.clone().applyEuler(body.rotation)
      body.rotation.x -= s.wheelieAngle
      body.position.copy(restRear.sub(rc.clone().applyEuler(body.rotation)))
    }
    const mechanicalSteer = T.MathUtils.clamp(frontSteer(s), -config.mechanicalSteerLimit, config.mechanicalSteerLimit)
    articulation.frontSteer = mechanicalSteer
    steering.quaternion.setFromAxisAngle(forkAxis, Math.atan(Math.tan(mechanicalSteer) / forkAxis.y))
    // The left guard yields around its wheel-side tip, opening only as much as
    // needed for the inboard hydraulic when steering left. Its pivot never moves.
    const opening = T.MathUtils.clamp(mechanicalSteer / config.mechanicalSteerLimit, 0, 1)
    guards[0].angle = -config.guardClearanceAngle * opening * opening * (3 - 2 * opening)
    guards[0].root.rotation.y = guards[0].angle
    frontLower.position.set(0, 0, 0); rearSwing.rotation.x = 0
    frontSpin.rotation.x = s.frontSpin; rearSpin.rotation.x = s.rearSpin
    root.updateMatrixWorld(true)
    // The authored tire profile, rather than a box or sphere, determines its
    // support radius while banked. Both axles retain the chassis lean.
    const frontGrounded = s.frontGrounded !== false, rearGrounded = s.rearGrounded !== false
    const frontSupport = support(frontAxle, frontProfile, sample, frontGrounded), rearSupport = support(rearAxle, rearProfile, sample, rearGrounded)
    root.position.y += ((frontSupport - metrics.frontRadius) + (rearSupport - metrics.rearRadius)
      + (metrics.frontY + metrics.rearY) * (1 - Math.cos(s.lean + s.bank))) / 2
    root.updateMatrixWorld(true)
    const axisWorld = forkAxis.clone().transformDirection(steering.matrixWorld)
    // Iterate the inclined fork contact: compression changes wheel X/Z as well as Y.
    let travel = frontGrounded ? 0 : -config.forkExtension
    frontLower.position.copy(forkAxis).multiplyScalar(travel); root.updateMatrixWorld(true)
    for (let i = 0; frontGrounded && i < 3; i++) {
      frontAxle.getWorldPosition(v)
      travel += (sample(v.x, v.z) + frontSupport - v.y) / Math.max(0.5, axisWorld.y)
      travel = T.MathUtils.clamp(travel, -config.forkExtension, compressionStroke(s, 'front', config))
      frontLower.position.copy(forkAxis).multiplyScalar(travel); root.updateMatrixWorld(true)
    }
    articulation.frontTravel = travel
    frontAxle.getWorldPosition(v); articulation.frontContactError = v.y - frontSupport - sample(v.x, v.z)
    if (!rearGrounded) rearSwing.rotation.x = -config.rearExtension / Math.abs(rc.z - rearPivot.z)
    root.updateMatrixWorld(true)
    for (let i = 0; rearGrounded && i < 3; i++) {
      rearAxle.getWorldPosition(v)
      const dy = sample(v.x, v.z) + rearSupport - v.y
      rearSwing.rotation.x = T.MathUtils.clamp(rearSwing.rotation.x + dy / Math.abs(rc.z - rearPivot.z), -config.rearExtension / Math.abs(rc.z - rearPivot.z), compressionStroke(s, 'rear', config) / Math.abs(rc.z - rearPivot.z))
      root.updateMatrixWorld(true)
    }
    articulation.rearTravel = rearSwing.rotation.x * Math.abs(rc.z - rearPivot.z)
    rearAxle.getWorldPosition(w); articulation.rearContactError = w.y - rearSupport - sample(w.x, w.z)
    frontForks.forEach(fork => fork.update())
    hydraulics.forEach(link => link.update())
    if ((s.dismountBlend || 0) < 1) poseRider(s.acceleration, mechanicalSteer * (1 - (s.idleBlend || 0)), s, sample, config)
    poseOnFoot(s, sample)
    fingers.apply(0.85 + ((s.fist ? 1 : 0.12) - 0.85) * (s.dismountBlend || 0))
    root.updateMatrixWorld(true)
    stand.visible = s.dismountBlend > 0.4
    if (stand.visible) {
      const top = body.localToWorld(new T.Vector3(0.18, 0.40, -0.34)), bottom = root.localToWorld(new T.Vector3(0.43, 0, -0.38))
      bottom.y = sample(bottom.x, bottom.z) + 0.012
      root.worldToLocal(top); root.worldToLocal(bottom)
      stand.position.copy(top).add(bottom).multiplyScalar(0.5); stand.scale.y = top.distanceTo(bottom)
      stand.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.sub(bottom).normalize())
    }
    const shadePositions = shadeGeometry.attributes.position
    for (let i = 0; i < shadePositions.count; i++) {
      v.set(shadePositions.getX(i), 0, shadePositions.getZ(i)); root.localToWorld(v)
      const ground = sample(v.x, v.z)
      shadePositions.setY(i, Number.isFinite(ground) ? ground - root.position.y + 0.012 : -0.1)
    }
    shadePositions.needsUpdate = true
    shade.material.opacity = Math.exp(-Math.max(s.frontAirGap || 0, s.rearAirGap || 0) * 1.8)
  }
  return { root, body, rider, fingers, animations, steering, frontLower, frontAxle, rearSwing, rearAxle, frontSpin, rearSpin, metrics, bones, arms, legs, articulation, hydraulics, hydraulicSeats, frontForks, guards, surfaces, sunlight, headlight: lighting.headlights[0].light, lighting, update }
}
