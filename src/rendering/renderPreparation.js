import { HalfFloatType, LinearSRGBColorSpace, NoColorSpace, RedFormat, UnsignedByteType, WebGLRenderTarget } from 'three'

export function startupRenderReady(render,openingPhase,prepareRoute=false){
  return !!render.error||!!render.ready&&((!prepareRoute&&openingPhase==='done')||!!render.openingReady)
}
export function canPrepareLighting(ready,gameReady,openingPhase){
  return !!ready&&!!gameReady&&openingPhase==='done'
}

// These targets are only for hidden preparation draws. The live render target,
// camera, textures, geometry and shadow-map resolution are never reduced.
export function createPreparationTargets(samples = 0) {
  const anime = new WebGLRenderTarget(16, 16, { count: 2, type: HalfFloatType, samples })
  anime.textures[0].colorSpace = LinearSRGBColorSpace
  anime.textures[1].type = UnsignedByteType
  anime.textures[1].format = RedFormat
  anime.textures[1].colorSpace = NoColorSpace
  return { anime, dispose() { anime.dispose() } }
}

// Hero, glass, shadow mask and upholstery shine are uniforms. Their values
// require separate material instances, but not separately compiled programs.
export function animeProgramKey(profile) {
  return `mospeada-anime-v3-combat-flash|grass:${!!profile.grass}|brush:${!!profile.brush}${profile.natural ? '|natural:true' : ''}`
}
