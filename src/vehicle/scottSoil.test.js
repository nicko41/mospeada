import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ScottSoilLayer, scottRegion } from './ScottSoilLayer.js'
import { createScottSoilLoad, evolveScottSoil } from './scottSoilModel.js'
import { weatheringState } from './weatheringState.js'

const config = { ...weatheringState.defaults }, state = { speed: 18, acceleration: 8, rearAngularSpeed: 45, frontAngularSpeed: 45, slip: .5, handbrake: .5 }
const w = () => ({ surface: 'dirt', grounded: true, radius: .4, position: new T.Vector3(), forward: new T.Vector3(0, 0, 1) })
const samples = Object.fromEntries(Object.entries({ boots: .2, legs: .6, arms: 1.1, torso: 1 }).map(([k, y]) => [k, [{ position: new T.Vector3(.3, y, -.3) }]]))

test('Scott receives regional splash exposure; adhered mud survives asphalt, rain removes film first', () => {
  const load = createScottSoilLoad(), wheels = { front: w(), rear: w() }, saved = JSON.stringify(state)
  for (let i = 0; i < 30; i++) evolveScottSoil(load, samples, wheels, state, config, 1, .9, .1)
  assert.ok(load.bootsMud > load.legsMud && load.legsMud > load.armsMud && load.armsMud > load.torsoMud)
  const before = { ...load }; wheels.front.surface = wheels.rear.surface = 'asphalt'
  for (let i = 0; i < 100; i++) evolveScottSoil(load, samples, wheels, state, config, 1, .9, .1)
  assert.ok(load.bootsMud > before.bootsMud * .98 && load.bootsFilm < before.bootsFilm * .9)
  const frozen = { ...load }; evolveScottSoil(load, samples, wheels, state, { ...config, scottEnabled: false }, 1, .9, 10)
  assert.deepEqual(load, frozen); assert.equal(JSON.stringify(state), saved)
  const dry = createScottSoilLoad(); wheels.front.surface = wheels.rear.surface = 'dirt'
  evolveScottSoil(dry, samples, wheels, state, config, 1, 0, 1)
  assert.equal(dry.bootsMud, 0); assert.ok(dry.bootsFilm > 0)
})

globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
test('Scott shader uses original skin attributes without editing geometry, skeleton, maps or animation data', async () => {
  const bytes = fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb'), hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
  const skins = [], bones = new Map(); asset.scene.traverse(n => { if (n.isBone) bones.set(n.name, n); if (n.isSkinnedMesh) skins.push({ mesh: n, original: n.material, clean: n.material.clone() }) })
  const mesh = skins[0].mesh, geometry = mesh.geometry, skeleton = mesh.skeleton, attributes = { ...geometry.attributes }
  const arrays = Object.fromEntries(Object.entries(attributes).map(([k, a]) => [k, crypto.createHash('sha256').update(Buffer.from(a.array.buffer)).digest('hex')]))
  const layer = new ScottSoilLayer({ skins, bones })
  try {
    layer.install(); const material = mesh.material, source = skins[0].original
    assert.notEqual(material, source); assert.equal(material.map, source.map); assert.equal(material.normalMap, source.normalMap)
    const shader = { vertexShader: T.ShaderLib.physical.vertexShader, fragmentShader: T.ShaderLib.physical.fragmentShader, uniforms: {} }
    material.onBeforeCompile(shader)
    assert.match(shader.vertexShader, /skinIndex/); assert.match(shader.fragmentShader, /vScottHead/)
    layer.update(Object.fromEntries(Object.keys(createScottSoilLoad()).map(k=>[k,100])),{...config,maximum:100})
    assert.deepEqual(layer.uniforms.uScottMud.value.toArray(),[.25,.25,.25,.25])
    assert.deepEqual(layer.uniforms.uScottFilm.value.toArray(),[.25,.25,.25,.25])
    assert.match(shader.fragmentShader,/soilCoverage = clamp\([^;]+, 0\.0, 0\.25\);/,'All regional soil contributions share one final visual cap')
    assert.match(shader.fragmentShader, /smoothstep\(\.965, \.995/)
    assert.equal(scottRegion('mixamorig:Head').length(), 0); assert.equal(scottRegion('headfront').length(), 0)
    assert.equal(scottRegion('mixamorig:LeftFoot').x, 1)
    mesh.material = skins[0].clean; layer.install(); assert.notEqual(mesh.material, skins[0].clean)
    for (const [k, a] of Object.entries(attributes)) { assert.equal(geometry.attributes[k], a); assert.equal(crypto.createHash('sha256').update(Buffer.from(a.array.buffer)).digest('hex'), arrays[k]) }
    assert.equal(mesh.geometry, geometry); assert.equal(mesh.skeleton, skeleton); assert.equal(bones.size, 24); assert.equal(asset.animations.length, 16)
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb')).digest('hex'), hash)
  } finally { layer.dispose() }
  assert.equal(mesh.material, skins[0].clean)
})
