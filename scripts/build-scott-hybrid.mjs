import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readGlb, accessorData, writeGlb } from './glb-data.mjs'

// This is a derived asset. Never overwrite the source or install it in the game.
const source = 'assets/scott-bernard-gear.glb', output = 'assets/scott-bernard-gear-hybrid.glb'
const directory = 'artifacts/rig-hybrid'
fs.mkdirSync(directory, { recursive: true })
const glb = readGlb(source), doc = structuredClone(glb.doc), primitive = doc.meshes[0].primitives[0]
const data = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessorData(glb, index)]))
const positions = data.POSITION.values, uvs = data.TEXCOORD_0.values, indices = accessorData(glb, primitive.indices).values.flat()
const names = doc.skins[0].joints.map(index => doc.nodes[index].name.replace(/^mixamorig[:_]?/, ''))
const textureIndex = doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture.index
const image = doc.images[doc.textures[textureIndex].source], imageView = doc.bufferViews[image.bufferView]
const sharp = createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const texture = await sharp(glb.bin.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
function color(uv) {
  const x = Math.min(texture.info.width - 1, Math.max(0, Math.floor(uv[0] * texture.info.width)))
  const y = Math.min(texture.info.height - 1, Math.max(0, Math.floor(uv[1] * texture.info.height)))
  return [...texture.data.subarray((y * texture.info.width + x) * 3, (y * texture.info.width + x) * 3 + 3)]
}
const samples = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]]
const regions = new Map(), mixed = [], faces = []
function classify(t) {
  const vertices = indices.slice(t * 3, t * 3 + 3), points = vertices.map(i => positions[i])
  const center = [0, 1, 2].map(k => points.reduce((sum, point) => sum + point[k], 0) / 3)
  const [x, y, z] = center, ax = Math.abs(x), side = x > 0 ? 'Left' : 'Right'
  const colors = samples.map(bary => color([0, 1].map(k => bary.reduce((sum, weight, i) => sum + weight * uvs[vertices[i]][k], 0))))
  const red = colors.filter(([r, g, b]) => r > g * 1.38 && r > b * 1.45 && r > 45).length / colors.length
  const dark = colors.filter(rgb => Math.max(...rgb) < 65).length / colors.length
  const blue = colors.filter(([r, g, b]) => b > r * 1.4 && b > g * 1.15).length / colors.length
  const head = ax < 0.15 && (y > 1.405 || y > 1.365 && z > 0.04 && ax < 0.11 && dark < 0.5)
  const neckLiner = ax < 0.09 && y > 1.33 && (dark > 0.4 || blue > 0.5)
  const soft = !head && (red >= 0.5 || neckLiner || dark > 0.6 && y > 0.285 && y < 0.76 && z < 0.025)
  let label, bone
  if (soft) { label = 'Flexible_cloth_and_joint_liners'; bone = null }
  else if (head) { label = 'Rigid_helmet_and_jaw'; bone = 'Head' }
  else if (ax > 0.70) { label = `Rigid_${side}_glove`; bone = side + 'Hand' }
  else if (ax > 0.455 && y > 1.15) { label = `Rigid_${side}_forearm`; bone = side + 'ForeArm' }
  else if (ax > 0.185 && y > 1.285) { label = `Rigid_${side}_shoulder`; bone = side + 'Arm' }
  else if (y > 1.055) { label = 'Rigid_chest_and_back'; bone = 'Spine2' }
  else if (y > 0.895) { label = 'Rigid_belt_and_groin'; bone = 'Hips' }
  else if (y > 0.70) { label = `Rigid_${side}_thigh`; bone = side + 'UpLeg' }
  else if (y > 0.49) { label = `Rigid_${side}_kneecap`; bone = side + 'Leg' }
  else if (y > 0.285) { label = `Rigid_${side}_shin`; bone = side + 'Leg' }
  else { label = `Rigid_${side}_boot_and_ankle`; bone = side + 'Foot' }
  // A triangle can carry both painted armor and cloth. Keep the triangle intact;
  // record that interface for inspection instead of cutting or remeshing it.
  if (!head && red > 0 && red < 1) mixed.push({ triangle: t, center, redFraction: red, region: label, ownerBone: bone })
  return { triangle: t, vertices, center, label, bone, redFraction: red }
}
for (let t = 0; t < indices.length / 3; t++) faces.push(classify(t))
// Mixed painted interfaces cannot be split on the existing triangle edges.
// Leave their geometry and weights intact and identify them for manual review.
const mixedIds = new Set(mixed.map(face => face.triangle))
for (const face of faces) {
  if (mixedIds.has(face.triangle)) { face.label = 'Review_unsplit_cloth_armor_interfaces'; face.bone = null }
  if (!regions.has(face.label)) regions.set(face.label, { name: face.label, bone: face.bone, faces: [] })
  regions.get(face.label).faces.push(face)
}
// Preserve every original binary payload (including all textures, bind matrices
// and animations). Append compact attribute/index streams for the derived parts.
const chunks = [glb.bin], align = n => (n + 3) & ~3
let length = glb.bin.length
function append(buffer, accessor, target = 34962) {
  const padding = align(length) - length
  if (padding) { chunks.push(Buffer.alloc(padding)); length += padding }
  const view = doc.bufferViews.length; doc.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, target })
  chunks.push(buffer); length += buffer.length
  const index = doc.accessors.length; doc.accessors.push({ ...accessor, bufferView: view, byteOffset: 0 })
  return index
}
const ordered = [...regions.values()].sort((a, b) => Number(!!a.bone) - Number(!!b.bone) || a.name.localeCompare(b.name))
const report = []
doc.meshes = []
for (const region of ordered) {
  const vertices = [...new Set(region.faces.flatMap(face => face.vertices))], lookup = new Map(vertices.map((v, i) => [v, i]))
  const attributes = {}, count = vertices.length
  for (const [name, source] of Object.entries(data)) {
    const bytes = Buffer.alloc(count * source.components * source.size)
    if (region.bone && name === 'JOINTS_0') {
      const joint = names.indexOf(region.bone); if (joint < 0) throw Error('Missing bone: ' + region.bone)
      for (let i = 0; i < count; i++) bytes.writeUInt8(joint, i * 4)
    } else if (region.bone && name === 'WEIGHTS_0') {
      for (let i = 0; i < count; i++) bytes.writeFloatLE(1, i * 16)
    } else {
      vertices.forEach((v, i) => glb.bin.copy(bytes, i * source.components * source.size, source.offset + v * source.stride, source.offset + v * source.stride + source.components * source.size))
    }
    const descriptor = { componentType: source.accessor.componentType, count, type: source.accessor.type }
    if (source.accessor.normalized) descriptor.normalized = true
    if (name === 'POSITION') {
      descriptor.min = [0, 1, 2].map(k => Math.min(...vertices.map(i => positions[i][k])))
      descriptor.max = [0, 1, 2].map(k => Math.max(...vertices.map(i => positions[i][k])))
    }
    attributes[name] = append(bytes, descriptor)
  }
  const indexBytes = Buffer.alloc(region.faces.length * 3 * 2)
  region.faces.flatMap(face => face.vertices).forEach((v, i) => indexBytes.writeUInt16LE(lookup.get(v), i * 2))
  const indexAccessor = append(indexBytes, { componentType: 5123, count: region.faces.length * 3, type: 'SCALAR' }, 34963)
  const mesh = doc.meshes.length, extras = { rigidArmor: !!region.bone, ownerBone: region.bone, reviewRequired: region.name.startsWith('Review_'), source: 'scott-bernard-gear.glb' }
  doc.meshes.push({ name: region.name, primitives: [{ attributes, indices: indexAccessor, material: primitive.material }], extras })
  if (mesh === 0) { doc.nodes[24].mesh = mesh; doc.nodes[24].name = region.name; doc.nodes[24].extras = extras }
  else { const node = doc.nodes.length; doc.nodes.push({ name: region.name, mesh, skin: 0, extras }); doc.nodes[25].children.push(node) }
  report.push({ name: region.name, ownerBone: region.bone, rigid: !!region.bone, triangles: region.faces.length, vertices: count, bounds: { min: doc.accessors[attributes.POSITION].min, max: doc.accessors[attributes.POSITION].max }, sourceTriangles: region.faces.map(face => face.triangle), sourceVertices: vertices })
}
doc.buffers[0].byteLength = length
const sha256 = createHash('sha256').update(glb.bytes).digest('hex')
doc.asset.generator = 'MOSPEADA non-destructive hybrid armor derivative'
doc.asset.extras = { sourceSha256: sha256, sourceFile: source, status: 'Hybrid derivative; painted material interfaces require manual review', geometry: 'Original triangles, positions, normals, tangents and UVs preserved; no remeshing', rig: 'Original skeleton, inverse bind matrices and animation channels; single-joint weights on rigid parts' }
writeGlb(output, doc, Buffer.concat(chunks))
fs.writeFileSync(`${directory}/regions.json`, JSON.stringify({ source, output, sourceSha256: sha256, triangles: faces.length, regions: report, mixedTextureInterfaces: mixed }, null, 2) + '\n')
console.log(JSON.stringify({ output, sourceSha256: sha256, triangles: faces.length, regions: report.map(({ sourceTriangles, sourceVertices, bounds, ...r }) => r), mixedTextureInterfaces: mixed.length }, null, 2))
