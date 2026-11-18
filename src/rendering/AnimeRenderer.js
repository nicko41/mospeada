import * as T from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { patchAnimeShader, compositeVertex, compositeFragment } from './animeShaders.js'
import { SurfaceBrush } from './SurfaceBrush.js'
import { patchSurfaceBrush } from './surfaceBrushShader.js'
import { animeProgramKey, createPreparationTargets } from './renderPreparation.js'

const dynamic = ['color', 'emissive', 'emissiveIntensity', 'opacity', 'roughness', 'metalness', 'envMapIntensity', 'normalScale', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'specularIntensity', 'specularColor', 'attenuationColor', 'attenuationDistance']
const textureKeys = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'envMap']

export function materialProfile(object, material) {
  let parent = object, hero = object.isSkinnedMesh ? 1 : 0
  while (parent) { if (parent.name === 'Cyclone_riding_vehicle') hero = 1; parent = parent.parent }
  const grass = /^Grass_/.test(object.name)
  const glass = (material.transmission || 0) > 0 || material.transparent && material.opacity < 0.95
  const lit = material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial
  const emitter = /Headlight_.*(Optic|Glass)|faro-yellow/.test(object.userData.sourcePiece || '')
  return { surfaceShine: material.userData.animeSurfaceShine ?? 1, hero, grass, glass: glass ? 1 : 0, mask: lit && !glass && !emitter && !object.userData.rideSurface ? hero ? 1 : 0.5 : 0 }
}

