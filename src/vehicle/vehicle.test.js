import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box3, Group, Mesh, PlaneGeometry, MeshBasicMaterial, Vector3, Quaternion, Raycaster } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { bikeConfig } from './bikeConfig.js'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { createCycloneRig } from './cycloneRig.js'
import { registerRideSurfaces, sampleRideHeight } from './rideSurface.js'

const m = { frontZ: 0.78, rearZ: -0.78, frontY: 0.375, rearY: 0.375, frontRadius: 0.375, rearRadius: 0.375, wheelbase: 1.56 }
const start = { x: 0, z: 0, yaw: 0 }
const flat = () => 0
function run(state, input, seconds, sample = flat, fps = 60, canMove, config = bikeConfig) {
  for (let i = 0; i < seconds * fps; i++) advanceBike(state, input, 1 / fps, m, sample, canMove, config)
  return state
}

test('frame-rate independent acceleration, inertia, braking and wheel rolling', () => {
  const a = createBikeState(start, m, flat), b = createBikeState(start, m, flat)
  run(a, { throttle: 1 }, 5, flat, 30); run(b, { throttle: 1 }, 5, flat, 120)
  assert.ok(a.speed > 18 && a.speed <= bikeConfig.maxSpeed)
  assert.ok(Math.abs(a.z - b.z) < 0.01)
  assert.ok(Math.abs(a.frontSpin - (a.distance / m.frontRadius) % (Math.PI * 2)) < 1e-8)
  const speed = a.speed; run(a, {}, 1); assert.ok(a.speed < speed && a.speed > speed * 0.8)
  run(a, { brake: 1 }, 4); assert.equal(a.speed, 0)
})

test('engine reaches highway speed; launch squats the rear and braking loads the front', () => {
  const s = createBikeState(start, m, flat), gentle = createBikeState(start, m, flat)
  run(s, { throttle: 1 }, 0.5)
  run(gentle, { throttle: 1 }, 0.5, flat, 60, undefined, { ...bikeConfig, launchAcceleration: 0 })
  assert.ok(s.speed > gentle.speed + 0.5, 'Launch has an extra pull')
  assert.ok(s.rearSpring < -0.025 && s.frontSpring > 0.025 && s.pitch < -0.035)
  assert.ok(s.frontGrounded && s.rearGrounded, 'Load transfer keeps both tires planted')
  run(s, { throttle: 1 }, 30)
  assert.ok(s.speed * 3.6 > 213 && s.speed <= bikeConfig.maxSpeed, `Top speed ${s.speed * 3.6} km/h`)
  run(s, { brake: 1 }, 0.4)
  assert.ok(s.frontSpring < -0.012 && s.rearSpring > 0.025 && s.pitch > 0.025)
  assert.ok(s.frontGrounded && s.rearGrounded)
  run(s, { brake: 1 }, 7)
  assert.equal(s.speed, 0)
  assert.ok(Math.abs(s.pitch) < 1e-6)
})

test('turbine boost fires once per press, recharges and preserves excess speed and airborne thrust', () => {
  const a = createBikeState(start, m, flat), b = createBikeState(start, m, flat)
  for (const [s, fps] of [[a, 30], [b, 120]]) {
    s.speed = 59; s.parked = false
    run(s, { throttle: 1, boost: true }, 0.1, flat, fps)
    assert.ok(s.speed > 68 && s.boostCount === 1 && s.handbrake === 0)
    const speed = s.speed
    run(s, { throttle: 1 }, 1 / 30, flat, fps)
    assert.ok(s.speed > speed - 0.5, 'Excess speed must coast down without an engine-limit snap')
    run(s, { throttle: 1, boost: true }, 0.1, flat, fps)
    assert.equal(s.boostCount, 1, 'Cooldown rejects an early second press')
    run(s, { throttle: 1, boost: true }, 3, flat, fps)
    assert.equal(s.boostCount, 1, 'Held Shift never retriggers, even after cooldown')
    run(s, { throttle: 1 }, 1 / 30, flat, fps)
    run(s, { throttle: 1, boost: true }, 0.1, flat, fps)
    assert.equal(s.boostCount, 2)
    assert.ok(s.speed <= bikeConfig.boostMaxSpeed)
  }
  assert.ok(Math.abs(a.speed - b.speed) < 1e-8 && Math.abs(a.distance - b.distance) < 1e-8)
  const air = createBikeState(start, m, flat)
  air.frontSpring = air.rearSpring = air.height = 10
  air.frontGrounded = air.rearGrounded = false
  run(air, { boost: true }, 0.1, flat, 120)
  assert.ok(air.airborne && air.speed > bikeConfig.boostImpulse && air.boostCount === 1)
  for (const input of [{ brake: 1 }, { reverse: true }, { handbrake: true }]) {
    const stopped = createBikeState(start, m, flat)
    run(stopped, { ...input, boost: true }, 0.1)
    assert.equal(stopped.boostCount, 0)
  }
})

