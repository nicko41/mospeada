import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { phoneLightState } from '../player/PhoneLight'
import { createGrassModelGeometry } from './grassModelGeometry'
import { grassFragmentShader, grassVertexShader } from './grassShaders'
import { roadCenterAt, terrainHeight } from './terrain'

const GRASS_COUNTS = [90, 8500]

const FIELD_WIDTH = 120
const FIELD_START_Z = 46
const FIELD_LENGTH = 150
const ROAD_CLEARANCE = 3.9

function createPRNG(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function fract(value) {
  return value - Math.floor(value)
}

function hashToSeed(cellX, cellZ) {
  return [
    fract(Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453),
    fract(Math.sin(cellX * 269.5 + cellZ * 183.3) * 43758.5453),
  ]
}

function hashToAngle(cellX, cellZ) {
  return fract(Math.sin(cellX * 419.2 + cellZ * 371.9) * 43758.5453)
}

function findClump(x, z) {
  const cellSize = 2.8
  const cellX = Math.floor(x / cellSize)
  const cellZ = Math.floor(z / cellSize)
  let closest = { distance: Infinity, x: 0, z: 0, cellX: 0, cellZ: 0 }

  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const neighborX = cellX + offsetX
      const neighborZ = cellZ + offsetZ
      const [seedX, seedZ] = hashToSeed(neighborX, neighborZ)
      const centerX = (neighborX + seedX) * cellSize
      const centerZ = (neighborZ + seedZ) * cellSize
      const distance = (x - centerX) ** 2 + (z - centerZ) ** 2

      if (distance < closest.distance) {
        closest = { distance, x: centerX, z: centerZ, cellX: neighborX, cellZ: neighborZ }
      }
    }
  }

  return {
    angle: hashToAngle(closest.cellX, closest.cellZ) * Math.PI * 2,
    center: [closest.x - x, closest.z - z],
    distance: Math.min(Math.sqrt(closest.distance) / cellSize, 1),
  }
}

function GrassVariant({ geometry, count, seed, broad }) {
  const field = useRef()
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWindDirection: { value: new THREE.Vector2(0.92, 0.38).normalize() },
      uWindStrength: { value: 1.05 },
      uColorSeed: { value: new THREE.Vector2(17.4, 63.2) },
      uFogColor: { value: new THREE.Color('#0b0e0f') },
      uFogDensity: { value: 0.068 },
      uPhonePosition: { value: new THREE.Vector3() },
      uPhoneDirection: { value: new THREE.Vector3(0, 0, -1) },
      uPhoneEnabled: { value: 1 },
      uPhoneDistance: { value: 38 },
      uFadeStart: { value: 18 },
      uFadeEnd: { value: 48 },
    },
  }), [])

  useLayoutEffect(() => {
    const random = createPRNG(seed)
    const transform = new THREE.Object3D()
    const clumpAngles = new Float32Array(count)
    const clumpCenters = new Float32Array(count * 2)
    const clumpDistances = new Float32Array(count)
    const accents = new Float32Array(count)
    const colorVariations = new Float32Array(count)

    let placed = 0
    while (placed < count) {
      const x = (random() - 0.5) * FIELD_WIDTH
      const z = FIELD_START_Z - random() * FIELD_LENGTH
      const roadDistance = Math.abs(x - roadCenterAt(z))
      const irregularClearance = ROAD_CLEARANCE
        + Math.sin(z * 0.29) * 0.28
        + Math.sin(z * 0.073 + 1.4) * 0.22
      const edgeDensity = THREE.MathUtils.smoothstep(roadDistance, irregularClearance, 9)
      const patchDensity = 0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.09) * 2.2)
      const placementDensity = 0.62 + (1 - edgeDensity) * 0.24 + patchDensity * 0.08

      if (roadDistance < irregularClearance + (broad ? 0.7 : 0.25)
        || random() > placementDensity) {
        continue
      }

      const clump = findClump(x, z)
      const heightRoll = random()
      const scale = heightRoll < 0.82
        ? 0.72 + random() * 0.4
        : 1.12 + random() * 0.2
      transform.position.set(x, terrainHeight(x, z) - 0.012, z)
      transform.rotation.set((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.42)
      transform.scale.set(scale * (0.72 + random() * 0.48), scale, scale)
      transform.updateMatrix()
      field.current.setMatrixAt(placed, transform.matrix)

      clumpAngles[placed] = clump.angle + (random() - 0.5) * 0.85
      clumpCenters.set(clump.center, placed * 2)
      clumpDistances[placed] = clump.distance
      accents[placed] = random() < 0.025 ? 1 : 0
      colorVariations[placed] = random()
      placed += 1
    }

    geometry.setAttribute('aClumpAngle', new THREE.InstancedBufferAttribute(clumpAngles, 1))
    geometry.setAttribute('aClumpCenter', new THREE.InstancedBufferAttribute(clumpCenters, 2))
    geometry.setAttribute('aClumpDistance', new THREE.InstancedBufferAttribute(clumpDistances, 1))
    geometry.setAttribute('aAccent', new THREE.InstancedBufferAttribute(accents, 1))
    geometry.setAttribute('aColorVariation', new THREE.InstancedBufferAttribute(colorVariations, 1))
    field.current.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    field.current.instanceMatrix.needsUpdate = true
  }, [geometry, count, seed, broad])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const gust = Math.sin(time * 0.38) * 0.58 + Math.sin(time * 0.14 + 1.8) * 0.42
    const drift = Math.sin(time * 0.12) * 0.25
    material.uniforms.uTime.value = time
    material.uniforms.uWindStrength.value = 0.95 + Math.max(gust, 0) * 0.58
    material.uniforms.uWindDirection.value.set(Math.cos(0.38 + drift), Math.sin(0.38 + drift))
    material.uniforms.uPhonePosition.value.copy(phoneLightState.position)
    material.uniforms.uPhoneDirection.value.copy(phoneLightState.direction)
    material.uniforms.uPhoneEnabled.value = phoneLightState.enabled ? 1 : 0
  })

  return (
    <instancedMesh
      ref={field}
      args={[geometry, material, count]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}

export default function GrassField() {
  const grass01 = useGLTF('/models/grass01.glb')
  const grass02 = useGLTF('/models/grass02.glb')
  const denseGeometry = useMemo(
    () => createGrassModelGeometry(grass01.scene, 0.43), [grass01.scene],
  )
  const tallGeometry = useMemo(
    () => createGrassModelGeometry(grass02.scene, 0.88), [grass02.scene],
  )

  return (
    <>
      <GrassVariant geometry={tallGeometry} count={GRASS_COUNTS[1]} seed={27051991} broad={false} />
      <GrassVariant geometry={denseGeometry} count={GRASS_COUNTS[0]} seed={918204} broad />
    </>
  )
}

useGLTF.preload('/models/grass01.glb')
useGLTF.preload('/models/grass02.glb')
