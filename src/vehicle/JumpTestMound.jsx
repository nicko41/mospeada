import { useMemo } from 'react'
import { PlaneGeometry } from 'three'
import { terrainHeight } from '../world/terrain'
import { useFieldGroundMaterial } from '../world/materials/groundMaterials'

// A small earth crest gives the inertial take-off option a repeatable test.
export default function JumpTestMound() {
  const material = useFieldGroundMaterial()
  const geometry = useMemo(() => {
    const mesh = new PlaneGeometry(12, 40, 24, 80); mesh.rotateX(-Math.PI / 2)
    const p = mesh.attributes.position, uv = mesh.attributes.uv
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 50, z = p.getZ(i) - 125
      const height = z < -142 || z > -119 ? 0 : z < -132 ? (z + 142) * 0.16 : z < -129 ? 1.6 : 1.6 * (1 - (z + 129) / 10)
      const lateral = Math.max(0, Math.min(1, (6 - Math.abs(x - 50)) / 3))
      p.setXYZ(i, x, terrainHeight(x, z) + height * lateral + 0.003, z)
      uv.setXY(i, x / 4, z / 4)
    }
    mesh.computeVertexNormals(); return mesh
  }, [])
  return <mesh name="Inertial_takeoff_earth_crest" userData={{ rideSurface: true, rideSurfaceType: 'dirt' }} geometry={geometry} material={material} receiveShadow />
}
