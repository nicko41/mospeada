import { HalfFloatType, LinearSRGBColorSpace, NoColorSpace, RedFormat, UnsignedByteType, WebGLRenderTarget } from 'three'

// These targets are only for hidden preparation draws. The live render target,
// camera, textures, geometry and shadow-map resolution are never reduced.
export function createPreparationTargets(samples = 0) {
  const anime = new WebGLRenderTarget(16, 16, { count: 2, type: HalfFloatType, samples })
  anime.textures[0].colorSpace = LinearSRGBColorSpace
  anime.textures[1].type = UnsignedByteType
  anime.textures[1].format = RedFormat
  anime.textures[1].colorSpace = NoColorSpace
  const pbr = new WebGLRenderTarget(16, 16, { type: HalfFloatType, samples })
  pbr.texture.colorSpace = LinearSRGBColorSpace
  return { anime, pbr, dispose() { anime.dispose(); pbr.dispose() } }
}

// Hero, glass, shadow mask and upholstery shine are uniforms. Their values
// require separate material instances, but not separately compiled programs.
export function animeProgramKey(profile) {
  return `mospeada-anime-v2|grass:${!!profile.grass}|brush:${!!profile.brush}`
}
