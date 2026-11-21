import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from 'three'
import { AnimeRenderer, materialProfile } from './AnimeRenderer.js'
import { animeState } from './animeState.js'
import { patchAnimeShader } from './animeShaders.js'
import { animeProgramKey, createPreparationTargets } from './renderPreparation.js'

test('uniform-only Anime differences reuse a program without sharing their material uniforms', () => {
  const effect = Object.assign(Object.create(AnimeRenderer.prototype), { records: new Map(), sources: new Map(), uniforms: {}, stats: {} })
  const source = new T.MeshStandardMaterial()
  const painted = { hero: 1, glass: 0, mask: 1, grass: false, surfaceShine: 1 }
  const upholstery = { ...painted, surfaceShine: .05 }
  const environment = { ...painted, hero: 0, mask: .5 }
  const glass = { ...painted, glass: 1, mask: 0 }
  const variants = [painted, upholstery, environment, glass].map(p => effect.variant(source, p))
  const shaders = variants.map(m => { const s = { vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader, uniforms: {} }; m.onBeforeCompile(s); return s })
  for (let i = 1; i < variants.length; i++) {
    assert.notEqual(variants[i], variants[0])
    assert.equal(variants[i].customProgramCacheKey(), variants[0].customProgramCacheKey())
    assert.equal(shaders[i].fragmentShader, shaders[0].fragmentShader)
  }
  assert.equal(shaders[1].uniforms.uAnimeSurfaceShine.value, .05)
  assert.equal(shaders[2].uniforms.uAnimeMask.value, .5)
  assert.equal(shaders[3].uniforms.uAnimeGlass.value, 1)
  assert.notEqual(animeProgramKey(painted), animeProgramKey({ ...painted, brush: {} }))
  assert.notEqual(animeProgramKey(painted), animeProgramKey({ ...painted, grass: true }))
  variants.forEach(m => m.dispose()); source.dispose()
})

test('Anime preparation keeps full resolution and only draws the active shadow maps once', () => {
  const targets = createPreparationTargets(4), lamp = { visible: false }, draws = []
  const shadowMap = { autoUpdate: true, needsUpdate: false }
  const fullTarget = new T.WebGLRenderTarget(1920, 1080)
  const effect = Object.assign(Object.create(AnimeRenderer.prototype), { scene:new T.Scene(),preparationLights(){return []},preparationTargets: targets, target: fullTarget, renderer: { shadowMap }, sync() {}, withPreparationVariant(night, work) { const previous=lamp.visible;try{lamp.visible=night;return work()}finally{lamp.visible=previous} }, drawSceneTarget(target) {
    draws.push({ night: lamp.visible, shadow: shadowMap.autoUpdate, target })
  } })
  try {
    assert.equal(targets.anime.textures.length, 2); assert.deepEqual(Object.keys(targets), ['anime','dispose'])
    assert.equal(targets.anime.samples, 4); assert.equal(targets.anime.textures[1].format, T.RedFormat)
    effect.primeVariant(false,true);effect.primeVariant(true)
    assert.equal(draws.length, 2)
    for (const draw of draws) { assert.equal(draw.target.width, 16); assert.equal(draw.target.height, 16) }
    assert.deepEqual(draws.map(d => [d.night,d.shadow]), [[false,true],[true,false]])
    assert.equal(fullTarget.width, 1920); assert.equal(fullTarget.height, 1080)
    assert.equal(lamp.visible, false); assert.equal(shadowMap.autoUpdate, true); assert.equal(shadowMap.needsUpdate, false)
  } finally { targets.dispose(); fullTarget.dispose() }
})

test('starting in Anime triggers preparation and renders Anime after it completes', async () => {
  let nativeDraws = 0, animeDraws = 0, compositeDraws = 0, warmCalls = 0
  const renderer = { capabilities: { maxSamples: 0 }, getPixelRatio: () => 1, info: { render: { calls: 2 } }, render() { nativeDraws++ }, setRenderTarget() {} }
  const effect = new AnimeRenderer(renderer, new T.Scene(), new T.PerspectiveCamera())
  effect.collect = () => {}; effect.resize = () => {}; effect.sync = () => {}; effect.brush.sync = () => {}
  effect.drawSceneTarget = () => { animeDraws++; return 2 }
  effect.quad.render = () => { compositeDraws++ }
  effect.warm = () => {
    warmCalls++
    effect.warming ||= Promise.resolve().then(() => { effect.ready = true })
  }
  const config = { ...animeState.defaults }
  try {
    effect.render(config, 1)
    assert.equal(warmCalls, 1); assert.equal(nativeDraws, 0); assert.equal(animeDraws, 0)
    await effect.warming
    effect.render(config, 1)
    assert.equal(effect.ready, true); assert.equal(animeDraws, 1); assert.equal(compositeDraws, 1)
    assert.equal(warmCalls, 1); assert.equal(nativeDraws, 0)
  } finally { effect.dispose() }
})

