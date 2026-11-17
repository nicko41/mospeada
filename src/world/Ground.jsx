import { useMemo } from 'react'
import * as THREE from 'three'
import { useFieldGroundMaterial } from './materials/groundMaterials'
import { terrainHeight, WORLD_CENTER_Z, WORLD_LENGTH, WORLD_WIDTH } from './terrain'

const FIELD_TEXTURE_METERS = 4

export default function Ground() {
  const material = useFieldGroundMaterial()
  const geometry = useMemo(() => {
    const ground = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_LENGTH, 70, 95)
    ground.rotateX(-Math.PI / 2)

    const positions = ground.attributes.position
    const uvs = ground.attributes.uv
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index)
      const localZ = positions.getZ(index)
      const worldZ = localZ + WORLD_CENTER_Z
      positions.setY(index, terrainHeight(x, worldZ))
      uvs.setXY(index, x / FIELD_TEXTURE_METERS, worldZ / FIELD_TEXTURE_METERS)
    }

    positions.needsUpdate = true
    uvs.needsUpdate = true
    ground.computeVertexNormals()
    return ground
  }, [])

  return (
    <mesh geometry={geometry} material={material} position-z={WORLD_CENTER_Z} receiveShadow />
  )
}
