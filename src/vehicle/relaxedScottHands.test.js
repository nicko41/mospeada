import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { AnimationMixer, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createRelaxedScottHands } from './relaxedScottHands.js'

test('relaxed hand variant changes only gloves and preserves original skinning and all 16 clips', async () => {
  globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
  const bytes = fs.readFileSync('assets/scott-bernard-animated.glb')
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
  const model = clone(asset.scene); let mesh
  model.traverse(node => { if (node.isSkinnedMesh) mesh = node })
  const source = mesh.geometry, skeleton = mesh.skeleton, bones = skeleton.bones.slice()
  const clipsBefore = JSON.stringify(asset.animations.map(c => c.toJSON()))
  const hand = createRelaxedScottHands(mesh), delta = mesh.geometry.morphAttributes.position[0], affected = new Set(hand.affected)
  assert.ok(hand.sides.every(side => side.count > 300 && side.count < 450))
  assert.notEqual(mesh.geometry, source)
  for (const key of Object.keys(source.attributes)) assert.equal(mesh.geometry.attributes[key], source.attributes[key])
  assert.equal(mesh.geometry.index, source.index)
  assert.equal(mesh.skeleton, skeleton); assert.deepEqual(mesh.skeleton.bones, bones)
  for (let i = 0; i < delta.count; i++) {
    const d = new Vector3().fromBufferAttribute(delta, i)
    assert.ok(Number.isFinite(d.length()) && d.length() < .10)
    if (!affected.has(i)) assert.equal(d.lengthSq(), 0, 'No body/armour/forearm change')
  }
  hand.update('onFoot', .5); assert.ok(mesh.morphTargetInfluences[0] > .99)
  for (const mode of ['mounted', 'stopping', 'mounting', 'dismounting']) {
    hand.update(mode, .1); assert.equal(mesh.morphTargetInfluences[0], 0, mode + ' retains approved hands exactly')
  }
  const mixer = new AnimationMixer(model), p = new Vector3(), q = new Vector3()
  for (const clip of asset.animations) {
    mixer.clipAction(clip).play(); mixer.setTime(clip.duration * .45); model.updateMatrixWorld(true); skeleton.update()
    const originalPositions = new Map()
    mesh.morphTargetInfluences[0] = 0
    for (let i = 0; i < source.attributes.position.count; i += 17) originalPositions.set(i, mesh.getVertexPosition(i, new Vector3()).clone())
    hand.update('onFoot', 1)
    for (const [i, original] of originalPositions) {
      mesh.getVertexPosition(i, p)
      assert.ok([...p].every(Number.isFinite), clip.name)
      if (!affected.has(i)) assert.ok(p.distanceTo(original) < 1e-8, clip.name + ' outside gloves unchanged')
    }
    hand.update('mounting', .1)
    for (const [i, original] of originalPositions) assert.ok(mesh.getVertexPosition(i, q).distanceTo(original) < 1e-8)
    mixer.stopAllAction()
  }
  assert.equal(JSON.stringify(asset.animations.map(c => c.toJSON())), clipsBefore)
  assert.equal(Object.keys(source.morphAttributes).length, 0)
  hand.dispose(); assert.equal(mesh.geometry, source)
  hand.attach(); assert.equal(mesh.geometry, hand.geometry, 'Effect replay reinstalls the variant in React StrictMode')
  hand.update('mounted', .1); assert.deepEqual(mesh.morphTargetInfluences, [0, 1])
  hand.dispose()
})
