import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { parseCycloneScottActions } from './cycloneScottActions.js'
import { createParkedCyclone, CYCLONE_PRESENTATION_SCALE } from './createParkedCyclone.js'

const data = JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
async function load(path) {
  globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
  const b = fs.readFileSync(path)
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '')
}

test('Cyclone retains the requested 7% increase; Scott and imported geometry retain their scale and shape', async () => {
  const source = await load('public/models/mospeada/cyclone-vr052f.glb')
  const original = createParkedCyclone(source.scene, { scale: 1 }), adjusted = createParkedCyclone(source.scene)
  const expected = .88 * 1.07
  assert.equal(data.bikeScale, CYCLONE_PRESENTATION_SCALE); assert.equal(data.bikeScale, expected)
  assert.ok(Math.abs(data.actorScale - 1.260759865) < 1e-8)
  for (const key of ['wheelbase', 'frontRadius', 'rearRadius', 'frontZ', 'rearZ']) assert.ok(Math.abs(adjusted.metrics[key] / original.metrics[key] - expected) < 1e-8)
  adjusted.surfaces.forEach((mesh, i) => { assert.equal(mesh.geometry, original.surfaces[i].geometry); assert.deepEqual(mesh.scale.toArray(), original.surfaces[i].scale.toArray()) })
  assert.deepEqual(adjusted.body.children[0].scale.toArray(), [expected, expected, expected])
  assert.ok(Math.abs(data.measuredTargets.seat.surface[1] - .7899849028555433 * 1.07) < 1e-5)
})

test('the corrected sequences preserve all original bone lengths, weights, bindings and exact riding endpoints', async () => {
  const source = await load('assets/scott-bernard-animated.glb'), active = clone(source.scene), bones = new Map()
  let originalSkin, skin
  source.scene.traverse(n => { if (n.isSkinnedMesh) originalSkin = n })
  active.traverse(n => { if (n.isBone) bones.set(n.name, n); if (n.isSkinnedMesh) skin = n })
  const offsets = new Map([...bones].map(([name, b]) => [name, { position: b.position.clone(), scale: b.scale.clone() }]))
  const clips = parseCycloneScottActions(data), mixer = new T.AnimationMixer(active)
  assert.equal(source.animations.length, 16); assert.equal(bones.size, 24); assert.equal(data.animations.length, 2)
  assert.equal(skin.geometry, originalSkin.geometry); assert.equal(skin.geometry.attributes.skinWeight, originalSkin.geometry.attributes.skinWeight)
  for (const clip of clips) {
    assert.ok(clip.validate())
    assert.equal(clip.tracks.length, 25)
    assert.ok(clip.tracks.every(t => t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position'))
    const a = mixer.clipAction(clip).setLoop(T.LoopOnce, 1).play(); a.clampWhenFinished = true
    for (let i = 0; i <= 60; i++) {
      a.paused = false; a.time = clip.duration * i / 60; mixer.update(0)
      for (const [name, b] of bones) {
        assert.ok([...b.quaternion, ...b.position].every(Number.isFinite))
        assert.ok(b.scale.distanceTo(offsets.get(name).scale) < 1e-10)
        if (!name.endsWith('Hips')) assert.ok(b.position.distanceTo(offsets.get(name).position) < 1e-10)
      }
    }
    mixer.stopAllAction()
  }
  const baseline = JSON.parse(fs.readFileSync('artifacts/scott-right-leg-roll/base-actions.json'))
  const riding = JSON.parse(fs.readFileSync('public/animations/scott-cyclone-riding-reference.json'))
  assert.deepEqual(data.ridingPose, riding.ridingPose)
  const allowed = new Set(data.rightLegCorrection.localBones.map(n => n + '.quaternion'))
  for (let i = 0; i < data.animations.length; i++) for (let j = 0; j < data.animations[i].tracks.length; j++) {
    const t = data.animations[i].tracks[j], original = baseline.animations[i].tracks[j]
    assert.deepEqual(t.times, original.times)
    assert.deepEqual(t.values.slice(0, t.type === 'vector' ? 3 : 4), original.values.slice(0, t.type === 'vector' ? 3 : 4))
    assert.deepEqual(t.values.slice(t.type === 'vector' ? -3 : -4), original.values.slice(t.type === 'vector' ? -3 : -4))
    if (!allowed.has(t.name)) assert.deepEqual(t, original, 'only right-leg local quaternion tracks may change')
  }
  for (const field of ['actorScale', 'actorOrigin', 'keyPoses', 'phases', 'measuredTargets']) assert.deepEqual(data[field], baseline[field])
  const roll = source.animations.find(c => c.name === 'Roll_Dodge_4')
  const report = JSON.parse(fs.readFileSync('artifacts/scott-right-leg-roll/patch-report.json'))
  assert.equal(report.rightLegIK, false); assert.equal(report.collisionAvoidance, false)
  assert.equal(report.changedTracks.length, 8); assert.equal(report.unchangedTracks.length, 42)
  for (const name of allowed) {
    const interpolant = roll.tracks.find(t => t.name === name).createInterpolant(new Float32Array(4)), track = data.animations[0].tracks.find(t => t.name === name)
    for (const frame of report.samples.filter(f => f.section === 'original-fold-only')) {
      const index = track.times.indexOf(frame.time), expected = [...interpolant.evaluate(frame.sourceTime)]
      assert.deepEqual(track.values.slice(index * 4, index * 4 + 4), expected, 'the crossing is the actual original local Meshy pose, with no IK overlay')
    }
    for (let i = 1; i < track.times.length; i++) {
      const a = new T.Quaternion().fromArray(track.values, (i - 1) * 4).normalize(), b = new T.Quaternion().fromArray(track.values, i * 4).normalize()
      assert.ok(a.angleTo(b) < T.MathUtils.degToRad(8), 'no right-leg rotation discontinuities between adjacent frames')
    }
  }
})
