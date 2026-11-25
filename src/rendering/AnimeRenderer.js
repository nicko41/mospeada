import * as T from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { patchAnimeShader, compositeVertex, compositeFragment } from './animeShaders.js'
import { SurfaceBrush } from './SurfaceBrush.js'
import { patchSurfaceBrush } from './surfaceBrushShader.js'
import { animeProgramKey, createPreparationTargets } from './renderPreparation.js'
import { publishRenderMetrics } from './renderMetrics.js'
import {combatFlashUniforms,patchCombatFlashLighting,syncCombatFlashLighting} from '../vfx/combatFlashLighting.js'

const dynamic = ['color', 'emissive', 'emissiveIntensity', 'opacity', 'roughness', 'metalness', 'envMapIntensity', 'normalScale', 'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'specularIntensity', 'specularColor', 'attenuationColor', 'attenuationDistance']
const textureKeys = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'envMap']

export function materialProfile(object, material) {
  let parent = object, hero = object.isSkinnedMesh ? 1 : 0
  while (parent) { if (parent.name === 'Cyclone_riding_vehicle'||parent.userData.animeHero) hero = 1; parent = parent.parent }
  const grass = /^Grass_/.test(object.name)
  const glass = (material.transmission || 0) > 0 || material.transparent && material.opacity < 0.95
  const lit = material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial
  const emitter = /Headlight_.*(Optic|Glass)|faro-yellow/.test(object.userData.sourcePiece || '')
  const natural = !!(object.userData.forest || material.userData.forest)
  return { surfaceShine: material.userData.animeSurfaceShine ?? 1, hero, grass, natural, glass: glass ? 1 : 0, mask: lit && !natural && !glass && !emitter && !object.userData.rideSurface ? hero ? 1 : 0.5 : 0 }
}

