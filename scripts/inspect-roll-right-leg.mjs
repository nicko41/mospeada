import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createParkedCyclone } from '../src/vehicle/createParkedCyclone.js'
globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
async function load(file) { const b = fs.readFileSync(file); return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '') }
const source = await load('assets/scott-bernard-animated.glb'), bike = createParkedCyclone((await load('public/models/mospeada/cyclone-vr052f.glb')).scene)
const base = JSON.parse(fs.readFileSync('artifacts/scott-right-leg-roll/base-actions.json'))
const target = clone(source.scene), group = new T.Group(); group.position.fromArray(base.actorOrigin); group.scale.setScalar(base.actorScale); group.add(target)
const bones = new Map(); let skin
target.traverse(n => { if (n.isBone) bones.set(n.name.replace('mixamorig', ''), n); if (n.isSkinnedMesh) skin = n })
const probe = clone(source.scene), probeMixer = new T.AnimationMixer(probe), targetMixer = new T.AnimationMixer(target), pb = new Map()
probe.traverse(n => { if (n.isBone) pb.set(n.name.replace('mixamorig', ''), n) })
const roll = source.animations.find(c => c.name.toLowerCase() === 'roll_dodge_4'), action = probeMixer.clipAction(roll).play()
const poseAction = targetMixer.clipAction(T.AnimationClip.parse(base.animations[0])).play()
const ray = new T.Raycaster(), seatParts = bike.surfaces.filter(m => ['rear_sit + rear_sit', 'rear1'].includes(m.userData.sourcePiece))
const ids = [], si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight
const footIds = [skin.skeleton.bones.indexOf(bones.get('RightFoot')), skin.skeleton.bones.indexOf(bones.get('RightToeBase'))]
for (let i = 0; i < si.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (footIds.includes(si.getComponent(i, k))) w += sw.getComponent(i, k); if (w > .7) ids.push(i) }
const tracks = ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'], samples = []
for (let i = 0; i <= 188; i++) {
  const t = Math.min(i / 60, roll.duration - 1e-6); action.time = t; probeMixer.update(0)
  poseAction.time = 1.42; targetMixer.update(0)
  tracks.forEach(n => bones.get(n).quaternion.copy(pb.get(n).quaternion))
  group.updateMatrixWorld(true)
  const p = n => bones.get(n).getWorldPosition(new T.Vector3()), hip = p('RightUpLeg'), knee = p('RightLeg'), foot = p('RightFoot')
  let clearance = Infinity, minimum = Infinity
  for (const id of ids) {
    const q = skin.localToWorld(skin.getVertexPosition(id, new T.Vector3())); minimum = Math.min(minimum, q.y)
    ray.set(new T.Vector3(q.x, 4, q.z), new T.Vector3(0, -1, 0)); const hit = ray.intersectObjects(seatParts, false)[0]
    if (hit) clearance = Math.min(clearance, q.y - hit.point.y)
  }
  samples.push({ time: t, flex: 180 - T.MathUtils.radToDeg(hip.clone().sub(knee).angleTo(foot.clone().sub(knee))), hip: hip.toArray(), knee: knee.toArray(), foot: foot.toArray(), minFootY: minimum, clearance: Number.isFinite(clearance) ? clearance : null, quaternions: Object.fromEntries(tracks.map(n => [n, pb.get(n).quaternion.toArray()])) })
}
fs.writeFileSync('artifacts/scott-right-leg-roll/source-samples.json', JSON.stringify({ clip: roll.name, duration: roll.duration, tracks, samples }, null, 2) + '\n')
console.log(JSON.stringify({ clip: roll.name, duration: roll.duration, samples: samples.filter((s, i) => i % 10 === 0).map(({ quaternions, ...s }) => s) }, null, 2))
