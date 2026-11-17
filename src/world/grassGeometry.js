import * as THREE from 'three'

const TUFT_BLADES = [
  { x: 0, z: 0, angle: 0, height: 1, width: 0.9 },
  { x: -0.055, z: 0.03, angle: 0.72, height: 0.78, width: 0.72 },
  { x: 0.052, z: 0.038, angle: -0.68, height: 1.18, width: 0.66 },
  { x: 0.012, z: -0.055, angle: 1.42, height: 0.88, width: 0.74 },
  { x: -0.035, z: -0.04, angle: -1.25, height: 1.08, width: 0.62 },
]

export function createGrassBladeGeometry(segments = 5, baseWidth = 0.021, height = 0.54) {
  const verticesPerBlade = segments * 2 + 1
  const indicesPerBlade = (verticesPerBlade - 2) * 3
  const positions = new Float32Array(verticesPerBlade * TUFT_BLADES.length * 3)
  const normals = new Float32Array(verticesPerBlade * TUFT_BLADES.length * 3)
  const uvs = new Float32Array(verticesPerBlade * TUFT_BLADES.length * 2)
  const indices = new Uint16Array(indicesPerBlade * TUFT_BLADES.length)

  TUFT_BLADES.forEach((blade, bladeIndex) => {
    const vertexOffset = bladeIndex * verticesPerBlade
    const uvOffset = vertexOffset * 2
    const cosine = Math.cos(blade.angle)
    const sine = Math.sin(blade.angle)

    for (let index = 0; index < segments; index += 1) {
      const heightRatio = index / segments
      const y = Math.pow(heightRatio, 0.72) * height * blade.height
      const halfWidth = baseWidth * blade.width * Math.pow(1 - heightRatio, 1.45) * 0.5
      const curve = Math.pow(heightRatio, 1.85) * 0.014

      for (const [side, uvX] of [[-1, 0], [1, 1]]) {
        const localX = halfWidth * side
        const vertexIndex = vertexOffset + index * 2 + (side + 1) / 2
        positions.set([
          blade.x + localX * cosine + curve * sine,
          y,
          blade.z - localX * sine + curve * cosine,
        ], vertexIndex * 3)
        normals.set([sine, 0, cosine], vertexIndex * 3)
        uvs.set([uvX, heightRatio], uvOffset + index * 4 + uvX * 2)
      }
    }

    const tipVertex = vertexOffset + segments * 2
    positions.set([
      blade.x + 0.014 * sine,
      height * blade.height,
      blade.z + 0.014 * cosine,
    ], tipVertex * 3)
    normals.set([sine, 0, cosine], tipVertex * 3)
    uvs.set([0.5, 1], tipVertex * 2)

    const indexOffset = bladeIndex * indicesPerBlade
    for (let index = 0; index < segments - 1; index += 1) {
      const bottomLeft = vertexOffset + index * 2
      indices.set([
        bottomLeft,
        bottomLeft + 1,
        bottomLeft + 2,
        bottomLeft + 1,
        bottomLeft + 3,
        bottomLeft + 2,
      ], indexOffset + index * 6)
    }
    indices.set([
      vertexOffset + (segments - 1) * 2,
      vertexOffset + (segments - 1) * 2 + 1,
      tipVertex,
    ], indexOffset + (segments - 1) * 6)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}
