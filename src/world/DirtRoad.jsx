import { useMemo } from 'react'
import * as THREE from 'three'
import { useDirtRoadMaterials } from './materials/groundMaterials'
import { HIGHWAY_CLEARANCE, HIGHWAY_Z } from './sectors/highwayProfile'
import { roadCenterAt, terrainHeight } from './terrain'

const ROAD_START = 58
const ROAD_END = -305
const SEGMENTS = 120
const ROAD_TEXTURE_METERS = 3
const ROAD_WIDTH = 7.4
const EDGE_BLEND_WIDTH = 1.15

function makeRoadGeometry() {
  const vertices = []
  const indices = []
  const uvs = []
  const blends = []

  for (let index = 0; index <= SEGMENTS; index += 1) {
    const progress = index / SEGMENTS
    const z = THREE.MathUtils.lerp(ROAD_START, ROAD_END, progress)
    const center = roadCenterAt(z)
    const edgeNoise = Math.sin(index * 1.71) * 0.22
      + Math.sin(index * 0.43) * 0.14
      + Math.sin(z * 0.071 + 1.3) * 0.18
    const outerWidth = ROAD_WIDTH * 0.5 + edgeNoise
    const blendWidth = EDGE_BLEND_WIDTH + Math.sin(z * 0.11) * 0.18
    const lateralPoints = [
      { offset: -outerWidth, blend: 0 },
      { offset: -outerWidth + blendWidth, blend: 1 },
      { offset: outerWidth - blendWidth, blend: 1 },
      { offset: outerWidth, blend: 0 },
    ]

    for (const point of lateralPoints) {
      const x = center + point.offset
      const transitionNoise = Math.sin(x * 1.37 + z * 0.09) * 0.85
        + Math.sin(x * 0.53 - z * 0.17) * 0.45
      const highwayDistance = Math.abs(z - HIGHWAY_Z) + transitionNoise
      const approachBlend = THREE.MathUtils.smoothstep(
        highwayDistance,
        HIGHWAY_CLEARANCE - 2,
        HIGHWAY_CLEARANCE + 8,
      )
      vertices.push(x, terrainHeight(x, z) + 0.035, z)
      uvs.push(x / ROAD_TEXTURE_METERS, z / ROAD_TEXTURE_METERS)
      blends.push(point.blend * approachBlend)
    }

    if (index < SEGMENTS) {
      const current = index * 4
      for (let column = 0; column < 3; column += 1) {
        const bottomLeft = current + column
        const bottomRight = bottomLeft + 1
        const topLeft = bottomLeft + 4
        const topRight = topLeft + 1
        indices.push(bottomLeft, bottomRight, topLeft, topLeft, bottomRight, topRight)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aRoadBlend', new THREE.Float32BufferAttribute(blends, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export default function DirtRoad() {
  const material = useDirtRoadMaterials()
  const geometry = useMemo(makeRoadGeometry, [])

  return <mesh userData={{ rideSurface: true, rideSurfaceType: 'dirt' }} geometry={geometry} material={material} receiveShadow renderOrder={1} />
}
