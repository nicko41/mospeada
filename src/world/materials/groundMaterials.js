import { useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { timeOfDayState } from '../TimeOfDay'

const FIELD_TEXTURES = [
  '/textures/ground/field/grass50.jpg',
  '/textures/ground/field/normal.jpg',
  '/textures/ground/field/roughness.jpg',
]

const ROAD_TEXTURES = [
  '/textures/ground/road/albedo.jpg',
  '/textures/ground/road/normal.jpg',
  '/textures/ground/road/roughness.jpg',
]

function configureTextures(textures, anisotropy) {
  textures.forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = anisotropy
  })
  textures[0].colorSpace = THREE.SRGBColorSpace
  return textures
}

function addMacroVariation(material, key, frequency, colorStrength, roughnessStrength, edgeFade = false) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorldPosition;
        ${edgeFade ? 'attribute float aRoadBlend; varying float vRoadBlend;' : ''}`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGroundWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ${edgeFade ? 'vRoadBlend = aRoadBlend;' : ''}`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorldPosition;
        ${edgeFade ? 'varying float vRoadBlend;' : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float groundMacro = sin(vGroundWorldPosition.x * ${frequency.toFixed(4)}
          + sin(vGroundWorldPosition.z * ${(frequency * 0.73).toFixed(4)}) * 1.7);
        groundMacro += sin(vGroundWorldPosition.z * ${(frequency * 0.41).toFixed(4)} + 2.3) * 0.55;
        groundMacro = groundMacro * 0.25 + 0.5;
        diffuseColor.rgb *= mix(${(1 - colorStrength).toFixed(3)}, ${(1 + colorStrength).toFixed(3)}, groundMacro);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor
          + (groundMacro - 0.5) * ${roughnessStrength.toFixed(3)}, 0.55, 1.0);`,
      )

    if (edgeFade) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `diffuseColor.a *= smoothstep(0.0, 1.0, vRoadBlend);
        #include <opaque_fragment>`,
      )
    }
  }
  material.customProgramCacheKey = () => `ground-macro-${key}`
  return material
}

function usePBRTextures(paths) {
  const textures = useLoader(THREE.TextureLoader, paths)
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  return useMemo(
    () => configureTextures(textures, Math.min(8, maxAnisotropy)),
    [maxAnisotropy, textures],
  )
}

export function useFieldGroundMaterial() {
  const [map, normalMap, roughnessMap] = usePBRTextures(FIELD_TEXTURES)
  return useMemo(() => addMacroVariation(new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0,
    normalScale: new THREE.Vector2(0.58, 0.58),
  }), 'field', 0.035, 0.09, 0.1), [map, normalMap, roughnessMap])
}

export function useDirtRoadMaterials() {
  const [map, normalMap, roughnessMap] = usePBRTextures(ROAD_TEXTURES)
  const roadShader = useRef(null)
  useFrame(() => {
    if (roadShader.current) roadShader.current.uniforms.uRoadDayFill.value = timeOfDayState.value * 1.35
  })
  return useMemo(() => {
    const road = addMacroVariation(new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      color: '#696258',
      roughness: 0.74,
      metalness: 0.015,
      normalScale: new THREE.Vector2(0.36, 0.36),
      transparent: true,
      depthWrite: false,
    }), 'road-feathered', 0.052, 0.065, 0.08, true)
    const addRoadVariation = road.onBeforeCompile
    road.onBeforeCompile = (shader) => {
      addRoadVariation(shader)
      shader.uniforms.uRoadDayFill = { value: 0 }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRoadDayFill;')
        .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * uRoadDayFill;\n#include <opaque_fragment>')
      roadShader.current = shader
    }
    road.customProgramCacheKey = () => 'road-feathered-day-fill-v1'

    return road
  }, [map, normalMap, roughnessMap])
}
