import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { AnimationMixer, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { readGlb, accessorData } from './glb-data.mjs'

const source = 'assets/scott-bernard-animated.glb', g = readGlb(source), d = g.doc
globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const asset = await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset, g.bytes.byteOffset + g.bytes.length), '')
const bones = new Map(); asset.scene.traverse(n => { if (n.isBone) bones.set(n.name.replace(/^mixamorig[:_]?/, ''), n) })
const clips = []
for (const clip of asset.animations) {
  const mixer = new AnimationMixer(asset.scene), action = mixer.clipAction(clip).play()
  const bounds = { hipMin: [Infinity, Infinity, Infinity], hipMax: [-Infinity, -Infinity, -Infinity] }, samples = []
  let maxBoneOffsetVariation = 0
  const restPositions = new Map([...bones].map(([name, bone]) => [name, bone.position.clone()]))
  for (let frame = 0; frame <= 60; frame++) {
    mixer.setTime(Math.min(clip.duration - 1e-5, clip.duration * frame / 60)); asset.scene.updateMatrixWorld(true)
    const hip = bones.get('Hips').getWorldPosition(new Vector3()).toArray()
    hip.forEach((n, i) => { bounds.hipMin[i] = Math.min(bounds.hipMin[i], n); bounds.hipMax[i] = Math.max(bounds.hipMax[i], n) })
    for (const [name, bone] of bones) if (name !== 'Hips') maxBoneOffsetVariation = Math.max(maxBoneOffsetVariation, bone.position.distanceTo(restPositions.get(name)) * 0.01)
    if (frame % 15 === 0) samples.push({ time: clip.duration * frame / 60, hip, spine: bones.get('Spine').getWorldQuaternion(new Quaternion()).toArray(), head: bones.get('Head').getWorldQuaternion(new Quaternion()).toArray() })
  }
  clips.push({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length, skeleton: d.skins[0].name, targetBones: 24, missingBindings: clip.tracks.filter(t => ![...bones.values()].some(b => t.name.startsWith(b.name + '.'))).map(t => t.name), ...bounds, rootDisplacement: bounds.hipMax.map((v, i) => v - bounds.hipMin[i]), maxNonHipJointTranslationMetres: maxBoneOffsetVariation, samples })
  action.stop(); mixer.uncacheRoot(asset.scene)
}
const p = d.meshes[0].primitives[0], weights = accessorData(g, p.attributes.WEIGHTS_0).values
const report = { source, sha256: createHash('sha256').update(g.bytes).digest('hex'), vertices: d.accessors[p.attributes.POSITION].count, triangles: d.accessors[p.indices].count / 3, material: d.materials, images: d.images.map(i => i.name), bones: [...bones.keys()], fingerBones: [...bones.keys()].filter(n => /Thumb|Index|Middle|Ring|Pinky/.test(n)), mixedWeightVertices: weights.filter(row => row.filter(w => w > 0.001).length > 1).length, clips }
fs.writeFileSync('artifacts/scott-animated/inspection.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, material: report.material.length, clips: clips.map(({ samples, ...c }) => c) }, null, 2))