test('steering follows a bicycle arc, lean recovers and rapid reversal stays bounded', () => {
  const s = createBikeState(start, m, flat)
  run(s, { throttle: 1 }, 2); run(s, { throttle: 1, steer: 1 }, 0.8)
  assert.ok(s.x > 0 && s.lean < -0.1 && s.yaw > 0)
  assert.ok(Math.abs(s.lean) <= bikeConfig.maxLean + 0.01)
  const previousLean = s.lean; advanceBike(s, { steer: -1 }, 1 / 120, m, flat)
  assert.ok(Math.abs(s.lean - previousLean) < 0.03)
  for (let i = 0; i < 20; i++) run(s, { throttle: 1, steer: i % 2 ? 1 : -1 }, 0.25)
  assert.ok(Number.isFinite(s.lean) && Math.abs(s.lean) < 0.6)
  run(s, { brake: 1 }, 5); assert.ok(Math.abs(s.lean + bikeConfig.idleLean) < 0.01)
  const yaw = s.yaw; run(s, { steer: 1 }, 1); assert.equal(s.yaw, yaw)
})

test('independent suspension responds to bumps, load transfer and settles', () => {
  const s = createBikeState(start, m, flat)
  run(s, { throttle: 1 }, 1); assert.ok(s.pitch < -0.002)
  run(s, { brake: 1 }, 0.3); assert.ok(s.pitch > 0.001)
  const rough = (_x, z) => Math.sin(z * 2.1) * 0.06
  run(s, { throttle: 1 }, 4, rough, 60, undefined, { ...bikeConfig, flightEnabled: false })
  assert.ok(Math.abs(s.frontSpring - s.rearSpring) > 0.001)
  const ft = s.frontGround + m.frontRadius - m.frontY
  assert.ok(s.frontSpring <= ft + bikeConfig.forkExtension * 0.872 + 1e-6)
  assert.ok(s.frontSpring >= ft - bikeConfig.forkCompression * 0.872 - 1e-6)
  run(s, { brake: 1 }, 2); run(s, { brake: 1 }, 4)
  assert.ok(Math.abs(s.frontVelocity) < 1e-6 && Math.abs(s.rearVelocity) < 1e-6)
})

test('grade and cross slope compose with lean; obstacles stop wheel spin', () => {
  const slope = (x, z) => x * 0.08 + z * 0.1
  const s = createBikeState(start, m, slope); run(s, { brake: 1 }, 2, slope)
  assert.ok(s.pitch < -0.08 && s.bank > 0.06)
  const spin = s.frontSpin; run(s, { throttle: 1 }, 1, slope, 60, () => false)
  assert.equal(s.speed, 0); assert.equal(s.frontSpin, spin); assert.equal(s.distance, 0)
  run(s, { brake: 1 }, 1, slope); run(s, {}, 2, slope)
  assert.equal(s.speed, 0); assert.ok(s.idleBlend > 0.99)
})

test('handbrake locks the rear wheel, tightens turns and restores grip progressively', () => {
  const normal = createBikeState(start, m, flat), drift = createBikeState(start, m, flat)
  normal.speed = drift.speed = 15
  run(normal, { steer: 1 }, 0.55); run(drift, { steer: 1, handbrake: true }, 0.55)
  assert.ok(drift.yaw > normal.yaw * 1.5)
  assert.ok(drift.slip > 0.2 && drift.slip <= bikeConfig.maxDriftAngle)
  assert.ok(Math.abs(drift.rearAngularSpeed) < 0.01)
  const slip = drift.slip; run(drift, {}, 1 / 120)
  assert.ok(Math.abs(drift.slip - slip) < 0.05)
  run(drift, {}, 2); assert.ok(Math.abs(drift.slip) < 0.005)
  run(drift, { brake: 1 }, 5); const yaw = drift.yaw
  run(drift, { steer: 1, handbrake: true }, 1); assert.equal(drift.yaw, yaw)
})

