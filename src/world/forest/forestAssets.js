import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, Color, LoadingManager, Matrix4, MeshLambertMaterial, TextureLoader } from 'three'
import { FOREST_ASSETS } from './forestConfig.js'
import { prepareForestGeometry } from './forestGeometry.js'
import { withForestLod } from './forestLod.js'
import { FOREST_PALETTE_VERSION, forestMaterialPalette } from './forestPalette.js'

const manager = new LoadingManager(), textureLoader = new TextureLoader(manager), textures = new Map()
manager.addHandler(/\.png$/i, {
  load(url, onLoad, onProgress, onError) {
    let entry = textures.get(url)
    if (!entry) {
      entry = {}
      entry.ready = new Promise((resolve, reject) => { entry.texture = textureLoader.load(url, resolve, onProgress, reject) })
      textures.set(url, entry); entry.ready.catch(() => textures.delete(url))
    }
    entry.ready.then(onLoad, onError)
    return entry.texture
  },
})
const loader = new GLTFLoader(manager)
const urls = FOREST_ASSETS.map(asset => `/models/glTF/${asset.name}.gltf`)
export const useForestAssets = () => useLoader(loader, urls)

export function forestMaterial(source, kind) {
  const bark = /Bark/.test(source.name), rock = kind === 'rock' || kind === 'pebble'
  const paintedLeaves=/Leaves/.test(source.name)&&(kind==='tree'||kind==='shrub')
  const palette=forestMaterialPalette(kind,bark),low=new Color(rock?'#657e85':palette.low)
  const high=new Color(rock?'#acbcb1':palette.high),mid=new Color(palette.mid)
  const material = new MeshLambertMaterial({ name: `Forest / ${source.name}`, map: source.map,
    side: source.side, alphaTest: source.alphaTest || 0, vertexColors: !rock,
    transparent: false, depthWrite: true, fog: true,
    emissive: rock?'#183b43':palette.emissive, emissiveIntensity: rock?.22:palette.emissiveIntensity })
  material.userData.forest = true
  material.onBeforeCompile = shader => {
    shader.uniforms.uForestLow = { value: low }; shader.uniforms.uForestHigh = { value: high };shader.uniforms.uForestMid={value:mid}
    shader.fragmentShader = 'uniform vec3 uForestLow;\nuniform vec3 uForestHigh;\nuniform vec3 uForestMid;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', paintedLeaves ? `
      #include <map_fragment>
      // Retain the source alpha; authored runtime leaf colors carry the paint.
      diffuseColor.rgb = vec3(1.0);
    ` : bark||rock ? `
      #include <map_fragment>
      // Preserve the original alpha silhouette and painted value structure,
      // with neutral bark or the unchanged rock palette.
      float forestValue = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
      diffuseColor.rgb = mix(uForestLow, uForestHigh, smoothstep(.015, .65, forestValue));
    ` : `
      #include <map_fragment>
      // Source low-plant maps occupy a dark value range. Remap that range to
      // three moss/olive values instead of compressing everything into cyan.
      float forestValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      float forestTone=smoothstep(.018,.36,forestValue);
      diffuseColor.rgb=mix(uForestLow,uForestMid,smoothstep(0.0,.62,forestTone));
      diffuseColor.rgb=mix(diffuseColor.rgb,uForestHigh,smoothstep(.62,1.0,forestTone));
    `)
    if(!paintedLeaves)shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      // Retain baked AO without turning the painted canopy into black cutouts.
      #if defined(USE_COLOR_ALPHA)
        diffuseColor *= vec4(.55 + .45 * vColor.rgb, vColor.a);
      #elif defined(USE_COLOR)
        diffuseColor.rgb *= .55 + .45 * vColor.rgb;
      #endif
    `)
  }
  material.customProgramCacheKey = () => `forest-painted-palette/${FOREST_PALETTE_VERSION}/${kind}/${bark}/${paintedLeaves}`
  return withForestLod(material,kind)
}

export function prepareForestAssets(loaded) {
  const materials = new Map()
  return FOREST_ASSETS.map((definition, i) => {
    const scene = loaded[i].scene
    scene.updateMatrixWorld(true)
    const originalBounds = new Box3().setFromObject(scene), bounds=new Box3(),parts = []
    scene.traverse(mesh => {
      if (!mesh.isMesh) return
      const source = mesh.material
      const key = `${source.name}/${definition.kind}`
      if (!materials.has(key)) materials.set(key, forestMaterial(source, definition.kind))
      const authored=definition.kind==='tree'||definition.kind==='shrub'
      const geometry=authored?prepareForestGeometry(mesh.geometry,mesh.matrixWorld,definition.kind,source.name,originalBounds,definition.name):mesh.geometry
      const transform=authored?new Matrix4():mesh.matrixWorld.clone()
      if(!geometry.boundingBox)geometry.computeBoundingBox()
      bounds.union(geometry.boundingBox.clone().applyMatrix4(transform))
      parts.push({ geometry, material: materials.get(key), transform })
    })
    return { ...definition, bounds, parts }
  })
}