export class AnimeRenderer {
  constructor(renderer, scene, camera) {
    Object.assign(this, { renderer, scene, camera })
    this.records = new Map(); this.sources = new Map(); this.bindings = []
    this.ready = false; this.openingReady=false; this.warming = null; this.disposed = false
    this.brush = new SurfaceBrush()
    this.uniforms = { uAnimeCel: { value: 1 }, uAnimeLevels: { value: 3 }, uAnimeShadow: { value: 0.72 }, uAnimeHighlights: { value: 0.55 }, uAnimeDay: { value: 1 },uDistanceHaze:{value:0},uDistanceHazeRange:{value:new T.Vector2(0,1)} }
    this.target = new T.WebGLRenderTarget(1, 1, { count: 2, type: T.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples), depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType) })
    this.target.textures[0].colorSpace = T.LinearSRGBColorSpace
    this.target.textures[1].type = T.UnsignedByteType; this.target.textures[1].colorSpace = T.NoColorSpace
    this.target.textures[1].format = T.RedFormat
    this.target.textures[1].minFilter = T.NearestFilter; this.target.textures[1].magFilter = T.NearestFilter
    this.composite = new T.ShaderMaterial({ vertexShader: compositeVertex, fragmentShader: compositeFragment, depthTest: false, depthWrite: false,
      uniforms: { uBeauty: { value: this.target.textures[0] }, uMask: { value: this.target.textures[1] }, uDepth: { value: this.target.depthTexture }, uPixel: { value: new T.Vector2(1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uWidth: { value: 1.2 }, uOutlineColor: { value: new T.Color('#111b2e').convertLinearToSRGB() },
        uFogDensity: { value: 0.068 },uFogLinear:{value:0},uFogRange:{value:new T.Vector2()},uHazeBlur:{value:0}, uOutlines: { value: 1 } },
    })
    this.quad = new FullScreenQuad(this.composite)
    this.size = new T.Vector2(); this.zero = new Float32Array([0, 0, 0, 0])
    this.stats = { materials: 0, renderCalls: 0, mode: 'ANIME' }
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
    const key = `${source.uuid}:${profile.hero}:${profile.glass}:${profile.mask}:${profile.grass}:${!!profile.natural}:${profile.surfaceShine ?? 1}:${profile.brush?.object.uuid || ''}`
    if (this.records.has(key)) return this.records.get(key).variant
    const record = this.sourceRecord(source), variant = source.clone()
    if (variant.isShaderMaterial) variant.uniforms = { ...source.uniforms }
    variant.name = `ANIME / ${source.name || source.type}`
    variant.onBeforeCompile = (shader, renderer) => {
      record.capture(shader, renderer)
      Object.assign(shader.uniforms, this.uniforms, combatFlashUniforms, { uAnimeSurfaceShine: { value: profile.surfaceShine ?? 1 }, uAnimeHero: { value: profile.hero }, uAnimeGlass: { value: profile.glass }, uAnimeMask: { value: profile.mask } })
      shader.fragmentShader = patchCombatFlashLighting(patchAnimeShader(shader.fragmentShader, profile))
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
    // Share those custom uniform values across cached daylight/night programs.
    for (const source of this.sources.values()) for (const list of source.custom.values()) {
      const current = list[list.length - 1]
      for (const uniform of list) uniform.value = current.value
    }
  }
  resize() {
    this.renderer.getDrawingBufferSize(this.size)
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y)
    }
    this.composite.uniforms.uPixel.value.set(1 / this.size.x, 1 / this.size.y)
  }
  preparationLights() {
    const lights=[]
    this.scene.traverse(object=>{if(object.isLight&&/^Cyclone_(headlight|amber)_/.test(object.name))lights.push(object)})
    return lights
  }
  withPreparationVariant(night,work) {
    const lights=this.preparationLights(),visibility=lights.map(l=>l.visible),previous=this.renderer.getRenderTarget()
    const inactive=this.bindings.filter(({object})=>object.isInstancedMesh&&!object.visible&&!object.instanceColor&&/^Grass_/.test(object.name))
    try {
      lights.forEach(light=>{light.visible=night});this.restore();this.apply()
      const materials=inactive.map(({object})=>object.material)
      try {for(const {object} of inactive)object.material=null;return work()}
      finally {inactive.forEach(({object},i)=>{object.material=materials[i]})}
    } finally {lights.forEach((light,i)=>{light.visible=visibility[i]});this.renderer.setRenderTarget(previous);this.restore()}
  }
  compileObject(object,targetScene=object) {
    const pending=this.renderer.compile?Promise.resolve(this.renderer.compile(object,this.camera,targetScene)):this.renderer.compileAsync(object,this.camera,targetScene)
    const programs=new Set()
    object.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(material){const p=this.renderer.properties?.get(material).currentProgram;if(p)programs.add(p)}
    }})
    // Capture the actual programs: live renders change currentProgram, and
    // Suspense/StrictMode may dispose one while compilation is still pending.
    // Never poll a deleted WebGLProgram or mistake a ready day shader for night.
    return pending.then(async()=>{
      while([...programs].some(p=>p.program&&p.isReady&&!p.isReady())){
        await this.idleTurn();if(this.disposed)return
      }
    })
  }
  compileVariant(night,object=this.scene) {
    return this.withPreparationVariant(night,()=>{
      this.renderer.setRenderTarget(this.preparationTargets.anime)
      return this.compileObject(object,this.scene)
    })
  }
  preparationObjects() {
    if(!this.renderer.properties)return [this.scene]
    const seen=new Set(),objects=[]
    for(const b of this.bindings){
      if(b.object.isInstancedMesh&&!b.object.visible&&!b.object.instanceColor&&/^Grass_/.test(b.object.name))continue
      const materials=Array.isArray(b.anime)?b.anime:[b.anime]
      const keys=materials.map(m=>this.renderer.properties.get(m).currentProgram?.cacheKey||m.uuid)
      if(keys.some(key=>!seen.has(key))){objects.push(b.object);keys.forEach(key=>seen.add(key))}
    }
    return objects
  }
  withDormantArmor(work) {
    const root=this.scene.getObjectByName('Cyclone_rear_transformation'),saved=[],batches=[]
    root?.traverse(object=>{saved.push({object,visible:object.visible,culled:object.frustumCulled});object.visible=true;object.frustumCulled=false})
    const pooled=[]
    this.scene.traverse(group=>{
      if(!group.userData.prewarmVFX)return
      group.traverse(object=>{
        saved.push({object,visible:object.visible,culled:object.frustumCulled});object.visible=true;object.frustumCulled=false
        if(object.isInstancedMesh){pooled.push({object,count:object.count});object.count=Math.max(1,object.count)}
      })
    })
    // Upload the empty Quarks buffers/atlases without spawning particles or
    // advancing any emitter. Zero-sized entries stay in this offscreen draw.
    this.scene.getObjectByName('MOSPEADA_Quarks_batches')?.traverse(object=>{
      if(!object.geometry?.isInstancedBufferGeometry)return
      batches.push({object,count:object.geometry.instanceCount,visible:object.visible,culled:object.frustumCulled})
      object.geometry.instanceCount=Math.max(1,object.geometry.instanceCount);object.visible=true;object.frustumCulled=false
    })
    try{return work()}
    finally{
      for(const {object,visible,culled} of saved){object.visible=visible;object.frustumCulled=culled}
      for(const {object,count,visible,culled} of batches){object.geometry.instanceCount=count;object.visible=visible;object.frustumCulled=culled}
      for(const {object,count} of pooled)object.count=count
    }
  }
  primeVariant(night,initial=false) {
    const shadows=this.renderer.shadowMap,autoUpdate=shadows?.autoUpdate,needsUpdate=shadows?.needsUpdate
    try {
      // Shadow samplers require real depth maps, including headlights that
      // were invisible by day. Null color-texture fallbacks are invalid here.
      const missing=night&&this.preparationLights().some(light=>light.castShadow&&!light.shadow.map)
      if(shadows){shadows.autoUpdate=initial||missing;shadows.needsUpdate=initial||missing}
      this.sync()
      this.withPreparationVariant(night,()=>this.withDormantArmor(()=>this.drawSceneTarget(this.preparationTargets.anime)))
    } finally {if(shadows){shadows.autoUpdate=autoUpdate;shadows.needsUpdate=needsUpdate}}
  }
  warm() {
    if(this.warming||this.ready||this.error||this.disposed||!this.scene.getObjectByName('Cyclone_riding_vehicle'))return
    const night=this.preparationLights().some(light=>light.visible)
    this.initialNight=night;this.preparedLighting ||=new Set()
    this.stats.preparation={startMs:performance.now(),initialMode:'ANIME',initialNight:night,initialGLError:this.renderer.getContext?.().getError()||0}
    this.preparationTargets ||=createPreparationTargets(this.target?.samples||0)
    const assembly=this.scene.getObjectByName('Cyclone_riding_vehicle').userData.armorPreparation
    this.warming=Promise.resolve(assembly).then(()=>{
      if(this.disposed)return
      this.collect();this.sync()
      return Promise.all([this.compileVariant(night),this.compileObject(this.quad._mesh)])
    }).then(()=>{
      if(this.disposed)return
      this.stats.preparation.compileMs=performance.now()-this.stats.preparation.startMs
      const primeStart=performance.now();this.primeVariant(night,true)
      // Only the starting image gets a full-sized first draw. No repeated
      // canvas captures or synchronous reflection of hundreds of unused shaders.
      this.drawSceneTarget()
      this.preparedLighting.add(night);this.ready=true
      Object.assign(this.stats.preparation,{primeMs:performance.now()-primeStart,totalMs:performance.now()-this.stats.preparation.startMs,programs:this.renderer.info.programs.length})
    }).catch(error=>{this.error=error.message})
  }
  idleTurn() {
    return new Promise(resolve=>{
      const done=()=>{
        if(!this.disposed&&this.allowBackgroundWork?.()===false){
          const id=setTimeout(done,50);this.pendingIdle=()=>{clearTimeout(id);this.pendingIdle=null;resolve()};return
        }
        this.pendingIdle=null;resolve()
      }
      if(typeof requestIdleCallback==='function'){
        const id=requestIdleCallback(done,{timeout:50});this.pendingIdle=()=>{cancelIdleCallback(id);done()}
      }else{const id=setTimeout(done,0);this.pendingIdle=()=>{clearTimeout(id);done()}}
    })
  }
  async prepareProgramBindings(programs) {
    let i=0
    while(i<programs.length){
      await this.idleTurn();if(this.disposed)return
      const deadline=performance.now()+4
      do{const p=programs[i++];if(p.program){p.getUniforms?.();p.getAttributes?.()}}while(i<programs.length&&performance.now()<deadline)
    }
  }
  prepareViewVisibility(camera){
    // Reuse the existing distance/LOD selectors; keep all normal culling.
    this.scene.traverse(object=>{object.updateDistance?.(camera);object.updateVisibility?.(camera)})
  }
  async waitForPreparedGpu(timeoutMs=3000){
    const gl=this.renderer.getContext?.();if(!gl?.fenceSync||gl.isContextLost())return true
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!fence)return
    const deadline=performance.now()+timeoutMs
    gl.flush()
    try{while(!this.disposed&&!gl.isContextLost()){
      const result=gl.clientWaitSync(fence,0,0)
      if(result!==gl.TIMEOUT_EXPIRED)return true
      // This fence only prewarms future views. An unresponsive driver must not
      // keep the loader alive forever after the current frame already drew.
      if(performance.now()>=deadline){if(this.stats.preparation)this.stats.preparation.gpuFenceDeferred=true;return false}
      await this.idleTurn()
    }}finally{if(!gl.isContextLost())gl.deleteSync(fence)}
  }
  prepareOpening(){
    if(this.openingWork||!this.ready||this.disposed)return this.openingWork
    const start=performance.now()
    this.openingWork=Promise.resolve().then(()=>this.prepareTextures()).then(()=>this.prepareStartupViews()).then(()=>{
      if(this.disposed)return
      this.openingReady=true;this.stats.preparation.openingMs=performance.now()-start
    }).catch(error=>{if(!this.disposed)this.error=error.message})
    return this.openingWork
  }
  async prepareTextures(){
    // Parsing/preloading an image does not upload it to the GPU. Include
    // dormant combat maps/atlases and batching textures before first use.
    if(!this.renderer?.initTexture)return
    const textures=new Set(),collect=value=>{
      if(value?.isTexture)textures.add(value)
      else if(Array.isArray(value))value.forEach(collect)
    }
    for(const {source,variant} of this.records.values())for(const material of [source,variant]){
      Object.values(material).forEach(collect)
      for(const uniform of Object.values(material.uniforms||{}))collect(uniform?.value)
    }
    const start=performance.now()
    for(const texture of textures){await this.idleTurn();if(this.disposed)return;this.renderer.initTexture(texture)}
    this.stats.preparation.uploadedTextures=textures.size;this.stats.preparation.textureMs=performance.now()-start
  }
  async prepareStartupViews(){
    const views=this.startupViews?.()||[];if(!views.length)return
    const start=performance.now(),camera=this.camera,shadows=this.renderer.shadowMap,oldAuto=shadows?.autoUpdate,oldNeeds=shadows?.needsUpdate
    for(const entry of views){
      const view=entry.camera||entry,root=entry.root,visible=root?.visible
      await this.idleTurn();if(this.disposed)return
      // Tiny MRT with the same formats/MSAA as gameplay. Upload VAOs, batch
      // draw buffers and textures for every part of the shot before its fade.
      // Initial lighting preparation already rendered the static shadow maps.
      try{
        if(shadows){shadows.autoUpdate=false;shadows.needsUpdate=false}
        if(root)root.visible=true
        this.prepareViewVisibility(view);entry.updateVisibility?.(view)
        this.camera=view;this.collect();this.sync()
        this.withPreparationVariant(this.initialNight,()=>this.drawSceneTarget(this.preparationTargets.anime))
      }finally{
        this.camera=camera;this.prepareViewVisibility(camera);entry.updateVisibility?.(camera)
        if(root)root.visible=visible
        if(shadows){shadows.autoUpdate=oldAuto;shadows.needsUpdate=oldNeeds}
      }
    }
    await this.waitForPreparedGpu()
    this.stats.preparation.startupViews=views.length;this.stats.preparation.startupViewsMs=performance.now()-start
  }
  prepareNight(underLoader=false) {
    if(this.backgroundWork||!this.ready||this.disposed)return this.backgroundWork
    this.backgroundWork=(async()=>{
      if(this.openingWork)await this.openingWork
      if(this.disposed)return
      const start=performance.now(),jobs=[false,true]
      this.collect();this.sync()
      for(const night of jobs){
        if(this.preparedLighting.has(night))continue
        if(underLoader){
          // Nothing is playable behind the opaque loader. Submit the lighting
          // variant once so KHR parallel compilation can run all programs
          // together, rather than waiting for ~90 individual GPU jobs in turn.
          await this.idleTurn();if(this.disposed)return
          const existing=new Set(this.renderer.info.programs)
          await this.compileVariant(night);if(this.disposed)return
          await this.prepareProgramBindings(this.renderer.info.programs.filter(p=>!existing.has(p)));if(this.disposed)return
        }else{
          // During gameplay, small submissions still yield to transformation.
          for(const object of this.preparationObjects()){
            await this.idleTurn();if(this.disposed)return
            const existing=new Set(this.renderer.info.programs)
            await this.compileVariant(night,object);if(this.disposed)return
            await this.prepareProgramBindings(this.renderer.info.programs.filter(p=>!existing.has(p)));if(this.disposed)return
          }
        }
        await this.idleTurn();if(this.disposed)return
        this.primeVariant(night)
        this.preparedLighting.add(night)
      }
      this.nightReady=true;this.stats.preparation.backgroundMs=performance.now()-start
      this.preparationTargets?.dispose();this.preparationTargets=null
    })().catch(error=>{if(!this.disposed)this.error=error.message})
    return this.backgroundWork
  }
  drawSceneTarget(target = this.target) {
    const { renderer, scene, camera } = this
    camera.updateMatrixWorld();syncCombatFlashLighting(camera)
    const previous = renderer.getRenderTarget(), background = scene.background, clearColor = renderer.getClearColor(new T.Color()), clearAlpha = renderer.getClearAlpha(), autoClear = renderer.autoClear
    try {
      this.apply()
      renderer.setRenderTarget(target)
      renderer.setClearColor(background?.isColor ? background : clearColor, 1)
      renderer.clear()
      if (target.textures.length > 1) renderer.getContext().clearBufferfv(renderer.getContext().COLOR, 1, this.zero)
      scene.background = null; renderer.autoClear = false
      renderer.render(scene, camera)
      if(target===this.target)this.stats.renderTriangles=renderer.info.render.triangles
      return renderer.info.render.calls
    } finally {
      scene.background = background; renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha)
      this.restore(); renderer.setRenderTarget(previous)
    }
  }
  render(config, day) {
    const { renderer, scene, camera } = this
    if(this.warming&&!this.ready&&!this.error)return
    this.collect(); this.resize(); this.sync()
    this.brush?.sync(camera)
    Object.assign(this.uniforms.uAnimeCel, { value: config.cel ? 1 : 0 }); this.uniforms.uAnimeLevels.value = config.levels
    this.uniforms.uAnimeShadow.value = config.shadow; this.uniforms.uAnimeHighlights.value = config.highlights; this.uniforms.uAnimeDay.value = day
    const uniforms = this.composite.uniforms
    uniforms.uNear.value = camera.near; uniforms.uFar.value = camera.far
    uniforms.uWidth.value = config.width * renderer.getPixelRatio()
    uniforms.uOutlineColor.value.set(config.color).convertLinearToSRGB()
    uniforms.uFogDensity.value = scene.fog?.density || 0; uniforms.uOutlines.value = config.outlines ? 1 : 0
    const distanceHaze=!!scene.fog?.desertHaze
    this.uniforms.uDistanceHaze.value=distanceHaze?1:0
    this.uniforms.uDistanceHazeRange.value.set(scene.fog?.near??0,scene.fog?.far??1)
    uniforms.uFogLinear.value=scene.fog?.isFog||distanceHaze?1:0
    uniforms.uFogRange.value.set(scene.fog?.near??0,scene.fog?.far??1)
    uniforms.uHazeBlur.value=scene.fog?.desertHaze?.blur??0
    this.stats.mode = 'ANIME'
    if (!this.ready && !this.error) {
      this.stats.renderCalls = 0;this.warm();return
    }
    if (this.error) {
      renderer.render(scene,camera);this.stats.renderCalls=renderer.info.render.calls;return
    }
    this.stats.renderCalls = this.drawSceneTarget()
    renderer.setRenderTarget(null); this.quad.render(renderer)
    this.stats.renderCalls += renderer.info.render.calls
    this.stats.renderTriangles+=renderer.info.render.triangles
    publishRenderMetrics(renderer,this.stats)
  }
  dispose() {
    this.disposed = true; this.pendingIdle?.(); this.restore()
    for (const record of this.sources.values()) { record.material.onBeforeCompile = record.compile; record.material.customProgramCacheKey = record.cacheKey }
    for (const record of this.records.values()) record.variant.dispose()
    this.brush?.dispose()
    this.preparationTargets?.dispose(); this.preparationTargets = null
    this.target.dispose(); this.composite.dispose(); this.quad.dispose()
  }
}
