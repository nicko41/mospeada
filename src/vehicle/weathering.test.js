import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createDrivingCyclone } from './createDrivingCyclone.js'
import { createBikeState } from './bikePhysics.js'
import { bikeConfig } from './bikeConfig.js'
import { registerRideSurfaces, sampleRideHeight } from './rideSurface.js'
import { CycloneSoilLayer } from './CycloneSoilLayer.js'
import { WheelContacts } from './WheelContacts.js'
import { createSoilLoad, evolveSoil } from './weatheringModel.js'
import { weatheringState } from './weatheringState.js'
import { AnimeRenderer, materialProfile } from '../rendering/AnimeRenderer.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {FrontBattloidTransform} from './FrontBattloidTransform.js'
import {RearBattloidTransform} from './RearBattloidTransform.js'
import {WheelBattloidTransform} from './WheelBattloidTransform.js'

const config = { ...weatheringState.defaults }, metrics = { frontRadius: .4, rearRadius: .4 }
const state = { speed: 18, acceleration: 5, slip: 0, steer: 0, yaw: 0, frontAngularSpeed: 45, rearAngularSpeed: 45, handbrake: 0, brakeBlend: 0 }
const wheel = surface => ({ surface, grounded: true, position: new T.Vector3(1, 2, 3), normal: new T.Vector3(0, 1, 0), radius: .4 })

test('wet asphalt produces water only; mud accumulates per wheel and remains after returning to asphalt', () => {
  const load = createSoilLoad(), wheels = { front: wheel('asphalt'), rear: wheel('asphalt') }, before = JSON.stringify(state)
  for (let i = 0; i < 600; i++) evolveSoil(load, wheels, state, config, 1, .1, metrics)
  assert.deepEqual(load, createSoilLoad())
  wheels.front.surface = 'dirt'
  for (let i = 0; i < 200; i++) evolveSoil(load, wheels, state, config, 1, .1, metrics)
  assert.ok(load.frontMud>.25&&load.frontMud<=1); assert.ok(load.frontFilm>.25&&load.frontFilm<=1)
  assert.equal(load.rearMud, 0); assert.equal(load.rearFilm, 0)
  const mud = load.frontMud, film = load.frontFilm
  wheels.front.surface = 'asphalt'
  for (let i = 0; i < 100; i++) evolveSoil(load, wheels, state, config, 1, .1, metrics)
  assert.ok(load.frontMud > mud * .98 && load.frontFilm < film * .9)
  assert.equal(JSON.stringify(state), before)
  const parked = createSoilLoad()
  for (let i = 0; i < 600; i++) evolveSoil(parked, { front: wheel('dirt'), rear: wheel('dirt') }, { ...state, speed: 0 }, config, 1, .1, metrics)
  assert.deepEqual(parked, createSoilLoad(), 'Rain alone cannot create mud on a parked vehicle')
})

test('rain removes film gradually, adhered mud persists, and independent toggles preserve stored dirt', () => {
  const load = { frontMud: .25, rearMud: .25, frontFilm: .25, rearFilm: .25 }, wheels = { front: wheel('asphalt'), rear: wheel('asphalt') }
  for (let i = 0; i < 600; i++) evolveSoil(load, wheels, { ...state, speed: 0 }, config, 1, .1, metrics)
  assert.ok(load.frontMud > .225 && load.frontFilm < .10)
  const before = { ...load }
  evolveSoil(load, wheels, state, { ...config, enabled: false }, 1, 60, metrics)
  evolveSoil(load, wheels, state, { ...config, accumulation: false }, 1, 60, metrics)
  assert.deepEqual(load, before)
  const a = createSoilLoad(), b = createSoilLoad(), mud = { front: wheel('dirt'), rear: wheel('dirt') }
  for (let i = 0; i < 100; i++) evolveSoil(a, mud, state, config, 1, .1, metrics)
  for (let i = 0; i < 500; i++) evolveSoil(b, mud, state, config, 1, .02, metrics)
  assert.ok(Math.abs(a.frontMud - b.frontMud) < .001 && Math.abs(a.frontFilm - b.frontFilm) < .001)
})

globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const bytes = fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb')
const asset = new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')

