import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { Matrix4, Vector3, Quaternion } from 'three'
import { readGlb, accessorData, writeGlb } from './glb-data.mjs'
import { buildArticulatedHands } from './scott-hands.mjs'
import { retargetRidingPose } from './retarget-riding-pose.mjs'

// Rejected by the user: do not regenerate structural edits.
throw new Error('Generador desactivado: usar el Scott original sin rigidizar, separar mallas ni reconstruir manos.')

const source = 'assets/scott-bernard-animated.glb', output = 'assets/scott-bernard-animated-corrected.glb', directory = 'artifacts/scott-animated'
fs.mkdirSync(directory, { recursive: true })
const sharp = createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const glb = readGlb(source), doc = structuredClone(glb.doc), primitive = doc.meshes[0].primitives[0]
const data = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessorData(glb, index)]))
const positions = data.POSITION.values, uvs = data.TEXCOORD_0.values, indices = accessorData(glb, primitive.indices).values.flat()
const regional = JSON.parse(fs.readFileSync('artifacts/rig-hybrid/regions.json'))
// Reuse reviewed source-triangle regions only if the geometry really matches.
const reference = readGlb('assets/scott-bernard-gear.glb')
for (const name of ['POSITION', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) if (JSON.stringify(data[name].values) !== JSON.stringify(accessorData(reference, reference.doc.meshes[0].primitives[0].attributes[name]).values)) throw Error('Source geometry differs; regional mapping needs a new review: ' + name)

// The previous generic horizontal thigh/knee split crossed the lower thigh
// plate. Use the authored influence transition and anterior kneecap location
// instead, keeping the original triangles and all uncertain painted interfaces.
let reassignedLegTriangles = 0
const sourceJointNames = glb.doc.skins[0].joints.map(n => glb.doc.nodes[n].name.replace(/^mixamorig[:_]?/, ''))
const legRegions = regional.regions.filter(r => /thigh|kneecap|shin/.test(r.name)), redistributed = new Map(legRegions.map(r => [r.name, []]))
for (const region of legRegions) for (const t of region.sourceTriangles) {
  const vs = indices.slice(t * 3, t * 3 + 3), center = [0, 1, 2].map(k => vs.reduce((n, i) => n + positions[i][k], 0) / 3)
  const side = center[0] > 0 ? 'Left' : 'Right', vote = { UpLeg: 0, Leg: 0 }
  for (const v of vs) for (let k = 0; k < 4; k++) for (const bone of ['UpLeg', 'Leg']) if (sourceJointNames[data.JOINTS_0.values[v][k]] === side + bone) vote[bone] += data.WEIGHTS_0.values[v][k]
  let thigh = vote.UpLeg > vote.Leg * 1.15
  if (center[1] > 0.74 || center[1] > 0.63 && center[2] < 0.05) thigh = true
  if (center[1] < 0.54 || center[1] < 0.68 && center[2] > 0.065) thigh = false
  const label = `Rigid_${side}_${thigh ? 'thigh' : center[1] > 0.49 ? 'kneecap' : 'shin'}`
  if (label !== region.name) reassignedLegTriangles++
  redistributed.get(label).push(t)
}
for (const region of legRegions) {
  region.sourceTriangles = redistributed.get(region.name); region.sourceVertices = [...new Set(region.sourceTriangles.flatMap(t => indices.slice(t * 3, t * 3 + 3)))]; region.triangles = region.sourceTriangles.length; region.vertices = region.sourceVertices.length
}

const chunks = [glb.bin]; let length = glb.bin.length
function view(buffer, target) {
  const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad }
  const index = doc.bufferViews.length; doc.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, ...(target ? { target } : {}) })
  chunks.push(buffer); length += buffer.length; return index
}
function append(buffer, descriptor, target = 34962) {
  const bufferView = view(buffer, target), index = doc.accessors.length
  doc.accessors.push({ ...descriptor, bufferView, byteOffset: 0 }); return index
}
function array(values, components, type = 5126, target = 34962) {
  const size = type === 5123 ? 2 : 4, b = Buffer.alloc(values.length * size)
  values.forEach((v, i) => type === 5126 ? b.writeFloatLE(v, i * size) : type === 5123 ? b.writeUInt16LE(v, i * size) : b.writeUInt32LE(v, i * size))
  const descriptor = { componentType: type, count: values.length / components, type: { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4', 16: 'MAT4' }[components] }
  if (components === 3 && target === 34962) {
    descriptor.min = [0, 1, 2].map(k => Math.min(...values.filter((_, i) => i % 3 === k)))
    descriptor.max = [0, 1, 2].map(k => Math.max(...values.filter((_, i) => i % 3 === k)))
  }
  return append(b, descriptor, target)
}

// Exported node defaults contain a Meshy action frame, but the inverse binds
// still encode the original T-pose. Restore that exact rest frame in the copy.
const bindMatrices = accessorData(glb, doc.skins[0].inverseBindMatrices).values
const bindWorld = new Map(doc.skins[0].joints.map((node, i) => [node, new Matrix4().fromArray(bindMatrices[i]).invert()]))
const parents = new Map(); doc.nodes.forEach((n, i) => n.children?.forEach(child => parents.set(child, i)))
function world(index) {
  if (bindWorld.has(index)) return bindWorld.get(index)
  const node = doc.nodes[index], local = new Matrix4().compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]))
  return parents.has(index) ? world(parents.get(index)).clone().multiply(local) : local
}
const restored = []
for (const node of doc.skins[0].joints) {
  const local = world(parents.get(node)).clone().invert().multiply(bindWorld.get(node)), p = new Vector3(), q = new Quaternion(), s = new Vector3()
  local.decompose(p, q, s)
  const before = new Quaternion().fromArray(doc.nodes[node].rotation || [0, 0, 0, 1])
  if (before.angleTo(q) > 0.001) restored.push({ bone: doc.nodes[node].name, degrees: before.angleTo(q) * 180 / Math.PI })
  Object.assign(doc.nodes[node], { translation: p.toArray(), rotation: q.toArray(), scale: s.toArray() })
}

