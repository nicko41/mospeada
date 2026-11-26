import {useGLTF} from '../loading/resources.js'
import { useLayoutEffect, useMemo, useRef } from 'react'

import * as THREE from 'three'
import { roadCenterAt, terrainHeight } from './terrain'
import CarDriving from './CarDriving'
import CarHeadlights from './CarHeadlights'
import { registerColliders, boxCollider } from '../player/collisionWorld'

const PARK_Z = 3
const PARK_X = roadCenterAt(PARK_Z) + 6.6

function muddyPaint(source, ground) {
  const material = source.clone()
  material.metalness = Math.min(material.metalness, 0.12)
  material.roughness = 0.94
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMudGround = ground
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMudPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMudPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMudPosition;
        uniform float uMudGround;
        float mudHash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        float mudNoise(vec3 p) {
          vec3 cell = floor(p);
          vec3 blend = fract(p);
          blend = blend * blend * (3.0 - 2.0 * blend);
          return mix(
            mix(mix(mudHash(cell), mudHash(cell + vec3(1.0, 0.0, 0.0)), blend.x),
                mix(mudHash(cell + vec3(0.0, 1.0, 0.0)), mudHash(cell + vec3(1.0, 1.0, 0.0)), blend.x), blend.y),
            mix(mix(mudHash(cell + vec3(0.0, 0.0, 1.0)), mudHash(cell + vec3(1.0, 0.0, 1.0)), blend.x),
                mix(mudHash(cell + vec3(0.0, 1.0, 1.0)), mudHash(cell + vec3(1.0, 1.0, 1.0)), blend.x), blend.y), blend.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mudHeight = max(0.0, vMudPosition.y - uMudGround);
        float broadDirt = mudNoise(vMudPosition * 3.2);
        float fineDirt = mudNoise(vMudPosition * 18.0);
        float lowerMud = 1.0 - smoothstep(0.4, 1.55, mudHeight + (broadDirt - 0.5) * 0.58);
        float raisedGrime = smoothstep(0.49, 0.72, broadDirt)
          * (1.0 - smoothstep(1.0, 2.1, mudHeight));
        float splashes = smoothstep(0.58, 0.79, fineDirt)
          * (1.0 - smoothstep(1.0, 2.25, mudHeight));
        float mud = clamp(lowerMud * (0.7 + broadDirt * 0.22)
          + raisedGrime * 0.27 + splashes * 0.46, 0.0, 0.91);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.084, 0.058), mud);`)
  }
  material.customProgramCacheKey = () => 'rangerover-muddy-paint-v2'
  return material
}

export default function ParkedRangeRover({ drivable = true }) {
  const car = useRef()
  const ground = useMemo(() => ({ value: terrainHeight(PARK_X, PARK_Z) + 0.025 }), [])
  const { scene } = useGLTF('/models/rangerover.glb')
  const { model, offset, sideX, colliderSize } = useMemo(() => {
    const model = scene.clone(true)
    const bounds = new THREE.Box3().setFromObject(model)
    const center = bounds.getCenter(new THREE.Vector3())
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#182122', transparent: true, opacity: 0.72,
      roughness: 0.38, metalness: 0, depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true, envMapIntensity: 0,
    })
    const muddyMaterials = new Map()
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true
        object.receiveShadow = true
        const replace = (material) => {
          if (material.name === 'Glass') return glass
          if (!muddyMaterials.has(material)) muddyMaterials.set(material, muddyPaint(material, ground))
          return muddyMaterials.get(material)
        }
        object.material = Array.isArray(object.material)
          ? object.material.map(replace)
          : replace(object.material)
      }
    })
    return { model, offset: [-center.x, -bounds.min.y, -center.z], sideX: bounds.min.x - center.x, colliderSize: bounds.getSize(new THREE.Vector3()).toArray() }
  }, [scene, ground])

  useLayoutEffect(() => {
    if (drivable) return
    model.updateWorldMatrix(true, true)
    return registerColliders([boxCollider(new THREE.Box3().setFromObject(model), { walkable: false, environment: true })])
  }, [drivable, model])

  return (
    <group ref={car} position={[PARK_X, terrainHeight(PARK_X, PARK_Z) + 0.025, PARK_Z]} rotation-y={Math.PI / 2 + 0.12}>
      {drivable && <CarDriving car={car} size={colliderSize} ground={ground} />}
      <CarHeadlights />
      <primitive object={model} position={offset} />
      <mesh position={[sideX - 0.055, 1.98, -0.84]} castShadow>
        <boxGeometry args={[0.035, 0.72, 0.045]} />
        <meshBasicMaterial color="#202727" />
      </mesh>
    </group>
  )
}

useGLTF.preload('/models/rangerover.glb')