export class AnimeRenderer {
  constructor(renderer, scene, camera) {
    Object.assign(this, { renderer, scene, camera })
    this.records = new Map(); this.sources = new Map(); this.bindings = []
    this.ready = false; this.warming = null; this.disposed = false
    this.brush = new SurfaceBrush()
    this.uniforms = { uAnimeCel: { value: 1 }, uAnimeLevels: { value: 3 }, uAnimeShadow: { value: 0.72 }, uAnimeHighlights: { value: 0.55 }, uAnimeDay: { value: 1 } }
    this.target = new T.WebGLRenderTarget(1, 1, { count: 2, type: T.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples), depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType) })
    this.target.textures[0].colorSpace = T.LinearSRGBColorSpace
    this.target.textures[1].type = T.UnsignedByteType; this.target.textures[1].colorSpace = T.NoColorSpace
    this.target.textures[1].format = T.RedFormat
    this.target.textures[1].minFilter = T.NearestFilter; this.target.textures[1].magFilter = T.NearestFilter
    this.pbrTexture = null
    this.composite = new T.ShaderMaterial({ vertexShader: compositeVertex, fragmentShader: compositeFragment, depthTest: false, depthWrite: false,
      uniforms: { uBeauty: { value: this.target.textures[0] }, uMask: { value: this.target.textures[1] }, uDepth: { value: this.target.depthTexture }, uPbr: { value: this.target.textures[0] },
        uPixel: { value: new T.Vector2(1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uWidth: { value: 1.2 }, uOutlineColor: { value: new T.Color('#111b2e').convertLinearToSRGB() },
        uFogDensity: { value: 0.068 }, uOutlines: { value: 1 }, uCompare: { value: 0 }, uSplit: { value: 0.5 } },
    })
    this.quad = new FullScreenQuad(this.composite)
    this.size = new T.Vector2(); this.zero = new Float32Array([0, 0, 0, 0])
    this.stats = { materials: 0, renderCalls: 0, mode: 'PBR' }
  }
  sourceRecord(material) {
    if (this.sources.has(material)) return this.sources.get(material)
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey, key = cacheKey.call(material)
    const record = { material, compile, cacheKey, key, custom: new Map() }
    const capture = (shader, renderer) => {
      const initial = new Set(Object.keys(shader.uniforms))
      compile.call(material, shader, renderer)
      for (const name of Object.keys(shader.uniforms)) if (!initial.has(name)) {
        if (!record.custom.has(name)) record.custom.set(name, [])
        const list = record.custom.get(name)
        if (!list.includes(shader.uniforms[name])) list.push(shader.uniforms[name])
      }
    }
    material.onBeforeCompile = capture; material.customProgramCacheKey = () => key
    record.capture = capture; this.sources.set(material, record)
    return record
  }
  variant(source, profile) {
    const key = `${source.uuid}:${profile.hero}:${profile.glass}:${profile.mask}:${profile.grass}:${profile.surfaceShine ?? 1}:${profile.brush?.object.uuid || ''}`
    if (this.records.has(key)) return this.records.get(key).variant
    const record = this.sourceRecord(source), variant = source.clone()
    if (variant.isShaderMaterial) variant.uniforms = { ...source.uniforms }
    variant.name = `ANIME / ${source.name || source.type}`
    variant.onBeforeCompile = (shader, renderer) => {
      record.capture(shader, renderer)
      Object.assign(shader.uniforms, this.uniforms, { uAnimeSurfaceShine: { value: profile.surfaceShine ?? 1 }, uAnimeHero: { value: profile.hero }, uAnimeGlass: { value: profile.glass }, uAnimeMask: { value: profile.mask } })
      shader.fragmentShader = patchAnimeShader(shader.fragmentShader, profile)
      if (profile.brush) { Object.assign(shader.uniforms, profile.brush.uniforms); patchSurfaceBrush(shader) }
    }
    variant.customProgramCacheKey = () => `${record.key}|${animeProgramKey(profile)}`
    this.records.set(key, { source, variant, profile }); this.stats.materials = this.records.size
    return variant
  }
  collect() {
    this.restore()
    this.bindings = []
    this.scene.traverse(object => {
      if (!object.material || !(object.isMesh || object.isSprite || object.isLine || object.isPoints)) return
      const source = object.material, array = Array.isArray(source) ? source : [source]
      let attachment = null
      const variants = array.map(material => {
        const brush = this.brush?.attach(object, material)
        if (brush) attachment = brush
        return this.variant(material, { ...materialProfile(object, material), brush })
      })
      this.bindings.push({ object, source, anime: Array.isArray(source) ? variants : variants[0], attachment })
    })
  }
  restore() { for (const b of this.bindings) { if (b.object.material === b.anime) b.object.material = b.source; if (b.attachment && b.object.geometry === b.attachment.geometry) b.object.geometry = b.attachment.sourceGeometry } }
  apply() { for (const b of this.bindings) { b.object.material = b.anime; if (b.attachment) b.object.geometry = b.attachment.geometry } }
  sync() {
    for (const { source, variant } of this.records.values()) {
      for (const key of dynamic) if (key in source) {
        if (source[key]?.isColor || source[key]?.isVector2) variant[key].copy(source[key]); else variant[key] = source[key]
      }
      for (const key of textureKeys) if (key in source && source[key] !== variant[key]) { variant[key] = source[key]; variant.needsUpdate = true }
    }
    // The original world's shader callbacks keep refs to their last compile.
    // Share those custom uniform values across cached PBR/Anime programs.
    for (const source of this.sources.values()) for (const list of source.custom.values()) {
      const current = list[list.length - 1]
      for (const uniform of list) uniform.value = current.value
    }
  }
  resize() {
    this.renderer.getDrawingBufferSize(this.size)
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y)
      this.pbrTexture?.dispose(); this.pbrTexture = null
      this.composite.uniforms.uPbr.value = this.target.textures[0]
    }
    this.composite.uniforms.uPixel.value.set(1 / this.size.x, 1 / this.size.y)
  }
  warm(initialMode = 'ANIME') {
    if (this.warming || this.ready || this.error || this.disposed || !this.scene.getObjectByName('Cyclone_riding_vehicle')) return
    // Keep pre-existing context/texture-upload flags separate from preparation.
    this.stats.preparation = { startMs: performance.now(), initialGLError: this.renderer.getContext?.().getError() || 0 }
    this.preparationTargets ||= createPreparationTargets(this.target?.samples || 0)
    const previous = this.renderer.getRenderTarget(), lights = []
    this.scene.traverse(object => { if (object.isLight && /^Cyclone_(headlight|amber)_/.test(object.name)) lights.push({ object, visible: object.visible }) })
    // compileAsync traverses invisible objects too. Empty grass pool slots have
    // no instanceColor yet; their shader is valid only after a tile is populated.
    // The populated original field precompiles that same valid program instead.
    const inactive = this.bindings.filter(({ object }) => object.isInstancedMesh && !object.visible && !object.instanceColor && /^Grass_/.test(object.name))
    try {
      const pending = []
      // Light visibility changes Three's light/shadow counts and shader defines.
      // Prepare both counts for BOTH modes, without keeping night lights active
      // (and paying for their shadow maps) during normal daytime rendering.
      for (const night of [false, true]) {
        for (const { object } of lights) object.visible = night
        for (const anime of [false, true]) {
          this.restore(); if (anime) this.apply()
          for (const { object } of inactive) object.material = null
          this.renderer.setRenderTarget(anime ? this.preparationTargets.anime : null)
          pending.push(this.renderer.compileAsync(this.scene, this.camera))
          if (!anime) {
            // Three captures opaque PBR objects in a linear target behind
            // transmission materials. Its color-space/tone-mapping defines
            // differ from the final PBR framebuffer, even for opaque objects.
            this.renderer.setRenderTarget(this.preparationTargets.pbr)
            pending.push(this.renderer.compileAsync(this.scene, this.camera))
          }
        }
      }
      this.renderer.setRenderTarget(null)
      // FullScreenQuad's mesh is used only for precompilation (Three 0.186).
      pending.push(this.renderer.compileAsync(this.quad._mesh, this.camera))
      this.warming = Promise.all(pending).then(() => {
        if (this.disposed) return
        this.stats.preparation.compileMs = performance.now() - this.stats.preparation.startMs
        const primeStart = performance.now()
        this.primePasses(lights)
        // Allocate the real starting framebuffer/transmission capture once,
        // after preparation. All hidden variants used tiny temporary targets.
        if (initialMode === 'ANIME') this.drawSceneTarget()
        else this.renderer.render(this.scene, this.camera)
        // Linking is not the last first-use cost: initialize Three's native
        // uniform/attribute reflection while the loading screen is still up.
        for (const program of this.renderer.info.programs) if (program.program) {
          program.getUniforms(); program.getAttributes()
        }
        this.ready = true
        this.stats.preparation.primeMs = performance.now() - primeStart
        this.stats.preparation.totalMs = performance.now() - this.stats.preparation.startMs
        this.stats.preparation.programs = this.renderer.info.programs.length
      }).catch(error => { this.error = error.message }).finally(() => { this.preparationTargets?.dispose(); this.preparationTargets = null })
    } catch (error) { this.error = error.message; this.preparationTargets?.dispose(); this.preparationTargets = null }
    finally {
      for (const { object, anime } of inactive) object.material = anime
      for (const { object, visible } of lights) object.visible = visible
      this.renderer.setRenderTarget(previous); this.restore()
    }
  }
  primePasses(lights) {
    const visibility = lights.map(({ object }) => object.visible)
    const { anime, pbr } = this.preparationTargets
    const shadows = this.renderer.shadowMap, autoUpdate = shadows.autoUpdate, needsUpdate = shadows.needsUpdate
    try {
      this.sync()
      for (const night of [false, true]) {
        lights.forEach(({ object }) => { object.visible = night })
        // The second shadow draw covers depth shaders using the newly updated
        // light counts. The remaining hidden passes can reuse these maps.
        shadows.autoUpdate = true; shadows.needsUpdate = true
        // compileAsync doesn't allocate shadow maps or run transmission/depth
        // passes. Draw offscreen now, so their first use cannot freeze an M key
        // press or the first Anime frame. The visible PBR framebuffer stays put.
        this.drawSceneTarget(true, anime)
        this.drawSceneTarget(true, anime)
        shadows.autoUpdate = false; shadows.needsUpdate = false
        // Exercise native PBR transmission too: its back-face capture creates
        // variants which compileAsync alone doesn't cover. Never present these
        // preparation frames on the visible framebuffer.
        this.drawSceneTarget(false, pbr); this.drawSceneTarget(false, pbr)
        // The canvas has its own tone-mapping/output-space variants. A linear
        // render target cannot exercise these native transmission/side passes.
        // Keep the real canvas path, but rasterize only a tiny hidden viewport.
        this.drawPreparationPBR(); this.drawPreparationPBR()
      }
    } finally {
      lights.forEach(({ object }, i) => { object.visible = visibility[i] })
      shadows.autoUpdate = autoUpdate; shadows.needsUpdate = needsUpdate
    }
  }
  drawPreparationPBR() {
    const r = this.renderer, previous = r.getRenderTarget()
    const viewport = r.getViewport(new T.Vector4()), scissor = r.getScissor(new T.Vector4()), scissorTest = r.getScissorTest()
    try {
      this.restore(); r.setRenderTarget(null)
      r.setViewport(0, 0, 16, 16); r.setScissor(0, 0, 16, 16); r.setScissorTest(true)
      r.render(this.scene, this.camera)
    } finally {
      r.setRenderTarget(previous); r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest)
    }
  }
  drawSceneTarget(anime = true, target = this.target) {
    const { renderer, scene, camera } = this
    const previous = renderer.getRenderTarget(), background = scene.background, clearColor = renderer.getClearColor(new T.Color()), clearAlpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    try {
      if (anime) this.apply(); else this.restore()
      renderer.setRenderTarget(target)
      renderer.setClearColor(background?.isColor ? background : clearColor, 1)
      renderer.clear()
      if (target.textures.length > 1) renderer.getContext().clearBufferfv(renderer.getContext().COLOR, 1, this.zero)
      scene.background = null; renderer.autoClear = false
      renderer.render(scene, camera)
      return renderer.info.render.calls
    } finally {
      scene.background = background; renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha)
      this.restore(); renderer.setRenderTarget(previous)
    }
  }
  render(config, day) {
    const { renderer, scene, camera } = this
    this.collect(); this.resize(); this.sync()
    this.brush?.sync(camera)
    Object.assign(this.uniforms.uAnimeCel, { value: config.cel ? 1 : 0 }); this.uniforms.uAnimeLevels.value = config.levels
    this.uniforms.uAnimeShadow.value = config.shadow; this.uniforms.uAnimeHighlights.value = config.highlights; this.uniforms.uAnimeDay.value = day
    const uniforms = this.composite.uniforms
    uniforms.uNear.value = camera.near; uniforms.uFar.value = camera.far
    uniforms.uWidth.value = config.width * renderer.getPixelRatio()
    uniforms.uOutlineColor.value.set(config.color).convertLinearToSRGB()
    uniforms.uFogDensity.value = scene.fog?.density || 0; uniforms.uOutlines.value = config.outlines ? 1 : 0
    uniforms.uCompare.value = config.compare ? 1 : 0; uniforms.uSplit.value = config.split
    this.stats.mode = config.mode
    // Do not synchronously draw/compile PBR on every loading frame. Preparing
    // both styles asynchronously is enough while the DOM loading screen is up.
    if (!this.ready && !this.error) {
      this.stats.renderCalls = 0
      this.warm(config.mode); return
    }
    if (config.mode === 'PBR' || this.error) {
      renderer.render(scene, camera); this.stats.renderCalls = renderer.info.render.calls
      return
    }
    let comparisonCalls = 0
    if (config.compare) {
      // Copy the actual PBR framebuffer. Rendering PBR into a linear HDR target
      // would change its fog/tone-mapping order and make the reference inaccurate.
      this.pbrTexture ||= new T.FramebufferTexture(this.size.x, this.size.y)
      renderer.setRenderTarget(null); renderer.render(scene, camera)
      comparisonCalls = renderer.info.render.calls
      renderer.copyFramebufferToTexture(this.pbrTexture)
      uniforms.uPbr.value = this.pbrTexture
    }
    this.stats.renderCalls = this.drawSceneTarget() + comparisonCalls
    renderer.setRenderTarget(null); this.quad.render(renderer)
    this.stats.renderCalls += renderer.info.render.calls
  }
  dispose() {
    this.disposed = true; this.restore()
    for (const record of this.sources.values()) { record.material.onBeforeCompile = record.compile; record.material.customProgramCacheKey = record.cacheKey }
    for (const record of this.records.values()) record.variant.dispose()
    this.brush?.dispose()
    this.preparationTargets?.dispose(); this.preparationTargets = null
    this.target.dispose(); this.pbrTexture?.dispose(); this.composite.dispose(); this.quad.dispose()
  }
}
