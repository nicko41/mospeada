// Read-only reconstruction from the authored 3D LAB assembly. All output stays here.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { readGlbDocument, retargetRidingPose } from './retarget-riding-pose.mjs'

const lab = path.resolve(process.argv[2] || 'C:/IT-UP/3D-LAB')
const requireLab = createRequire(path.join(lab, 'package.json'))
const ts = requireLab('typescript'), sharp = requireLab('sharp')
const engine = path.resolve('.local/asset-engine'), output = path.resolve('public/models/mospeada')
fs.mkdirSync(engine, { recursive: true }); fs.mkdirSync(output, { recursive: true })
// Transpile only the actual dependency graph; do not copy editor folders/assets.
const compiled = new Set()
function compile(name) {
  if (compiled.has(name)) return
  compiled.add(name)
  const source = fs.readFileSync(path.join(lab, 'src/components/mospeada/rotoscopy', name + '.ts'), 'utf8')
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  code = code.replace(/from (['"])([^.'"][^'"]*)\1/g, (match, quote, dependency) => dependency === 'three' || dependency.startsWith('three/') ? match : `from ${quote}${pathToFileURL(requireLab.resolve(dependency)).href}${quote}`)
  code = code.replace(/(['"])\.\/([^'"\n]+)\1/g, (_, quote, dependency) => {
    compile(dependency); return `${quote}./${dependency}.mjs${quote}`
  })
  fs.writeFileSync(path.join(engine, name + '.mjs'), code)
}
compile('externalMeshes')
// Minimal lossless raster adapter for GLTFExporter; actual pixels are decoded by sharp.
globalThis.self = globalThis
globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }) } }
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}
globalThis.OffscreenCanvas = class {
  constructor(width, height) { Object.assign(this, { width, height }) }
  getContext() {
    return {
      putImageData: image => { this.data = new Uint8Array(image.data) },
      drawImage: image => { this.data = new Uint8Array(image.data) },
      getImageData: () => ({ data: new Uint8ClampedArray(this.data ?? this.width * this.height * 4) }),
      translate() {}, scale() {},
    }
  }
  async convertToBlob() { return new Blob([await sharp(Buffer.from(this.data), { raw: { width: this.width, height: this.height, channels: 4 } }).png().toBuffer()], { type: 'image/png' }) }
}
THREE.TextureLoader.prototype.loadAsync = async function (url) {
  const { data, info } = await sharp(Buffer.from(url.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return new THREE.DataTexture(new Uint8Array(data), info.width, info.height, THREE.RGBAFormat)
}
const sources = new Map(), realFetch = globalThis.fetch
function read(relative) {
  const absolute = path.resolve(lab, relative)
  if (!absolute.startsWith(lab + path.sep)) throw Error('Source outside 3D LAB')
  const bytes = fs.readFileSync(absolute)
  sources.set(relative, { path: absolute, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  return bytes
}
globalThis.fetch = async url => {
  const u = new URL(url, 'http://localhost')
  if (u.pathname === '/api/3d-lab/projects') return new Response(read(u.searchParams.get('path')))
  return realFetch(url)
}
const assemblyPath = 'assets/mospeada/assembly json/cyclone-material-assembly.json'
const assembly = JSON.parse(read(assemblyPath))
const { buildExternalAssembly } = await import(pathToFileURL(path.join(engine, 'externalMeshes.mjs')))
const built = await buildExternalAssembly(assembly.externals)
built.root.updateMatrixWorld(true)
const report = []
built.root.traverse(n => {
  if (n.userData.sourcePiece) report.push({ name: n.userData.sourcePiece, bounds: new THREE.Box3().setFromObject(n).min.toArray().concat(new THREE.Box3().setFromObject(n).max.toArray()) })
})
// Original: forward -X, up +Y, axle +Z. Runtime: forward +Z, up +Y, axle +X.
const scale = 1.3
const transform = new THREE.Matrix4().makeRotationY(Math.PI / 2).scale(new THREE.Vector3(scale, scale, scale))
const root = new THREE.Group(); root.name = 'Cyclone_VR052F'
let triangles = 0, meshCount = 0
built.root.traverse(n => {
  if (!n.isMesh || !n.geometry.attributes.position?.count) return
  let ancestor = n, visible = true, external, sourcePiece
  while (ancestor) {
    visible &&= ancestor.visible
    sourcePiece ??= ancestor.userData.sourcePiece || ancestor.userData.sourcePieces?.join(' + ')
    if (ancestor.userData.externalDepth === 0) external = ancestor.name
    ancestor = ancestor.parent
  }
  if (!visible) return
  const geometry = n.geometry.clone(), matrix = transform.clone().multiply(n.matrixWorld)
  geometry.applyMatrix4(matrix)
  if (matrix.determinant() < 0) {
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i))
    const index = geometry.index
    for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b) }
  }
  const mesh = new THREE.Mesh(geometry, n.material)
  mesh.name = sourcePiece || n.name || 'surface'
  mesh.userData = { sourcePiece: mesh.name, assembly: external }
  root.add(mesh); meshCount++; triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3
})
const bytes = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })
fs.writeFileSync(path.join(output, 'cyclone-vr052f.glb'), Buffer.from(bytes))
const scottPath = 'assets/mospeada/scott/scott-bernard-gear-properly-rigged.glb'
const referenceScott = read(scottPath)
const localScottPath = path.resolve('assets/scott-bernard-gear.glb')
const scott = fs.readFileSync(localScottPath)
const scottSource = { path: localScottPath, bytes: scott.length, sha256: createHash('sha256').update(scott).digest('hex') }
sources.delete(scottPath); sources.set(localScottPath, scottSource)
fs.writeFileSync(path.join(output, 'scott-bernard-gear.glb'), scott)
const character = assembly.characters.find(c => c.name === 'scott-bernard-gear-properly-rigged')
const ridingPose = retargetRidingPose(readGlbDocument(referenceScott), readGlbDocument(scott), { ...character, modelScale: scale, modelRotationY: Math.PI / 2 })
fs.writeFileSync(path.join(output, 'scott-riding-pose.json'), JSON.stringify(ridingPose, null, 2))
const glb = JSON.parse(Buffer.from(bytes).subarray(20, 20 + Buffer.from(bytes).readUInt32LE(12)))
const scottDoc = JSON.parse(scott.subarray(20, 20 + scott.readUInt32LE(12)))
const manifest = { assemblyPath, scale, orientation: 'forward +Z / up +Y / wheel axle +X', sources: [...sources.values()], cyclone: { bytes: bytes.byteLength, meshes: meshCount, triangles, materials: glb.materials.length, embeddedImages: glb.images?.length ?? 0, pieces: report }, scott: { ...scottSource, skins: scottDoc.skins.length, bones: scottDoc.skins[0].joints.length, embeddedImages: scottDoc.images.length, animations: scottDoc.animations?.map(a => a.name) } }
fs.writeFileSync(path.join(output, 'asset-manifest.json'), JSON.stringify(manifest, null, 2))
built.dispose()
console.log(JSON.stringify({ ...manifest, cyclone: { ...manifest.cyclone, pieces: undefined } }, null, 2))