// Rasterize ownership of shoulder triangles: only owned texels inside four
// emblem fragments may change, even though every body part shares this atlas.
const W = 2048, H = 2048, shoulder = new Uint8Array(W * H)
for (const region of regional.regions.filter(r => /shoulder/.test(r.name))) for (const face of region.sourceTriangles) {
  const p = indices.slice(face * 3, face * 3 + 3).map(i => uvs[i].map(v => v * W))
  const minX = Math.max(0, Math.floor(Math.min(...p.map(v => v[0])))), maxX = Math.min(W - 1, Math.ceil(Math.max(...p.map(v => v[0]))))
  const minY = Math.max(0, Math.floor(Math.min(...p.map(v => v[1])))), maxY = Math.min(H - 1, Math.ceil(Math.max(...p.map(v => v[1]))))
  const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])
  if (Math.abs(area) < 1e-9) continue
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const cross = (a, b) => ((b[0] - a[0]) * (y + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0])) / area
    if ([cross(p[0], p[1]), cross(p[1], p[2]), cross(p[2], p[0])].every(v => v >= -0.001)) shoulder[y * W + x] = 1
  }
}
const boxes = [[1318, 510, 1436, 707], [1710, 235, 1778, 314], [936, 1250, 1030, 1405], [1175, 1318, 1285, 1475]]
const mask = new Uint8Array(W * H), pixels = []
for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (shoulder[y * W + x]) { mask[y * W + x] = 255; pixels.push(y * W + x) }
await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${directory}/edited-texel-mask.png`)
const generated = await sharp(`${directory}/shoulders-imagegen.png`).resize(W, H).removeAlpha().raw().toBuffer()
const textureReport = []
for (let imageIndex = 0; imageIndex < doc.images.length; imageIndex++) {
  const image = doc.images[imageIndex], v = glb.doc.bufferViews[image.bufferView]
  const bytes = glb.bin.subarray(v.byteOffset, v.byteOffset + v.byteLength), original = await sharp(bytes).removeAlpha().raw().toBuffer(), corrected = Buffer.from(original)
  if (image.name === 'texture_0') {
    const invalid = []
    for (const i of pixels) {
      const rgb = [...generated.subarray(i * 3, i * 3 + 3)]
      const paint = Math.min(...rgb) > 95 && Math.max(...rgb) - Math.min(...rgb) < 60
      for (let k = 0; k < 3; k++) corrected[i * 3 + k] = paint ? rgb[k] : [190, 194, 180][k]
      if (!paint) invalid.push(i)
    }
    // Registration at an island rim can expose generated black background.
    // Extend adjacent paint across those samples, never import that background.
    for (let iteration = 0; iteration < 160; iteration++) for (const i of invalid) for (let k = 0; k < 3; k++) {
      const neighbors = [i - 1, i + 1, i - W, i + W].filter(j => mask[j] && corrected[j * 3 + 1] > 95)
      if (neighbors.length) corrected[i * 3 + k] = Math.round(neighbors.reduce((n, j) => n + corrected[j * 3 + k], 0) / neighbors.length)
    }
  }
  else {
    // Normal/roughness are technical fields, not painted color. Continue the
    // surrounding plate's field across the decal so no embossed logo remains.
    const field = new Float32Array(original.length)
    for (let i = 0; i < original.length; i++) field[i] = original[i]
    for (const i of pixels) for (let k = 0; k < 3; k++) field[i * 3 + k] = image.name === 'normal' ? [128, 128, 250][k] : [255, 155, 0][k]
    for (let iteration = 0; iteration < 700; iteration++) for (const i of pixels) for (let k = 0; k < 3; k++) field[i * 3 + k] = (field[(i - 1) * 3 + k] + field[(i + 1) * 3 + k] + field[(i - W) * 3 + k] + field[(i + W) * 3 + k]) * 0.25
    for (const i of pixels) for (let k = 0; k < 3; k++) corrected[i * 3 + k] = Math.round(field[i * 3 + k])
  }
  let changed = 0, outside = 0
  for (let i = 0; i < W * H; i++) if ([0, 1, 2].some(k => original[i * 3 + k] !== corrected[i * 3 + k])) { changed++; if (!mask[i]) outside++ }
  if (outside) throw Error('Texture edit escaped the shoulder mask')
  const png = await sharp(corrected, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
  fs.writeFileSync(`${directory}/corrected-${image.name}.png`, png)
  image.bufferView = view(png); textureReport.push({ image: image.name, changedTexels: changed, outsideMask: outside })
}

const hands = buildArticulatedHands(doc, bindWorld)
doc.skins[0].inverseBindMatrices = array([...bindMatrices, ...hands.inverse].flat(), 16)
const names = doc.skins[0].joints.map(n => doc.nodes[n].name.replace(/^mixamorig[:_]?/, ''))
doc.meshes = []
const regions = []
const ownerRoot = parents.get(24)
function addMesh(name, primitive, extras) {
  const mesh = doc.meshes.length; doc.meshes.push({ name, primitives: [primitive], extras })
  if (mesh === 0) Object.assign(doc.nodes[24], { mesh, name, extras })
  else { const node = doc.nodes.length; doc.nodes.push({ name, mesh, skin: 0, extras }); doc.nodes[ownerRoot].children.push(node) }
}
for (const region of regional.regions.filter(r => !/glove/.test(r.name))) {
  const vertices = region.sourceVertices, lookup = new Map(vertices.map((v, i) => [v, i])), attributes = {}
  for (const [name, source] of Object.entries(data)) {
    if (name === 'JOINTS_0' && region.rigid) attributes[name] = array(vertices.flatMap(() => [names.indexOf(region.ownerBone), 0, 0, 0]), 4, 5123)
    else if (name === 'WEIGHTS_0' && region.rigid) attributes[name] = array(vertices.flatMap(() => [1, 0, 0, 0]), 4)
    else {
      const b = Buffer.alloc(vertices.length * source.components * source.size)
      vertices.forEach((v, i) => glb.bin.copy(b, i * source.components * source.size, source.offset + v * source.stride, source.offset + v * source.stride + source.components * source.size))
      const descriptor = { componentType: source.accessor.componentType, count: vertices.length, type: source.accessor.type }
      if (source.accessor.normalized) descriptor.normalized = true
      if (name === 'POSITION') Object.assign(descriptor, { min: [0, 1, 2].map(k => Math.min(...vertices.map(i => positions[i][k]))), max: [0, 1, 2].map(k => Math.max(...vertices.map(i => positions[i][k]))) })
      attributes[name] = append(b, descriptor)
    }
  }
  const index = array(region.sourceTriangles.flatMap(t => indices.slice(t * 3, t * 3 + 3).map(i => lookup.get(i))), 1, 5123, 34963)
  addMesh(region.name, { attributes, indices: index, material: primitive.material }, { rigidArmor: region.rigid, ownerBone: region.ownerBone, reviewRequired: region.name.startsWith('Review_') })
  regions.push({ ...region })
}
const gloveMaterial = doc.materials.length
doc.materials.push({ name: 'Scott_ivory_articulated_gloves', pbrMetallicRoughness: { baseColorFactor: [0.66, 0.68, 0.64, 1], metallicFactor: 0.04, roughnessFactor: 0.68 } })
addMesh('Scott_articulated_gloves', { attributes: { POSITION: array(hands.positions, 3), NORMAL: array(hands.normals, 3), JOINTS_0: array(hands.skinIndices, 4, 5123), WEIGHTS_0: array(hands.weights, 4) }, indices: array(hands.indices, 1, 5125, 34963), material: gloveMaterial }, { articulatedHands: true })
doc.buffers[0].byteLength = length
const sourceHash = createHash('sha256').update(glb.bytes).digest('hex')
doc.asset.generator = 'MOSPEADA Scott animated: local shoulder texture repair, rigid armor, articulated gloves'
doc.asset.extras = { source, sourceSha256: sourceHash, unchangedOriginalClips: true, newFingerBones: 30, ambiguousInterfaceTriangles: regional.mixedTextureInterfaces.length }
writeGlb(output, doc, Buffer.concat(chunks))
fs.copyFileSync(output, 'public/models/mospeada/scott-bernard-animated-corrected.glb')
const saved = JSON.parse(fs.readFileSync('public/models/mospeada/scott-riding-pose.json'))
const pose = retargetRidingPose(reference.doc, doc, saved)
pose.name = pose.pose.rig = 'scott-bernard-animated-corrected'; pose.source = '/models/mospeada/scott-bernard-animated-corrected.glb'
fs.writeFileSync('public/models/mospeada/scott-animated-riding-pose.json', JSON.stringify(pose, null, 2) + '\n')
fs.writeFileSync(`${directory}/build-report.json`, JSON.stringify({ source, output, sourceHash, restoredBindDefaults: restored, reassignedLegTriangles, textureReport, hands: hands.hands, rigidRegions: regions.filter(r => r.rigid).length, regions, removedHandTriangles: regional.regions.filter(r => /glove/.test(r.name)).reduce((n, r) => n + r.triangles, 0), newHandTriangles: hands.indices.length / 3, originalAnimationClips: doc.animations.map(a => a.name), bones: doc.skins[0].joints.length, unresolvedTextureInterfaces: regional.mixedTextureInterfaces }, null, 2) + '\n')
console.log(JSON.stringify({ output, bones: doc.skins[0].joints.length, clips: doc.animations.length, meshes: doc.meshes.length, textureReport, restoredBindDefaults: restored.length }, null, 2))
