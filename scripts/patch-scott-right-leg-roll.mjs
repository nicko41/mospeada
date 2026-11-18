import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Surgical animation edit: copy four LOCAL quaternion tracks from Meshy.
// No IK, world-space rotations, pelvis adjustment or collision avoidance.
const directory = 'artifacts/scott-right-leg-roll'
const baselinePath = `${directory}/base-actions.json`
if (!fs.existsSync(baselinePath)) throw Error('The frozen choreography baseline is required')
const base = JSON.parse(fs.readFileSync(baselinePath)), data = structuredClone(base)
const sourceBytes = fs.readFileSync('assets/scott-bernard-animated.glb')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
if (hash(sourceBytes) !== base.sourceSha256) throw Error('Original Scott GLB differs from the baseline')
globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const source = await new GLTFLoader().parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.length), '')
const roll = source.animations.find(c => c.name.toLowerCase() === 'roll_dodge_4')
if (!roll) throw Error('Original Roll_Dodge_4 clip not found')
const boneNames = ['mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase']
const sourceTracks = new Map(boneNames.map(n => [n, roll.tracks.find(t => t.name === n + '.quaternion')]))
if ([...sourceTracks.values()].some(t => !t)) throw Error('Missing original right-leg bindings')
const interpolants = new Map([...sourceTracks].map(([n, t]) => [n, t.createInterpolant(new Float32Array(4))]))
const smooth = x => { x = T.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const phase = (time, a, b) => smooth((time - a) / (b - a))
const sourceQ = (bone, time) => new T.Quaternion().fromArray(interpolants.get(bone).evaluate(time))
const support = base.phases.support, raised = base.phases.lift, crossed = base.phases.cross, lowered = base.phases.seated, end = base.phases.end
const mount = data.animations.find(c => c.name === 'Cyclone_Mount'), baseMount = T.AnimationClip.parse(base.animations.find(c => c.name === 'Cyclone_Mount'))
const originalInterpolants = new Map(baseMount.tracks.filter(t => boneNames.includes(t.name.split('.')[0])).map(t => [t.name.split('.')[0], t.createInterpolant(new Float32Array(4))]))
const riding = new Map(data.ridingPose.boneNames.map((name, i) => [name, new T.Quaternion().fromArray(data.ridingPose.quaternions[i])]))
const samples = []
for (const track of mount.tracks) {
  const bone = track.name.split('.')[0]
  if (!boneNames.includes(bone)) continue
  const planted = new T.Quaternion().fromArray(originalInterpolants.get(bone).evaluate(support))
  for (let i = 0; i < track.times.length; i++) {
    const time = track.times[i]
    if (time <= support || time >= end) continue
    let q, sourceTime = null, section
    if (time < raised) {
      sourceTime = T.MathUtils.lerp(1.95, 2.18, phase(time, support, raised))
      q = planted.clone().slerp(sourceQ(bone, sourceTime), phase(time, support, raised))
      section = 'planted-to-original-fold'
    } else if (time <= crossed) {
      sourceTime = T.MathUtils.lerp(2.18, 2.22, phase(time, raised, crossed))
      q = sourceQ(bone, sourceTime)
      section = 'original-fold-only'
    } else if (time < lowered) {
      const unfold = phase(time, crossed, lowered)
      q = sourceQ(bone, 2.22).slerp(sourceQ(bone, .20), unfold)
      section = 'original-fold-to-original-open'
    } else {
      q = sourceQ(bone, .20).slerp(riding.get(bone), phase(time, lowered, end))
      section = 'original-open-to-riding'
    }
    const values = new Float32Array(q.toArray())
    for (let j = 0; j < 4; j++) track.values[i * 4 + j] = values[j]
    if (bone === boneNames[0]) samples.push({ time, section, sourceTime })
  }
}
// Dismount keeps its own original timing and all its other tracks. Only map
// the corrected right-leg samples back to the corresponding inverse time.
const mountTracks = new Map(T.AnimationClip.parse(mount).tracks.map(t => [t.name, t]))
const dismount = data.animations.find(c => c.name === 'Cyclone_Dismount')
for (const track of dismount.tracks) {
  if (!boneNames.includes(track.name.split('.')[0])) continue
  const interpolant = mountTracks.get(track.name).createInterpolant(new Float32Array(4))
  for (let i = 0; i < track.times.length; i++) {
    const time = dismount.duration - track.times[i]
    // Copy the original exact endpoints rather than resampling float times.
    if (i === 0 || i === track.times.length - 1 || time <= support) continue
    const values = interpolant.evaluate(time)
    for (let j = 0; j < 4; j++) track.values[i * 4 + j] = values[j]
  }
}
const unchangedTracks = [], changedTracks = []
for (let c = 0; c < data.animations.length; c++) for (let t = 0; t < data.animations[c].tracks.length; t++) {
  const after = data.animations[c].tracks[t], before = base.animations[c].tracks[t]
  const identical = JSON.stringify(before) === JSON.stringify(after)
  if (!boneNames.includes(after.name.split('.')[0]) && !identical) throw Error('Non-leg track changed: ' + after.name)
  ;(identical ? unchangedTracks : changedTracks).push(`${data.animations[c].name}:${after.name}`)
}
data.rightLegCorrection = { sourceClip: roll.name, sourceDuration: roll.duration, foldInterval: [1.95, 2.22], openFrame: .20, localBones: boneNames, support, raised, crossed, lowered, end, rightLegIK: false, collisionAvoidance: false, baselineSha256: hash(fs.readFileSync(baselinePath)) }
data.sourceSamples.rightLeg = { clip: roll.name, foldInterval: [1.95, 2.22], openFrame: .20 }
delete data.sourceSamples.ankleFlexion
if (JSON.stringify(data.ridingPose) !== JSON.stringify(base.ridingPose)) throw Error('Riding pose changed')
fs.writeFileSync('public/animations/scott-cyclone-actions.json', JSON.stringify(data) + '\n')
const report = { ...data.rightLegCorrection, sourceSha256: hash(sourceBytes), changedTracks, unchangedTracks, ridingPoseUnchanged: true, choreographyUnchanged: true, samples }
fs.writeFileSync(`${directory}/patch-report.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, samples: undefined, unchangedTracks: unchangedTracks.length }, null, 2))