test('a crest and sudden drop launch the bike; free flight follows gravity and lands', () => {
  const crest = (_x, z) => z < 5 ? 0 : z < 15 ? (z - 5) * 0.16 : z < 18 ? 1.6 : z < 23 ? 1.6 - (z - 18) * 0.32 : 0
  for (const sample of [crest, (_x, z) => z < 10 ? 1.5 : 0]) {
    const s = createBikeState(start, m, sample)
    let airborne = false, gap = 0, landed = false
    for (let i = 0; i < 120 * 10; i++) {
      advanceBike(s, { throttle: 1, brake: i > 600 ? 1 : 0 }, 1 / 120, m, sample)
      airborne ||= s.airborne; gap = Math.max(gap, s.frontAirGap, s.rearAirGap)
      landed ||= airborne && s.frontGrounded && s.rearGrounded
    }
    assert.ok(airborne && gap > 0.25 && landed)
    assert.ok(Math.abs(s.verticalVelocity) < 0.001 && Math.abs(s.height) < 0.005)
  }
  const s = createBikeState(start, m, flat)
  s.frontSpring = s.rearSpring = s.height = 3
  s.frontGrounded = s.rearGrounded = false
  run(s, {}, 0.1, flat, 120)
  assert.ok(Math.abs(s.verticalVelocity + bikeConfig.gravity * bikeConfig.airGravityScale * 0.1) < 1e-6)
  assert.ok(s.height < 2.92 && s.height > 2.90)
  // Disabling future take-off while already airborne must not teleport to ground.
  const height = s.height
  run(s, {}, 1 / 120, flat, 120, undefined, { ...bikeConfig, flightEnabled: false })
  assert.ok(height - s.height < 0.02 && s.airborne)
  const guided = createBikeState(start, m, crest)
  run(guided, { throttle: 1 }, 8, crest, 60, undefined, { ...bikeConfig, flightEnabled: false })
  assert.ok(!guided.airborne && guided.frontGrounded && guided.rearGrounded)
})

test('contact samples the rendered triangles and moving chunk transforms', () => {
  const scene = new Group(), geometry = new PlaneGeometry(8, 8, 2, 2); geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getX(i) * 0.2 + positions.getZ(i) * 0.1)
  const ground = new Mesh(geometry, new MeshBasicMaterial()); ground.userData.rideSurface = true; scene.add(ground)
  const unregister = registerRideSurfaces(scene)
  assert.ok(Math.abs(sampleRideHeight(1, 2) - 0.4) < 1e-6)
  ground.userData.rideSurfaceType = 'asphalt'
  const contact = {}
  assert.ok(Math.abs(sampleRideHeight(1, 2, contact) - 0.4) < 1e-6)
  assert.equal(contact.surface, 'asphalt', 'Contact type follows the actual rendered support surface')
  ground.position.set(20, 3, -20)
  assert.ok(Math.abs(sampleRideHeight(21, -18) - 3.4) < 1e-6)
  assert.equal(sampleRideHeight(200, 200), -Infinity)
  unregister(); geometry.dispose(); ground.material.dispose()
})

