import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { AnimationMixer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

test('Scott preview uses a byte-identical copy of the untouched Meshy original', () => {
  const source = fs.readFileSync('assets/scott-bernard-animated.glb'), runtime = fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb')
  assert.equal(createHash('sha256').update(source).digest('hex'), 'c9f73c39b30761049dbd854d21cae6d8b2bc233547d59a2ec2170fc53a561961')
  assert.ok(source.equals(runtime))
  const doc = JSON.parse(runtime.toString('utf8', 20, 20 + runtime.readUInt32LE(12)))
  assert.equal(doc.meshes.length, 1); assert.equal(doc.skins.length, 1); assert.equal(doc.skins[0].joints.length, 24)
  assert.equal(doc.animations.length, 16)
  assert.ok(['Walking', 'Running', 'air_squat'].every(name => doc.animations.some(clip => clip.name === name)))
})

test('all original clips bind directly to the original cloned skeleton without touching source bones or weights', async () => {
  globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
  const bytes = fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb')
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
  const original = new Map(); let sourceSkin
  source.scene.traverse(n => { if (n.isBone) original.set(n.name, { node: n, position: n.position.toArray(), quaternion: n.quaternion.toArray() }); if (n.isSkinnedMesh) sourceSkin = n })
  const active = clone(source.scene), bones = new Map(); let skin
  active.traverse(n => { if (n.isBone) bones.set(n.name, n); if (n.isSkinnedMesh) skin = n })
  assert.equal(skin.geometry, sourceSkin.geometry)
  assert.equal(skin.geometry.attributes.skinWeight, sourceSkin.geometry.attributes.skinWeight)
  assert.equal(skin.skeleton.bones.length, 24)
  assert.equal(skin.geometry.attributes.position.count, 15429)
  const mixer = new AnimationMixer(active)
  for (const clip of source.animations) {
    assert.equal(clip.tracks.length, 48)
    const action = mixer.clipAction(clip).play(); action.time = clip.duration * 0.45; mixer.update(0)
    assert.equal(action.getClip(), clip)
    for (const bone of bones.values()) assert.ok([...bone.position, ...bone.quaternion].every(Number.isFinite))
    mixer.stopAllAction()
  }
  for (const [name, data] of original) {
    assert.notEqual(bones.get(name), data.node)
    assert.deepEqual(data.node.position.toArray(), data.position)
    assert.deepEqual(data.node.quaternion.toArray(), data.quaternion)
  }
  mixer.uncacheRoot(active)
})
