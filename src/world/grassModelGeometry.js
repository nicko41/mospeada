import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function createGrassModelGeometry(scene, targetHeight) {
  scene.updateMatrixWorld(true)
  const parts = []
  const bounds = new THREE.Box3()

  scene.traverse((mesh) => {
    if (!mesh.isMesh) return
    const part = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    part.computeBoundingBox()
    bounds.union(part.boundingBox)
    parts.push(part)
  })

  const centerX = (bounds.min.x + bounds.max.x) * 0.5
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5
  const sourceHeight = bounds.max.y - bounds.min.y
  const scale = targetHeight / sourceHeight

  parts.forEach((part) => {
    const positions = part.getAttribute('position')
    const uvs = new Float32Array(positions.count * 2)
    for (let index = 0; index < positions.count; index += 1) {
      uvs[index * 2] = 0.5
      uvs[index * 2 + 1] = THREE.MathUtils.clamp(
        (positions.getY(index) - bounds.min.y) / sourceHeight, 0, 1,
      )
    }
    part.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    part.translate(-centerX, -bounds.min.y, -centerZ)
    part.scale(scale, scale, scale)
  })

  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return geometry
}
