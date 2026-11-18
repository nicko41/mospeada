import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { AnimationMixer, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readGlb, accessorData } from './glb-data.mjs'
import { createCycloneRig } from '../src/vehicle/cycloneRig.js'
import { createBikeState, advanceBike } from '../src/vehicle/bikePhysics.js'
import { requestRiderToggle } from '../src/vehicle/riderPresence.js'
import { bikeConfig } from '../src/vehicle/bikeConfig.js'

const directory = 'artifacts/scott-animated', report = JSON.parse(fs.readFileSync(`${directory}/build-report.json`))
const source = readGlb(report.source), corrected = readGlb(report.output)
assert.equal(createHash('sha256').update(source.bytes).digest('hex'), 'c9f73c39b30761049dbd854d21cae6d8b2bc233547d59a2ec2170fc53a561961')
assert.deepEqual(source.doc.animations, corrected.doc.animations, 'All 16 original clips and sampler data references survive')
assert.ok(source.bin.equals(corrected.bin.subarray(0, source.bin.length)), 'All original payloads remain byte-identical')
assert.deepEqual(source.doc.skins[0].joints, corrected.doc.skins[0].joints.slice(0, 24))
assert.equal(corrected.doc.skins[0].joints.length, 54)
assert.deepEqual(source.doc.materials[0], corrected.doc.materials[0])
assert.ok(report.textureReport.every(t => t.outsideMask === 0))
const primitive = source.doc.meshes[0].primitives[0]
const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessorData(source, index).values]))
for (const [i, region] of report.regions.entries()) {
  const p = corrected.doc.meshes[i].primitives[0]
  for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
    const values = accessorData(corrected, p.attributes[name]).values
    region.sourceVertices.forEach((v, j) => assert.deepEqual(values[j], attributes[name][v], `${region.name} ${name}`))
  }
  const weights = accessorData(corrected, p.attributes.WEIGHTS_0).values
  if (region.rigid) assert.ok(weights.every(row => row[0] === 1 && row.slice(1).every(w => w === 0)))
  else region.sourceVertices.forEach((v, j) => assert.deepEqual(weights[j], attributes.WEIGHTS_0[v]))
}

globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
async function load(bytes) { return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '') }
const asset = await load(corrected.bytes), bike = await load(fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'))
const rigid = []; asset.scene.traverse(n => { if (n.isSkinnedMesh && n.userData.rigidArmor) rigid.push(n) })
asset.scene.updateMatrixWorld(true)
const baselines = new Map(rigid.map(mesh => [mesh, [0, 1, 2, 3, 4].map(i => mesh.localToWorld(mesh.getVertexPosition(Math.floor(i * (mesh.geometry.attributes.position.count - 1) / 4), new Vector3())))]))
let maxRigidDistanceError = 0
for (const clip of asset.animations) {
  const mixer = new AnimationMixer(asset.scene); mixer.clipAction(clip).play()
  for (const fraction of [0, 0.25, 0.5, 0.75]) {
    mixer.setTime(clip.duration * fraction); asset.scene.updateMatrixWorld(true)
    for (const mesh of rigid) {
      const before = baselines.get(mesh), after = before.map((_, i) => mesh.localToWorld(mesh.getVertexPosition(Math.floor(i * (mesh.geometry.attributes.position.count - 1) / 4), new Vector3())))
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) maxRigidDistanceError = Math.max(maxRigidDistanceError, Math.abs(before[a].distanceTo(before[b]) - after[a].distanceTo(after[b])))
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(asset.scene)
}
assert.ok(maxRigidDistanceError < 0.00001, String(maxRigidDistanceError))
// Fresh scene: animation inspection must not leak a sampled pose into gameplay.
const gameAsset = await load(corrected.bytes)
const pose = JSON.parse(fs.readFileSync('public/models/mospeada/scott-animated-riding-pose.json'))
const rig = createCycloneRig(bike.scene, gameAsset.scene, pose, gameAsset.animations), flat = () => 0
const state = createBikeState({ x: 0, z: 0, yaw: 0 }, rig.metrics, flat), results = []
for (const name of ['idle', 'riding', 'wheelie', 'on-foot', 'walking', 'running', 'crouch', 'fist', 'remount']) {
  if (name === 'riding') { state.speed = 18; state.parked = false }
  if (name === 'on-foot') { state.speed = 0; state.wheelieAngle = state.wheelieVelocity = 0; state.frontWheelieLifted = false; state.frontGrounded = true; requestRiderToggle(state) }
  if (name === 'fist') state.fist = true
  if (name === 'remount') { state.pedestrian.x = state.x + 1.1; state.pedestrian.z = state.z; requestRiderToggle(state) }
  const input = name === 'wheelie' ? { wheelie: true } : ['walking', 'running'].includes(name) ? { walkForward: 1, run: name === 'running' } : { crouch: name === 'crouch' }
  for (let i = 0; i < 180; i++) { advanceBike(state, input, 1 / 120, rig.metrics, flat); rig.update(state, flat, bikeConfig) }
  assert.ok([...rig.bones.values()].every(b => [...b.position, ...b.quaternion].every(Number.isFinite)))
  const hands = rig.arms.map(a => a.error), legs = rig.legs.map(a => state.dismountBlend ? a.onFootError : a.error)
  if (!state.dismountBlend) assert.ok(hands.every(error => error < 0.025), name + ' hands')
  assert.ok(legs.every(error => error < 0.025), name + ' feet: ' + legs)
  results.push({ name, mode: state.riderMode, hands, legs })
}
const validation = { originalUnchanged: true, allClipsPreserved: true, untouchedGeometryPreserved: true, outsideTextureMaskChanges: 0, rigidRegions: rigid.length, maxRigidDistanceError, poses: results, drivingSeed: { clip: 'air_squat', time: rig.animations.crouchTime, torsoLeanRadians: rig.animations.drivingLean }, unresolvedInterfaceTriangles: report.unresolvedTextureInterfaces.length }
fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(validation, null, 2) + '\n')
console.log(JSON.stringify(validation, null, 2))