test('actual tires sample material-tagged triangles independently and identify an airborne wheel', async () => {
  const source = await asset, rig = createDrivingCyclone(source.scene), scene = new T.Scene()
  const dirt = new T.Mesh(new T.PlaneGeometry(50, 50).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 'white' }))
  dirt.userData = { rideSurface: true, rideSurfaceType: 'dirt' }
  const asphalt = new T.Mesh(new T.PlaneGeometry(50, 20).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 'red' }))
  asphalt.position.set(0, .02, -10); asphalt.userData = { rideSurface: true, rideSurfaceType: 'asphalt' }
  scene.add(dirt, asphalt, rig.root); scene.updateMatrixWorld(true)
  const unregister = registerRideSurfaces(scene)
  try {
    const s = createBikeState({ x: 0, z: 0, yaw: 0 }, rig.metrics, sampleRideHeight)
    rig.update(s, sampleRideHeight, bikeConfig)
    const contacts = new WheelContacts(rig, sampleRideHeight), before = JSON.stringify(s)
    const wheels = contacts.update(s)
    assert.equal(wheels.front.surface, 'dirt'); assert.equal(wheels.rear.surface, 'asphalt')
    assert.ok(wheels.front.grounded && wheels.rear.grounded)
    for (const w of Object.values(wheels)) assert.ok(Math.abs(w.position.y - sampleRideHeight(w.position.x, w.position.z)) < 1e-8)
    assert.equal(JSON.stringify(s), before)
    s.frontGrounded = false; contacts.update(s)
    assert.equal(wheels.front.grounded, false)
  } finally { unregister() }
})

