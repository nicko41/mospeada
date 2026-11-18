import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { AnimationMixer, Matrix4, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { readGlb, accessorData } from './glb-data.mjs'
import { applyTestPose, copyDrivingPose } from '../src/rig-lab/testPoses.js'
import { createCycloneRig } from '../src/vehicle/cycloneRig.js'
import { createBikeState } from '../src/vehicle/bikePhysics.js'
import { bikeConfig } from '../src/vehicle/bikeConfig.js'

const directory = 'artifacts/rig-hybrid', regions = JSON.parse(fs.readFileSync(`${directory}/regions.json`, 'utf8'))
const source = readGlb(regions.source), hybrid = readGlb(regions.output)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(source.bytes), 'bb96f71e8c0d2758f2d016a282d898e0218cbaa402ac3315209a2d5b1bf7373b', 'Original GLB must remain untouched')
assert.deepEqual(source.doc.materials, hybrid.doc.materials)
assert.deepEqual(source.doc.images, hybrid.doc.images)
assert.deepEqual(source.doc.textures, hybrid.doc.textures)
assert.deepEqual(source.doc.skins, hybrid.doc.skins)
assert.deepEqual(source.doc.animations, hybrid.doc.animations)
assert.ok(source.bin.equals(hybrid.bin.subarray(0, source.bin.length)), 'All original binary payloads must survive byte for byte')
for (let i = 0; i < 24; i++) assert.deepEqual(source.doc.nodes[i], hybrid.doc.nodes[i], 'Bone hierarchy and rest transforms must remain intact')
for (const view of hybrid.doc.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= hybrid.doc.buffers[0].byteLength)
const primitive = source.doc.meshes[0].primitives[0]
const sourceAttributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessorData(source, index).values]))
const sourceIndices = accessorData(source, primitive.indices).values.flat(), seen = new Set()
const armorVertices = new Set(), blendedArmorVertices = new Set()
for (let meshIndex = 0; meshIndex < regions.regions.length; meshIndex++) {
  const region = regions.regions[meshIndex], p = hybrid.doc.meshes[meshIndex].primitives[0]
  const attributes = Object.fromEntries(Object.entries(p.attributes).map(([name, index]) => [name, accessorData(hybrid, index).values]))
  const jointIndex = region.rigid ? hybrid.doc.skins[0].joints.findIndex(i => hybrid.doc.nodes[i].name.endsWith(':' + region.ownerBone) || hybrid.doc.nodes[i].name === region.ownerBone) : -1
  for (let vertex = 0; vertex < region.sourceVertices.length; vertex++) {
    const original = region.sourceVertices[vertex]
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) assert.deepEqual(attributes[name][vertex], sourceAttributes[name][original], name + ' must be preserved')
    if (region.rigid) {
      assert.deepEqual(attributes.WEIGHTS_0[vertex], [1, 0, 0, 0]); assert.deepEqual(attributes.JOINTS_0[vertex], [jointIndex, 0, 0, 0])
      armorVertices.add(original); if (sourceAttributes.WEIGHTS_0[original].filter(w => w > 0.001).length > 1) blendedArmorVertices.add(original)
    } else {
      assert.deepEqual(attributes.WEIGHTS_0[vertex], sourceAttributes.WEIGHTS_0[original])
      assert.deepEqual(attributes.JOINTS_0[vertex], sourceAttributes.JOINTS_0[original])
    }
  }
  const indices = accessorData(hybrid, p.indices).values.flat()
  region.sourceTriangles.forEach((triangle, i) => {
    assert.ok(!seen.has(triangle)); seen.add(triangle)
    for (let k = 0; k < 3; k++) assert.equal(region.sourceVertices[indices[i * 3 + k]], sourceIndices[triangle * 3 + k], 'Original triangle winding and connectivity must survive')
  })
}
assert.equal(seen.size, sourceIndices.length / 3)
globalThis.self = globalThis
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
async function load(bytes) { return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '') }
const original = await load(source.bytes), corrected = await load(hybrid.bytes)
let originalSkin; original.scene.traverse(n => { if (n.isSkinnedMesh) originalSkin = n })
original.scene.updateMatrixWorld(true)
const points = skin => Array.from({ length: skin.geometry.attributes.position.count }, (_, i) => skin.localToWorld(skin.getVertexPosition(i, new Vector3())))
const rest = points(originalSkin)
let maxBindIdentityError = 0, maxWeightSumError = 0, invalidWeightVertices = 0
for (let i = 0; i < originalSkin.skeleton.bones.length; i++) {
  const matrix = originalSkin.skeleton.bones[i].matrixWorld.clone().multiply(originalSkin.skeleton.boneInverses[i])
  maxBindIdentityError = Math.max(maxBindIdentityError, ...matrix.elements.map((v, k) => Math.abs(v - new Matrix4().elements[k])))
}
for (const weights of sourceAttributes.WEIGHTS_0) {
  maxWeightSumError = Math.max(maxWeightSumError, Math.abs(weights.reduce((sum, w) => sum + w, 0) - 1))
  if (weights.some(w => !Number.isFinite(w) || w < 0 || w > 1)) invalidWeightVertices++
}
assert.equal(invalidWeightVertices, 0)
assert.ok(maxWeightSumError < 1e-6)
assert.ok(sourceAttributes.JOINTS_0.every(row => row.every(index => Number.isInteger(index) && index >= 0 && index < source.doc.skins[0].joints.length)), 'Original joint indices must be valid')
const bikeBytes = fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'), bike = await load(bikeBytes)
const pose = JSON.parse(fs.readFileSync('public/models/mospeada/scott-riding-pose.json', 'utf8'))
const ridingRig = createCycloneRig(bike.scene, original.scene, pose)
const state = createBikeState({ x: 0, z: 0, yaw: 0 }, ridingRig.metrics, () => 0); state.idleBlend = 0; ridingRig.update(state, () => 0, bikeConfig)
const tests = [], configurations = [['rest'], ['arms'], ['shoulders'], ['knees'], ['seated'], ['driving'], ...['Running', 'Walking'].flatMap(clip => [0, 0.25, 0.5, 0.75].map(time => [clip, time]))]
let maxRestError = 0
for (const [name, time] of configurations) {
  const active = clone(corrected.scene), baseline = clone(original.scene)
  for (const root of [active, baseline]) {
    applyTestPose(root, name)
    if (name === 'driving') copyDrivingPose(root, ridingRig)
    if (time !== undefined) { const mixer = new AnimationMixer(root); mixer.clipAction(original.animations.find(a => a.name === name)).play(); mixer.update(time) }
    root.updateMatrixWorld(true)
  }
  let originalMesh; baseline.traverse(n => { if (n.isSkinnedMesh) originalMesh = n })
  const originalPoints = points(originalMesh), scale = active.getWorldScale(new Vector3()).x
  const parts = []
  active.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return
    const region = regions.regions.find(r => r.name === mesh.name), transformed = points(mesh)
    let maxRigidDistanceError = 0, maxOriginalRelativeEdgeChange = 0, maxFlexibleDifference = 0
    const index = mesh.geometry.index, vertices = region.sourceVertices
    if (name === 'rest') transformed.forEach((p, i) => { maxRestError = Math.max(maxRestError, p.distanceTo(rest[vertices[i]])) })
    if (region.rigid) {
      // Check every original triangle edge and non-neighbor pairs spanning each plate.
      const compare = (a, b) => {
        const length = rest[vertices[a]].distanceTo(rest[vertices[b]]) * scale
        if (length < 1e-6) return
        maxRigidDistanceError = Math.max(maxRigidDistanceError, Math.abs(transformed[a].distanceTo(transformed[b]) - length))
        maxOriginalRelativeEdgeChange = Math.max(maxOriginalRelativeEdgeChange, Math.abs(originalPoints[vertices[a]].distanceTo(originalPoints[vertices[b]]) / length - 1))
      }
      for (let i = 0; i < index.count; i += 3) for (let k = 0; k < 3; k++) compare(index.getX(i + k), index.getX(i + (k + 1) % 3))
      for (let i = 0; i < transformed.length; i++) compare(i, (i * 197 + 67) % transformed.length)
      assert.ok(maxRigidDistanceError < 2e-6, `Rigid part changed shape: ${name}/${region.name}: ${maxRigidDistanceError}`)
    } else {
      transformed.forEach((p, i) => { maxFlexibleDifference = Math.max(maxFlexibleDifference, p.distanceTo(originalPoints[vertices[i]])) })
      assert.ok(maxFlexibleDifference < 2e-6, 'Flexible and review regions must retain the original skinning')
    }
    parts.push({ name: region.name, rigid: region.rigid, maxRigidDistanceErrorMetres: maxRigidDistanceError, maxOriginalRelativeDistanceChange: maxOriginalRelativeEdgeChange, maxFlexibleDifferenceMetres: maxFlexibleDifference })
  })
  tests.push({ pose: name, animationTime: time, parts })
}
assert.ok(maxRestError < 2e-6)
const report = {
  source: regions.source, output: regions.output, sourceSha256: hash(source.bytes), outputSha256: hash(hybrid.bytes),
  sourceUntouched: true, originalTrianglesPreserved: seen.size, materialsAndTexturePayloadsIdentical: true, skeletonAndBindMatricesIdentical: true, originalAnimationDataIdentical: true,
  rigidRegions: regions.regions.filter(r => r.rigid).length, flexibleRegions: regions.regions.filter(r => !r.rigid).map(r => r.name),
  originalArmorBlendedVertices: blendedArmorVertices.size, originalArmorVertices: armorVertices.size, maxBindIdentityError, maxWeightSumError, invalidWeightVertices,
  maxRestPoseDifferenceMetres: maxRestError, maxRigidDistanceErrorMetres: Math.max(...tests.flatMap(t => t.parts.map(p => p.maxRigidDistanceErrorMetres))),
  mixedTriangleInterfacesNeedingReview: regions.mixedTextureInterfaces.length,
  limitations: ['Painted armor/cloth boundaries cross 126 existing triangles. These triangles keep their original geometry and skinning in a separately named review mesh.', 'Rigid shells can expose original open seams or overlap under deep bends; no filler geometry or altered proportions were added.', 'The current game pose is reproduced only in the isolated viewer. No driving solver or runtime asset reference was changed.'], tests,
}
fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, tests: report.tests.map(t => ({ pose: t.pose, animationTime: t.animationTime })) }, null, 2))