test('Anime is the only mode and settings still clamp and reset', () => {
  const previous = animeState.snapshot()
  try {
    animeState.set({ mode: 'PBR', compare: true, levels: 9, width: 0, shadow: 3, highlights: -2, split: 2 })
    assert.deepEqual([animeState.snapshot().levels, animeState.snapshot().width, animeState.snapshot().shadow, animeState.snapshot().highlights], [5, 0.5, 1, 0])
    assert.equal(animeState.snapshot().mode,'ANIME')
    assert.equal(animeState.snapshot().compare,undefined);assert.equal(animeState.snapshot().split,undefined)
    animeState.reset()
    assert.equal(animeState.snapshot().mode, 'ANIME');assert.equal(animeState.snapshot().levels, 3)
  } finally { animeState.set(previous) }
})

test('variants share textures and preserve native skinning, geometry and source material arrays', () => {
  const effect = Object.assign(Object.create(AnimeRenderer.prototype), { records: new Map(), sources: new Map(), bindings: [], uniforms: {}, stats: {} })
  const root = new T.Group(); root.name = 'Cyclone_riding_vehicle'
  const texture = new T.Texture(), material = new T.MeshStandardMaterial({ map: texture, normalMap: texture })
  let current
  material.onBeforeCompile = shader => { shader.uniforms.uWeather = { value: 0.3 }; current = shader.uniforms.uWeather }
  const geometry = new T.BoxGeometry(), mesh = new T.SkinnedMesh(geometry, [material, material])
  root.add(mesh); effect.scene = root
  effect.collect()
  const originals = mesh.material
  effect.apply()
  assert.notEqual(mesh.material, originals)
  assert.equal(mesh.geometry, geometry)
  assert.equal(mesh.material[0].map, texture)
  assert.equal(mesh.material[0].normalMap, texture)
  const shader = { vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader, uniforms: {} }
  mesh.material[0].onBeforeCompile(shader)
  assert.equal(shader.vertexShader, T.ShaderLib.standard.vertexShader)
  assert.match(shader.vertexShader, /skinning_vertex/)
  assert.match(shader.fragmentShader, /animeBand/)
  assert.equal(shader.uniforms.uWeather, current)
  material.emissiveIntensity = 4; material.color.set('#3366aa'); current.value = 0.8
  effect.sync()
  assert.equal(mesh.material[0].emissiveIntensity, 4)
  assert.equal(mesh.material[0].color.getHexString(), material.color.getHexString())
  effect.restore()
  assert.equal(mesh.material, originals)
  assert.equal(material.map, texture)
  assert.equal(material.color.getHexString(), '3366aa')
  assert.equal(mesh.skeleton, undefined)
  for (const record of effect.records.values()) record.variant.dispose()
  material.dispose(); geometry.dispose(); texture.dispose()
})

test('glass, lamps and grass retain transparency and avoid solid outline masks', () => {
  const mesh = new T.Mesh(), material = new T.MeshPhysicalMaterial({ transmission: 0.8, transparent: true, opacity: 0.6 })
  assert.equal(materialProfile(mesh, material).glass, 1)
  assert.equal(materialProfile(mesh, material).mask, 0)
  mesh.userData.sourcePiece = 'faro-yellow-left'
  assert.equal(materialProfile(mesh, new T.MeshStandardMaterial()).mask, 0)
  mesh.name = 'Grass_highway_tile_1'
  assert.equal(materialProfile(mesh, new T.ShaderMaterial()).grass, true)
  for (const key of ['physical', 'lambert', 'phong', 'basic', 'points', 'sprite']) {
    const shader = T.ShaderLib[key].fragmentShader
    const result = patchAnimeShader(shader, { hero: 1, glass: 0, mask: key === 'basic' ? 0 : 1 })
    assert.match(result, /animeMaskOutput/)
    assert.match(result, /void main/)
    assert.equal(result.split('{').length, result.split('}').length, key + ' balanced shader blocks')
  }
  material.dispose()
})