test('soil is a reversible per-piece shader layer: geometry/maps survive, lamps/glass/seat stay excluded in PBR and Anime', async () => {
  const source = await asset, rig = createDrivingCyclone(source.scene), layer = new CycloneSoilLayer(rig)
  const geometries = new Map(rig.surfaces.map(m => [m, m.geometry]))
  assert.ok(layer.records.length > 30)
  for (const r of layer.records) assert.doesNotMatch(r.mesh.userData.sourcePiece || r.mesh.name, /Headlight|faro|Display|rear_sit|Pieza 30/i)
  layer.install()
  try {
    for (const r of layer.records) {
      assert.equal(r.mesh.material, r.coated)
      const original = Array.isArray(r.source) ? r.source : [r.source], coated = Array.isArray(r.coated) ? r.coated : [r.coated]
      coated.forEach((m, i) => { assert.equal(m.map, original[i].map); assert.equal(m.normalMap, original[i].normalMap); assert.equal(m.roughness, original[i].roughness); assert.equal(m.color.getHex(), original[i].color.getHex()) })
    }
    const record = layer.records.find(r => !Array.isArray(r.coated)), material = record.coated
    const shader = { vertexShader: T.ShaderLib.physical.vertexShader, fragmentShader: T.ShaderLib.physical.fragmentShader, uniforms: {} }
    material.onBeforeCompile(shader)
    assert.match(shader.fragmentShader, /soilSplat/); assert.match(shader.vertexShader, /uSoilBind \* vec4\(position/)
    const bind = shader.uniforms.uSoilBind.value.toArray()
    rig.root.rotation.y = .7; rig.body.rotation.z = .2; rig.root.updateMatrixWorld(true)
    assert.deepEqual(shader.uniforms.uSoilBind.value.toArray(), bind, 'Mask remains in each piece bind space')
    const effect = Object.assign(Object.create(AnimeRenderer.prototype), { records: new Map(), sources: new Map(), uniforms: {}, stats: {} })
    const anime = effect.variant(material, materialProfile(record.mesh, material)), patched = { vertexShader: T.ShaderLib.physical.vertexShader, fragmentShader: T.ShaderLib.physical.fragmentShader, uniforms: {} }
    anime.onBeforeCompile(patched)
    assert.match(patched.fragmentShader, /soilCoverage/); assert.match(patched.fragmentShader, /animeBand/)
    layer.update({ frontMud: 1, rearMud: 1, frontFilm: 1, rearFilm: 1 }, { ...config, maximum: .4 })
    assert.deepEqual(layer.uniforms.uSoilLoad.value.toArray(), [.4, .4, .4, .4])
    assert.match(shader.fragmentShader, /soilCoverage = clamp\([^;]+, 0\.0, min\(0\.79, uBikeSoilCoverageMax\)\);/, 'Cyclone coverage is independent from Scott in both Motorcycle and Armor')
    layer.update({frontMud:1,rearMud:1,frontFilm:1,rearFilm:1},config,true);assert.equal(layer.uniforms.uBikeSoilCoverageMax.value,.79)
    layer.update({frontMud:1,rearMud:1,frontFilm:1,rearFilm:1},config,false);assert.equal(layer.uniforms.uBikeSoilCoverageMax.value,.79);assert.deepEqual(layer.uniforms.uSoilLoad.value.toArray(),[1,1,1,1])
    assert.match(shader.fragmentShader,/soilSaturation = clamp\(soilMud \/ 1\.00/)
    assert.match(shader.fragmentShader,/soilFilm \* soilDust/,'Dry dirt must remain visible between individual splats')
    layer.update(createSoilLoad(), { ...config, accumulation: false }); assert.equal(layer.uniforms.uSoilEnabled.value, 0)
    rig.surfaces.forEach(m => assert.equal(m.geometry, geometries.get(m)))
    anime.dispose()
  } finally { layer.dispose() }
  for (const r of layer.records) assert.equal(r.mesh.material, r.source)
  layer.install(); for (const r of layer.records) assert.equal(r.mesh.material, r.coated)
  layer.dispose()
})

test('dirty wheel sides and derived Armor pieces retain their exact soil masks, shared loads and coverage through transformation and return',async()=>{
 const read=p=>JSON.parse(fs.readFileSync(p)),load=async p=>{const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
 const [bike,scott,pieces]=await Promise.all([asset,load('public/models/mospeada/scott-bernard-animated-original.glb'),load('public/transformations/cyclone-rear-pieces.glb')])
 for(const installedFirst of [false,true]){
  const rig=createDrivingCyclone(bike.scene),layer=new CycloneSoilLayer(rig),model=clone(scott.scene),bones=new Map()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});model.updateMatrixWorld(true)
  if(installedFirst)layer.install()
  const front=new FrontBattloidTransform(rig,{model,bones},read('public/transformations/cyclone-front-battloid.json')),rear=new RearBattloidTransform(rig,front,read('public/transformations/cyclone-rear-battloid.json'),pieces.scene),wheels=new WheelBattloidTransform(rig,front,rear,read('public/transformations/cyclone-wheel-battloid.json'))
  const owners=layer.records.reduce((n,r)=>n+r.owned.length,0)
  layer.inheritParts(rear.parts);if(!installedFirst)layer.install()
  assert.equal(layer.records.reduce((n,r)=>n+r.owned.length,0),owners,'Rear splits share existing materials rather than duplicating shaders')
  const count=layer.records.length;layer.inheritParts(rear.parts);assert.equal(layer.records.length,count,'Register derived parts only once')
  const derived=rear.parts.filter(p=>p.mesh!==p.source.mesh&&layer.byMesh.has(p.source.mesh))
  assert.ok(derived.length>0)
  for(const p of derived)assert.equal(p.mesh.material,p.source.mesh.material,'Both pieces retain the same original bind-space mask')
  const tracked=wheels.parts.map(p=>{
   const material=p.mesh.material,shader={vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader,uniforms:{}}
   assert.equal(material,layer.byMesh.get(p.mesh).coated);material.onBeforeCompile(shader)
   assert.equal(shader.uniforms.uSoilLoad,layer.uniforms.uSoilLoad)
   return{p,material,shader,bind:shader.uniforms.uSoilBind.value.toArray(),geometry:p.mesh.geometry}
  })
  assert.equal(tracked.filter(r=>/Rim_(Inner|Outer)/.test(r.p.mesh.userData.sourcePiece)).length,4,'Both side discs of both wheels are coated')
  const dirt={frontMud:.8,rearMud:.9,frontFilm:.6,rearFilm:.7}
  const originalDirt={...dirt},body=layer.records.filter(r=>!/^(Front|Rear)_(Tire|Rim|Hub)(_|$)/.test(r.mesh.userData.sourcePiece||r.mesh.name)).map(r=>{
   const material=Array.isArray(r.coated)?r.coated.find(m=>r.owned.includes(m)):r.coated
   if(!material)return null
   const shader={vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader,uniforms:{}};material.onBeforeCompile(shader)
   return{r,material,shader}
  }).filter(Boolean)
  assert.ok(body.length>20,'Exercise actual chest, guards, knee pieces and chassis')
  for(const progress of [0,.25,.42,.6,.7,1,.7,.42,0]){
   wheels.restore();rear.restore();front.restore();front.apply(progress);rear.apply(progress);wheels.apply(progress);layer.update(dirt,config,progress>0)
   assert.equal(layer.uniforms.uBikeSoilCoverageMax.value,.79,'Never substitute the character cap while becoming Armor')
   assert.deepEqual(layer.uniforms.uSoilLoad.value.toArray(),[.8,.9,.6,.7])
   for(const r of tracked){assert.equal(r.p.mesh.material,r.material);assert.equal(r.p.mesh.geometry,r.geometry);assert.deepEqual(r.shader.uniforms.uSoilBind.value.toArray(),r.bind,'Folding the wheel cannot relocate its accumulated dirt');assert.equal(r.shader.uniforms.uSoilEnabled.value,1,'Tires and wheel sides stay dirty in Armor')}
   for(const {shader} of body)assert.equal(shader.uniforms.uSoilEnabled.value,progress>0?0:1,'Body dirt is hidden in Armor and restored on the motorcycle')
   assert.deepEqual(dirt,originalDirt,'Presentation never clears the accumulated dirt')
  }
  assert.equal(layer.records.reduce((n,r)=>n+r.owned.length,0),owners,'Toggling Armor does not allocate materials')
  layer.dispose();for(const r of layer.records)assert.equal(r.mesh.material,r.source)
  wheels.dispose();rear.dispose();front.restore()
 }
})