test('actual Cyclone and Scott retain materials, rig and mechanical contact', async () => {
  globalThis.self = globalThis
  // Geometry validation needs image descriptors, not a raster renderer.
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
  const load = async name => {
    const bytes = fs.readFileSync(new URL('../../public/models/mospeada/' + name, import.meta.url))
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
  }
  const bike = await load('cyclone-vr052f.glb'), scott = await load('scott-bernard-gear.glb')
  assert.deepEqual(fs.readFileSync(new URL('../../public/models/mospeada/scott-bernard-gear.glb', import.meta.url)), fs.readFileSync(new URL('../../assets/scott-bernard-gear.glb', import.meta.url)), 'The runtime must use the new Scott without changing its GLB')
  const pose = JSON.parse(fs.readFileSync(new URL('../../public/models/mospeada/scott-riding-pose.json', import.meta.url)))
  const before = new Box3().setFromObject(bike.scene).getSize(new Vector3()).toArray()
  const rig = createCycloneRig(bike.scene, scott.scene, pose)
  assert.equal(rig.lighting.headlights.length, 2)
  assert.equal(rig.lighting.amberLights.length, 2)
  rig.lighting.update(0)
  for (const lamp of [...rig.lighting.headlights, ...rig.lighting.amberLights]) {
    assert.equal(lamp.light.parent, rig.body)
    assert.equal(lamp.light.target.parent, rig.body)
    assert.ok(Math.abs(lamp.light.position.distanceTo(lamp.face.center) - 0.012) < 1e-8, 'Each light must originate just outside its real optical face')
    assert.ok(lamp.light.visible && lamp.light.intensity > 0)
    assert.ok(lamp.direction.z > 0 && lamp.direction.y < 0)
    assert.ok(lamp.lens.material.emissiveIntensity > 0)
  }
  for (const lamp of rig.lighting.amberLights) {
    assert.ok(lamp.light.color.equals(lamp.lens.material.color), 'Triangle beams must retain the lens amber color')
    assert.ok(lamp.direction.dot(lamp.face.normal) > 0.999)
  }
  assert.ok(rig.lighting.headlights[0].light.position.x * rig.lighting.headlights[1].light.position.x < 0, 'Headlights need separate left and right emitters')
  rig.lighting.update(1)
  assert.ok([...rig.lighting.headlights, ...rig.lighting.amberLights].every(lamp => !lamp.light.visible && lamp.light.intensity === 0))
  assert.ok(rig.lighting.luminous.every(lamp => lamp.material.emissiveIntensity === 0))
  bike.scene.traverse(mesh => {
    if (mesh.isMesh && /Headlight|faro-yellow/.test(mesh.userData.sourcePiece)) assert.ok(mesh.material.emissiveIntensity === 0 || mesh.material.emissive.getHex() === 0, 'Source materials must stay unlit and unmodified')
  })
  scott.scene.traverse(node => {
    if (!node.isBone || /Hips$/.test(node.name)) return
    const replacement = rig.bones.get(node.name.replace(/^mixamorig[:_]?/, ''))
    assert.ok(replacement.position.distanceTo(node.position) < 1e-8, 'The new Scott must retain its own joint offsets')
  })
  const motion = createBikeState(start, rig.metrics, flat)
  for (const [input, frames] of [[{ throttle: 1 }, 60], [{ throttle: 1, boost: true }, 18], [{ brake: 1 }, 120]]) {
    for (let frame = 0; frame < frames; frame++) {
      advanceBike(motion, input, 1 / 30, rig.metrics, flat)
      rig.update(motion, flat, bikeConfig)
      assert.ok(motion.frontGrounded && motion.rearGrounded, 'Load transfer must keep both tires planted on flat ground')
      assert.ok(Math.abs(rig.articulation.frontContactError) < 0.025, `Front tire under load: ${rig.articulation.frontContactError}`)
      assert.ok(Math.abs(rig.articulation.rearContactError) < 0.025, `Rear tire under load: ${rig.articulation.rearContactError}`)
      for (const fork of rig.frontForks) assert.ok(fork.state.topError < 1e-8 && fork.state.bottomError < 1e-8 && fork.state.insertion > 0.035)
      assert.ok(rig.arms.every(arm => arm.error < 0.05))
    }
  }
  assert.ok(rig.surfaces.filter(mesh => /Display_Recessed/.test(mesh.userData.sourcePiece)).every(mesh => mesh.parent === rig.body))
  const neutral = createBikeState(start, rig.metrics, flat)
  neutral.idleBlend = 0; rig.update(neutral, flat, bikeConfig)
  const neckForward = () => rig.body.worldToLocal(rig.bones.get('Neck').getWorldPosition(new Vector3())).z
  const neutralNeck = neckForward()
  for (const [name, input, duration] of [['boost', { throttle: 1, boost: true }, 0.2], ['brake', { brake: 1 }, 0.4], ['coleada', { handbrake: true, steer: 1 }, 0.8]]) {
    const state = createBikeState(start, rig.metrics, flat)
    state.speed = name === 'boost' ? 12 : 20; state.parked = false; state.idleBlend = 0
    for (let tick = 0; tick < Math.round(duration * 120); tick++) advanceBike(state, input, 1 / 120, rig.metrics, flat)
    rig.update(state, flat, bikeConfig)
    assert.ok(rig.arms.every(arm => arm.error < 0.025), name + ' must retain the handlebar grips')
    assert.ok(Math.abs(rig.articulation.frontContactError) < 0.03 && Math.abs(rig.articulation.rearContactError) < 0.03, name + ' tire support')
    for (const fork of rig.frontForks) assert.ok(fork.state.insertion > 0.035 && fork.state.topError < 1e-8)
    if (name === 'boost') assert.ok(neckForward() > neutralNeck + 0.06, 'Scott crouches forward against the boost')
    if (name === 'brake') assert.ok(neckForward() > neutralNeck + 0.025, 'Scott follows the braking dive')
  }
  assert.equal(rig.bones.size, 24); assert.ok(rig.metrics.wheelbase > 1.5 && rig.metrics.wheelbase < 1.7)
  let skin; scott.scene.traverse(n => { if (n.isSkinnedMesh) skin = n })
  assert.ok(skin.material.map && skin.material.normalMap && skin.material.roughnessMap)
  const s = createBikeState(start, rig.metrics, flat)
  for (const steer of [0, 0.4, -0.4]) {
    s.steer = steer; s.lean = steer * -0.7; rig.update(s, flat, bikeConfig)
    assert.ok(rig.arms.every(a => a.error < 0.05), `hand errors: ${rig.arms.map(a => a.error)}`)
    assert.ok(Math.abs(rig.articulation.frontContactError) < 0.02, JSON.stringify({ steer, ...rig.articulation }))
    assert.ok(Math.abs(rig.articulation.rearContactError) < 0.02)
    for (const bone of rig.bones.values()) assert.ok(Math.abs(bone.scale.x - 1) < 1e-6)
  }
  for (const scenario of [
    { steer: 0.52, lean: 0, slopeX: 0, slopeZ: 0 },
    { steer: -0.52, lean: 0, slopeX: 0, slopeZ: 0 },
    { steer: 0.05, lean: -0.54, slopeX: 0, slopeZ: 0 },
    { steer: 0, lean: 0, slopeX: 0, slopeZ: 0.35 },
    { steer: 0, lean: 0, slopeX: 0.2, slopeZ: 0.12 },
  ]) {
    const sample = (x, z) => scenario.slopeX * x + scenario.slopeZ * z
    const state = createBikeState(start, rig.metrics, sample)
    state.idleBlend = 0
    state.steer = scenario.steer; state.lean = scenario.lean; state.bank = Math.atan(scenario.slopeX)
    rig.update(state, sample, bikeConfig)
    assert.ok(rig.arms.every(a => a.error < 0.05), `reach ${JSON.stringify(scenario)}: ${rig.arms.map(a => a.error)}`)
    assert.ok(rig.legs.every(a => a.error < 0.01))
    for (const arm of rig.arms) {
      const skin = arm.skin, indices = skin.geometry.attributes.skinIndex, weights = skin.geometry.attributes.skinWeight
      const enclosure = arm.enclosure.clone().expandByScalar(0.004)
      for (let i = 0; i < indices.count; i++) {
        let weight = 0
        for (let j = 0; j < 4; j++) if (indices.getComponent(i, j) === arm.boneIndex) weight += weights.getComponent(i, j)
        if (weight < 0.7) continue
        const point = skin.localToWorld(skin.getVertexPosition(i, new Vector3()))
        rig.body.worldToLocal(point)
        assert.ok(enclosure.containsPoint(point), `glove outside fairing: ${JSON.stringify(scenario)}`)
        for (const plane of arm.enclosurePlanes) assert.ok(plane.normal.dot(point) - plane.constant < 0.008, `glove crosses sloped cover: ${plane.normal.dot(point) - plane.constant}`)
      }
    }
    for (const [index, hydraulic] of rig.hydraulics.entries()) {
      assert.ok(hydraulic.state.baseError < 1e-8 && hydraulic.state.targetError < 1e-8)
      const a = hydraulic.root.getWorldPosition(new Vector3()), b = hydraulic.targetFrame.localToWorld(hydraulic.target.clone())
      const axle = index === 0 ? rig.frontAxle : rig.rearAxle
      const center = axle.getWorldPosition(new Vector3()), axis = new Vector3(1, 0, 0).transformDirection(axle.matrixWorld)
      for (let i = 0; i <= 80; i++) {
        const point = new Vector3().lerpVectors(a, b, i / 80).sub(center), axial = Math.abs(point.dot(axis))
        const radial = Math.sqrt(Math.max(0, point.lengthSq() - axial * axial))
        if (radial < rig.metrics.frontRadius + 0.033) assert.ok(axial > rig.metrics.tireHalfWidth + 0.033, `hydraulic intersects wheel at ${scenario.steer}`)
      }
    }
    for (const wheel of [rig.frontSpin, rig.rearSpin]) {
      let clearance = Infinity
      wheel.traverse(mesh => {
        if (!mesh.isMesh || !/Tire_Rubber/.test(mesh.userData.sourcePiece)) return
        const positions = mesh.geometry.attributes.position, point = new Vector3()
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
          clearance = Math.min(clearance, point.y - sample(point.x, point.z))
        }
      })
      assert.ok(Math.abs(clearance) < 0.025, `tire silhouette contact: ${clearance}, ${JSON.stringify(scenario)}`)
    }
  }
  for (const [index, seat] of rig.hydraulicSeats.entries()) {
    const hydraulic = rig.hydraulics[index]
    assert.ok(hydraulic.base.distanceTo(seat.base) < 1e-9)
    assert.ok(Math.abs(seat.base.x) - hydraulic.casingRadius > Math.abs(seat.floor))
    assert.ok(Math.abs(seat.base.x) + hydraulic.casingRadius < Math.abs(seat.outer))
  }
  const guard = rig.guards[0], ray = new Raycaster()
  for (const lean of [0, -bikeConfig.idleLean]) {
    const state = createBikeState(start, rig.metrics, flat)
    state.idleBlend = lean ? 1 : 0; state.lean = lean
    rig.update(state, flat, bikeConfig)
    const hydraulic = rig.hydraulics[0]
    const end = rig.body.worldToLocal(hydraulic.targetFrame.localToWorld(hydraulic.target.clone()))
    const direction = end.sub(hydraulic.base)
    assert.ok(Math.abs(direction.x) < 1e-8, 'Straight front actuator must run in its base longitudinal plane')
    assert.ok(Math.abs(Math.atan2(direction.y, direction.z)) < 0.025, 'Resting actuator must be parallel to the body')
    const coverRear = Math.min(...guard.meshes.map(mesh => {
      mesh.geometry.computeBoundingBox()
      const box = mesh.geometry.boundingBox.clone().applyMatrix4(rig.body.matrixWorld.clone().invert().multiply(mesh.matrixWorld))
      return box.min.z
    }))
    assert.ok(hydraulic.base.z + direction.z + 0.033 < coverRear, 'Hydraulic end must stop behind the guard cover')
  }
  for (const heave of [-bikeConfig.forkCompression * 0.872, 0, bikeConfig.forkExtension * 0.872]) for (let i = 0; i <= 20; i++) {
    const state = createBikeState(start, rig.metrics, flat)
    state.idleBlend = 0; state.steer = -bikeConfig.mechanicalSteerLimit + 2 * bikeConfig.mechanicalSteerLimit * i / 20
    state.height += heave; rig.update(state, flat, bikeConfig)
    for (const fork of rig.frontForks) {
      for (let k = 0; k < fork.fixed.length; k++) {
        assert.equal(fork.fixed[k].parent, rig.body, 'Top fork mount must belong to the fixed chassis')
        assert.ok(fork.fixed[k].matrix.equals(fork.fixedMatrices[k]), 'Top fork base must not turn or translate')
      }
      assert.ok(fork.state.topError < 1e-8 && fork.state.bottomError < 1e-8)
      assert.ok(fork.state.axisError < 1e-8 && fork.state.radialError < 0.001, `Fork rod/sleeve alignment: ${JSON.stringify(fork.state)}`)
      assert.ok(fork.state.insertion > 0.035 && fork.state.insertion < 0.30, 'Rod must remain inserted in its hollow sleeve')
      for (const mesh of [...fork.lowerMeshes, fork.upperMeshes[0]]) {
        const positions = mesh.geometry.attributes.position
        const toAxle = rig.frontAxle.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
        for (let k = 0; k < positions.count; k++) {
          const point = new Vector3().fromBufferAttribute(positions, k).applyMatrix4(toAxle)
          if (Math.hypot(point.y, point.z) < rig.metrics.frontRadius + 0.002) assert.ok(Math.abs(point.x) > rig.metrics.tireHalfWidth + 0.002, 'Articulating fork must stay outside the tire')
        }
      }
    }
    assert.ok(guard.root.position.distanceTo(guard.pivot) < 1e-10, 'Guard hinge must stay attached to the wheel-side tip')
    assert.ok(Math.abs(guard.angle) <= bikeConfig.guardClearanceAngle + 1e-8)
    for (const mesh of guard.meshes) {
      const positions = mesh.geometry.attributes.position
      for (let k = 0; k < positions.count; k++) {
        const point = rig.frontAxle.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(positions, k)))
        if (Math.hypot(point.y, point.z) < rig.metrics.frontRadius + 0.005) assert.ok(Math.abs(point.x) > rig.metrics.tireHalfWidth + 0.003, 'Opening guard must stay outside the tire')
      }
    }
    if (state.steer <= 0) assert.ok(Math.abs(guard.angle) < 1e-10)
    const hydraulic = rig.hydraulics[0]
    assert.ok(hydraulic.state.connectorStartError < 1e-8 && hydraulic.state.connectorEndError < 1e-8, 'Connector must stay joined at both ends')
    assert.equal(hydraulic.mountFrame.userData.sourcePiece, 'Fork_Left_Lower_Reinforcement')
    const mount = hydraulic.mountFrame.localToWorld(hydraulic.outerMount.clone())
    const connectorStart = hydraulic.endPin.localToWorld(new Vector3(0, -0.5, 0))
    const connectorEnd = hydraulic.endPin.localToWorld(new Vector3(0, 0.5, 0))
    assert.ok(connectorStart.distanceTo(hydraulic.endJoint.getWorldPosition(new Vector3())) < 1e-8)
    assert.ok(connectorEnd.distanceTo(mount) < 1e-8)
    const center = rig.frontAxle.getWorldPosition(new Vector3()), wheelAxis = new Vector3(1, 0, 0).transformDirection(rig.frontAxle.matrixWorld)
    for (let sample = 0; sample <= 80; sample++) {
      const p = connectorStart.clone().lerp(connectorEnd, sample / 80).sub(center), axial = Math.abs(p.dot(wheelAxis))
      const radial = Math.sqrt(Math.max(0, p.lengthSq() - axial * axial))
      if (radial < rig.metrics.frontRadius + 0.027) assert.ok(axial > rig.metrics.tireHalfWidth + 0.027, 'Fork connector must stay outside the front tire')
    }
    const a = hydraulic.root.getWorldPosition(new Vector3()), b = hydraulic.targetFrame.localToWorld(hydraulic.target.clone())
    const direction = b.clone().sub(a).normalize(), u = new Vector3(0, 1, 0).cross(direction).normalize(), v = direction.clone().cross(u).normalize()
    for (let j = 0; j < 9; j++) {
      const offset = j === 8 ? new Vector3() : u.clone().multiplyScalar(Math.cos(j * Math.PI / 4) * (hydraulic.casingRadius + 0.003)).addScaledVector(v, Math.sin(j * Math.PI / 4) * (hydraulic.casingRadius + 0.003))
      ray.set(a.clone().addScaledVector(direction, 0.05).add(offset), direction); ray.far = a.distanceTo(b) - 0.10
      const hits = ray.intersectObjects(guard.meshes, false)
      assert.equal(hits.length, 0, `Hydraulic crosses ${hits[0]?.object.userData.sourcePiece}: steer=${state.steer}, heave=${heave}`)
    }
  }
  const idle = createBikeState(start, rig.metrics, flat)
  idle.lean = -bikeConfig.idleLean; idle.idleBlend = 1; idle.idleTime = 1
  rig.update(idle, flat, bikeConfig)
  assert.ok(rig.legs[0].error < 0.01, `left stance reach: ${rig.legs[0].error}`)
  const footSkin = rig.arms[0].skin, indices = footSkin.geometry.attributes.skinIndex, weights = footSkin.geometry.attributes.skinWeight
  const footBones = new Set(['LeftFoot', 'LeftToeBase'].map(name => footSkin.skeleton.bones.indexOf(rig.bones.get(name))))
  let soleHeight = Infinity
  for (let i = 0; i < indices.count; i++) {
    let weight = 0
    for (let j = 0; j < 4; j++) if (footBones.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j)
    if (weight >= 0.7) soleHeight = Math.min(soleHeight, footSkin.localToWorld(footSkin.getVertexPosition(i, new Vector3())).y)
  }
  assert.ok(soleHeight > -0.01 && soleHeight < 0.035, `planted foot sole: ${soleHeight}`)
  // A lowest vertex also passes when the heel touches but the toe points up.
  // Check the original sole's full footprint and its geometric normal instead.
  for (const scenario of [
    { yaw: 0, x: 0, z: 0 },
    { yaw: 1.7, x: 0, z: 0 },
    { yaw: -0.8, x: 0.08, z: -0.05 },
  ]) {
    const sample = (x, z) => x * scenario.x + z * scenario.z
    const stopped = createBikeState({ ...start, yaw: scenario.yaw }, rig.metrics, sample)
    stopped.lean = -bikeConfig.idleLean; stopped.idleBlend = 1
    rig.update(stopped, sample, bikeConfig)
    const left = rig.legs[0], normal = new Vector3(-scenario.x, 1, -scenario.z).normalize()
    const soleNormal = left.soleNormal.clone().applyQuaternion(left.hand.getWorldQuaternion(new Quaternion()))
    assert.ok(soleNormal.dot(normal) > 0.99999, 'The sole, not the ankle-to-toe bone, aligns with the road')
    let low = Infinity, high = -Infinity
    for (const index of left.soleIndices) {
      const point = footSkin.localToWorld(footSkin.getVertexPosition(index, new Vector3()))
      const clearance = point.y - sample(point.x, point.z)
      low = Math.min(low, clearance); high = Math.max(high, clearance)
    }
    assert.ok(low > -0.01 && high < 0.045 && high - low < 0.025, `Heel and forefoot must both be planted: ${low}, ${high}`)
    assert.ok(left.error < 0.01)
  }
  rig.update(idle, flat, bikeConfig)
  const head = rig.bones.get('Head').quaternion.clone()
  idle.idleTime = 6; rig.update(idle, flat, bikeConfig)
  assert.ok(head.angleTo(rig.bones.get('Head').quaternion) > 0.2)
  const riding = createBikeState(start, rig.metrics, flat)
  riding.idleBlend = 0; rig.update(riding, flat, bikeConfig)
  const hips = rig.bones.get('Hips'), seated = rig.body.worldToLocal(hips.getWorldPosition(new Vector3()))
  const feet = rig.legs.map(a => rig.body.worldToLocal(a.hand.getWorldPosition(new Vector3())))
  const bootFootprints = rig.legs.map(a => a.soleContactIndices.map(index => rig.body.worldToLocal(footSkin.localToWorld(footSkin.getVertexPosition(index, new Vector3())))))
  const offsets = new Map([...rig.bones.values()].map(b => [b, { position: b.position.clone(), scale: b.scale.clone() }]))
  riding.riderStand = 1; riding.frontGrounded = riding.rearGrounded = false; riding.airborne = true; riding.height += 2
  rig.update(riding, flat, bikeConfig)
  const standing = rig.body.worldToLocal(hips.getWorldPosition(new Vector3()))
  assert.ok(standing.y - seated.y > 0.29)
  for (let i = 0; i < 2; i++) {
    const leg = rig.legs[i], hip = leg.upper.getWorldPosition(new Vector3()), knee = leg.elbow.getWorldPosition(new Vector3()), foot = leg.hand.getWorldPosition(new Vector3())
    assert.ok(rig.body.worldToLocal(foot.clone()).distanceTo(feet[i]) < 1e-6, 'Standing keeps the boots on their pegs')
    assert.ok(hip.distanceTo(foot) / (hip.distanceTo(knee) + knee.distanceTo(foot)) > 0.93, 'Legs extend naturally')
    assert.ok(Math.abs(rig.body.worldToLocal(knee.clone()).x) < 0.32, 'Standing knees bend forward instead of splaying outward')
    assert.ok(rig.arms[i].error < 0.005 && leg.error < 0.005)
  }
  for (const blend of [0.25, 0.5, 0.75, 1]) {
    riding.riderStand = blend; rig.update(riding, flat, bikeConfig)
    for (let i = 0; i < 2; i++) {
      const leg = rig.legs[i]
      const soleNormal = leg.soleNormal.clone().applyQuaternion(leg.hand.getWorldQuaternion(new Quaternion()))
      const up = new Vector3(0, 1, 0).transformDirection(rig.body.matrixWorld)
      assert.ok(soleNormal.dot(up) > 0.99999, 'Boot soles keep the peg orientation throughout standing')
      assert.ok(leg.soleContactIndices.length > 20)
      for (let k = 0; k < leg.soleContactIndices.length; k++) {
        const p = rig.body.worldToLocal(footSkin.localToWorld(footSkin.getVertexPosition(leg.soleContactIndices[k], new Vector3())))
        assert.ok(p.distanceTo(bootFootprints[i][k]) < 0.01, `The boot sole must stay on its fixed support: ${p.distanceTo(bootFootprints[i][k])}`)
      }
    }
  }
  const standingPosition = hips.position.clone()
  for (let i = 0; i < 10; i++) rig.update(riding, flat, bikeConfig)
  assert.ok(hips.position.distanceTo(standingPosition) < 1e-10, 'Pose transforms never accumulate')
  for (const side of ['Left', 'Right']) {
    riding.riderStand = 0; riding.height = 0; riding.frontGrounded = riding.rearGrounded = true; riding.airborne = false
    riding.lean = side === 'Left' ? -0.35 : 0.35
    riding.riderDabLeft = side === 'Left' ? 1 : 0; riding.riderDabRight = side === 'Right' ? 1 : 0
    rig.update(riding, flat, bikeConfig)
    const active = rig.legs.find(a => a.side === side), passive = rig.legs.find(a => a.side !== side)
    const foot = active.hand.getWorldPosition(new Vector3())
    assert.ok(Math.abs(foot.x - start.x) > 0.65 && Math.abs(foot.y - active.soleOffset - 0.02) < 0.01)
    assert.ok(rig.body.worldToLocal(passive.hand.getWorldPosition(new Vector3())).distanceTo(feet[rig.legs.indexOf(passive)]) < 1e-6)
    assert.ok(active.error < 0.005 && rig.arms.every(a => a.error < 0.005))
  }
  riding.riderDabLeft = riding.riderDabRight = 0; riding.lean = 0
  rig.update(riding, flat, bikeConfig)
  assert.ok(rig.body.worldToLocal(hips.getWorldPosition(new Vector3())).distanceTo(seated) < 1e-9)
  for (const [bone, data] of offsets) {
    assert.ok(bone.scale.distanceTo(data.scale) < 1e-12)
    assert.ok(bone.position.distanceTo(data.position) < 1e-9, 'Joint offsets and original proportions survive every action')
  }
  const kick = createBikeState(start, rig.metrics, flat)
  kick.speed = 12; kick.parked = false; kick.idleBlend = 0
  advanceBike(kick, { boost: true, throttle: 1 }, 1 / 120, rig.metrics, flat)
  rig.update(kick, flat, bikeConfig)
  assert.ok(kick.z - rig.root.position.z > 0.03, 'The turbine first kicks the whole bike backward')
  assert.ok(rig.body.worldToLocal(hips.getWorldPosition(new Vector3())).z < seated.z - 0.005, 'Scott shares the short initial recoil')
  run(kick, { throttle: 1 }, 0.2, flat, 120, undefined, bikeConfig)
  rig.update(kick, flat, bikeConfig)
  const tucked = rig.body.worldToLocal(hips.getWorldPosition(new Vector3()))
  assert.ok(tucked.y < seated.y - 0.02 && tucked.z > seated.z + 0.02)
  assert.ok(rig.arms.every(a => a.error < 0.005))
  const backing = createBikeState(start, rig.metrics, flat)
  let stepsChecked = 0, lifted = false
  for (let i = 0; i < 360; i++) {
    advanceBike(backing, { brakeReverse: true }, 1 / 120, rig.metrics, flat)
    if (i < 120 || i % 6) continue
    rig.update(backing, flat, bikeConfig)
    assert.ok(rig.arms.every(a => a.error < 0.005) && rig.legs.every(a => a.error < 0.015))
    for (const leg of rig.legs) {
      const foot = leg.hand.getWorldPosition(new Vector3()), anchor = backing.reverseFeet[leg.side]
      if (anchor) {
        assert.ok(Math.hypot(foot.x - anchor.x, foot.z - anchor.z) < 0.01)
        assert.ok(Math.abs(foot.y - leg.soleOffset) < 0.01)
        stepsChecked++
      } else if (foot.y > leg.soleOffset + 0.025) lifted = true
    }
  }
  assert.ok(stepsChecked > 10 && lifted, 'Scott plants and lifts alternating feet to move the bike backward')
  assert.deepEqual(new Box3().setFromObject(bike.scene).getSize(new Vector3()).toArray(), before)
})