test('prewarming excludes empty grass slots without changing their materials or visibility', async () => {
  const root = new T.Group(); root.name = 'Cyclone_riding_vehicle'
  const grass = new T.InstancedMesh(new T.PlaneGeometry(), new T.ShaderMaterial(), 3)
  grass.name = 'Grass_highway_tile_0'; grass.visible = false; root.add(grass)
  const source = grass.material, originalGeometry = grass.geometry
  const effect = Object.assign(Object.create(AnimeRenderer.prototype), { scene: root, camera: new T.Camera(), records: new Map(), sources: new Map(), bindings: [], uniforms: {}, stats: {}, quad: { _mesh: new T.Mesh() }, drawSceneTarget() {}, primeVariant() {} })
  effect.renderer = { info: { programs: [] }, getRenderTarget: () => null, setRenderTarget() {}, compileAsync(object) {
    object.traverse(node => { if (node === grass) assert.equal(node.material, null, 'Unpopulated grass cannot compile without instanceColor') })
    return Promise.resolve()
  } }
  effect.collect(); effect.warm(); await effect.warming; await Promise.resolve()
  assert.equal(effect.ready, true)
  assert.equal(grass.material, source); assert.equal(grass.visible, false); assert.equal(grass.instanceColor, null)
  assert.equal(grass.geometry, originalGeometry)
  grass.geometry.dispose(); source.dispose()
  for (const record of effect.records.values()) record.variant.dispose()
})

test('startup prepares only current Anime lighting and defers the other lighting until playable', async () => {
  const scene = new T.Scene(), root = new T.Group(); root.name = 'Cyclone_riding_vehicle'; scene.add(root)
  const material = new T.MeshStandardMaterial(), mesh = new T.Mesh(new T.BoxGeometry(), material); root.add(mesh)
  const lamp = new T.SpotLight(); lamp.name = 'Cyclone_headlight_left'; lamp.visible = false; root.add(lamp)
  const target = { name: 'HDR' }, calls = [], primes = [], screen = new T.Mesh(), camera = new T.Camera()
  let currentTarget = null
  const effect = Object.assign(Object.create(AnimeRenderer.prototype), { scene, camera, target, records: new Map(), sources: new Map(), bindings: [], uniforms: {}, stats: {}, quad: { _mesh: screen }, drawSceneTarget() {}, primeVariant(night,initial=false) { primes.push([night,initial]);assert.equal(mesh.material, material);assert.equal(lamp.visible, false) } })
  effect.renderer = { info: { programs: [] }, getRenderTarget: () => currentTarget, setRenderTarget(value) { currentTarget = value }, compileAsync(object) {
    if (object === scene) calls.push({ night: lamp.visible, anime: mesh.material !== material, target: currentTarget })
    return Promise.resolve()
  } }
  let finishAssembly;root.userData.armorPreparation=new Promise(resolve=>{finishAssembly=resolve})
  effect.collect();effect.warm();await Promise.resolve();assert.equal(calls.length,0);assert.ok(!effect.ready)
  finishAssembly();await effect.warming
  assert.equal(effect.ready,true);assert.ok(!effect.nightReady)
  assert.deepEqual(calls.map(c=>[c.night,c.anime]),[[false,true]])
  assert.deepEqual(primes,[[false,true]])
  let transforming=true;effect.allowBackgroundWork=()=>!transforming
  const background=effect.prepareNight();await new Promise(resolve=>setTimeout(resolve,10))
  assert.equal(calls.length,1,'Background preparation yields to the transformation')
  transforming=false;await background
  assert.deepEqual(calls.map(c=>[c.night,c.anime]),[[false,true],[true,true]])
  assert.deepEqual(primes,[[false,true],[true,false]])
  for (const call of calls) { assert.equal(call.target.width, 16); assert.equal(call.target.height, 16); assert.notEqual(call.target, target) }
  assert.equal(currentTarget, null); assert.equal(lamp.visible, false); assert.equal(mesh.material, material)
  assert.ok(effect.nightReady);assert.equal(effect.preparationTargets,null)
  for (const record of effect.records.values()) record.variant.dispose()
  mesh.geometry.dispose();material.dispose()
})
