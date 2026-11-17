import { useMemo } from 'react'
import * as THREE from 'three'
import { HIGHWAY_CLEARANCE, HIGHWAY_ROAD_HEIGHT, HIGHWAY_Z, highwayLiftAt } from './sectors/highwayProfile'
import { roadCenterAt, terrainHeight } from './terrain'

const PUDDLE_COUNT = 145
const EDGE_POINTS = 14

function hash(value) {
  const result = Math.sin(value * 91.73 + 17.41) * 43758.5453
  return result - Math.floor(result)
}

function makePuddlesGeometry(onlyAsphalt) {
  const vertices = []
  const indices = []
  const blends = []

  for (let index = 0; index < PUDDLE_COUNT; index += 1) {
    const roadside = index < 36
    const rural = index >= 36 && index < 72
    const asphalt = index >= 72 && index < 96
    if (asphalt !== onlyAsphalt) continue
    const ruralIndex = index - 36
    const asphaltIndex = index - 72
    const ruralZ = ruralIndex < 22
      ? 39 - ruralIndex * 3.35
      : -108 - (ruralIndex - 22) * 4.6
    const x = roadside
      ? (index === 0 ? 0 : -112 + index * 6.4)
      : rural
        ? roadCenterAt(ruralZ) + (ruralIndex % 2 === 0 ? -1 : 1) * (1.25 + hash(index * 5 + 1) * 1.35)
        : asphalt
          ? -105 + asphaltIndex * 9.1
          : (hash(index * 5 + 1) - 0.5) * 170
    const z = roadside
      ? HIGHWAY_Z + (index === 0 || index % 2 === 1 ? 1 : -1) * (13.45 + hash(index * 5 + 2) * 0.45)
      : rural
        ? ruralZ
        : asphalt
          ? HIGHWAY_Z + (asphaltIndex % 2 === 0 ? -1 : 1) * (8.85 + hash(index * 5 + 2) * 0.48)
          : 48 - hash(index * 5 + 2) * 215
    if (!roadside && !rural && !asphalt && Math.abs(x - roadCenterAt(z)) < 5.5) continue
    if (!roadside && !rural && !asphalt && Math.abs(z - HIGHWAY_Z) < HIGHWAY_CLEARANCE + 2.5) continue

    const radiusX = roadside ? 0.85 + hash(index * 5 + 3) * 1.15
      : rural ? 0.34 + hash(index * 5 + 3) * 0.4
        : asphalt ? 0.9 + hash(index * 5 + 3) * 0.7
          : 0.75 + hash(index * 5 + 3) * 1.6
    const radiusZ = roadside ? 0.22 + hash(index * 5 + 4) * 0.27
      : rural ? 0.56 + hash(index * 5 + 4) * 0.77
        : asphalt ? 0.24 + hash(index * 5 + 4) * 0.16
          : 0.38 + hash(index * 5 + 4) * 0.85
    const waterHeight = (px, pz) => terrainHeight(px, pz)
      + (roadside ? highwayLiftAt(px, pz) - 0.05
        : rural ? 0.049
          : asphalt ? HIGHWAY_ROAD_HEIGHT + 0.067 : 0.038)
    const vertexStart = vertices.length / 3
    vertices.push(x, waterHeight(x, z), z)
    blends.push(1)

    for (let point = 0; point < EDGE_POINTS; point += 1) {
      const angle = point / EDGE_POINTS * Math.PI * 2
      const irregularity = 0.78 + hash(index * 31 + point) * 0.35
      const px = x + Math.cos(angle) * radiusX * irregularity
      const pz = z + Math.sin(angle) * radiusZ * irregularity
      vertices.push(px, waterHeight(px, pz), pz)
      blends.push(0)
    }

    for (let point = 0; point < EDGE_POINTS; point += 1) {
      indices.push(vertexStart, vertexStart + 1 + (point + 1) % EDGE_POINTS, vertexStart + 1 + point)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('aPuddleBlend', new THREE.Float32BufferAttribute(blends, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeWaterMaterial(asphalt) {
    const water = new THREE.MeshPhysicalMaterial({
      color: asphalt ? '#51544e' : '#2d302d',
      emissive: asphalt ? '#282a25' : '#191c19',
      emissiveIntensity: asphalt ? 0.22 : 0.16,
      roughness: asphalt ? 0.27 : 0.4,
      metalness: 0,
      clearcoat: asphalt ? 0.48 : 0.28,
      clearcoatRoughness: asphalt ? 0.24 : 0.38,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    water.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPuddleBlend;\nvarying float vPuddleBlend;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuddleBlend = aPuddleBlend;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPuddleBlend;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep(0.0, 0.72, vPuddleBlend) * 0.76;\n#include <opaque_fragment>')
    }
    water.customProgramCacheKey = () => 'puddle-soft-edge-v1'
    return water
}

export default function Puddles() {
  const groundGeometry = useMemo(() => makePuddlesGeometry(false), [])
  const asphaltGeometry = useMemo(() => makePuddlesGeometry(true), [])
  const groundMaterial = useMemo(() => makeWaterMaterial(false), [])
  const asphaltMaterial = useMemo(() => makeWaterMaterial(true), [])

  return (
    <>
      <mesh geometry={groundGeometry} material={groundMaterial} receiveShadow={false} renderOrder={2} />
      <mesh geometry={asphaltGeometry} material={asphaltMaterial} receiveShadow={false} renderOrder={3} />
    </>
  )
}
