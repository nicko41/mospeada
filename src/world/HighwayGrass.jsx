import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { terrainHeight } from './terrain'
import { HIGHWAY_CLEARANCE, HIGHWAY_Z, INFINITE_HIGHWAY_START_X, highwayLiftAt, infiniteHighwayHeightAt } from './sectors/highwayProfile'
import { createHighwayGrassTile, GRASS_TILE_SIZE as SIZE, GRASS_TILE_RADIUS as RADIUS, GRASS_TILE_CANDIDATES, GRASS_VISIBLE_DISTANCE } from './highwayGrassTiles.js'

const WIDTH = RADIUS * 2 + 1, SLOT_COUNT = WIDTH * WIDTH
const colors = ['#625f45', '#596044', '#696148', '#505842', '#71664b'].map(c => new THREE.Color(c))
const modulo = n => ((n % WIDTH) + WIDTH) % WIDTH
const transform = new THREE.Object3D()
const settings = { startX: INFINITE_HIGHWAY_START_X, roadZ: HIGHWAY_Z, clearance: HIGHWAY_CLEARANCE,
  heightAt: (x, z) => infiniteHighwayHeightAt(x, z) ?? terrainHeight(x, z) + highwayLiftAt(x, z) }

// Recycle whole world-anchored tiles outside the original authored field. Density,
// grass model, colors, sway and the original 43 m visibility fade stay intact.
export default function HighwayGrass({ geometry, material }) {
  const meshes = useRef([])
  useFrame(({ camera }) => {
    const cx = Math.floor(camera.position.x / SIZE), cz = Math.floor(camera.position.z / SIZE)
    for (let dx = -RADIUS; dx <= RADIUS; dx++) for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      const x = cx + dx, z = cz + dz, mesh = meshes.current[modulo(x) * WIDTH + modulo(z)]
      if (!mesh) continue
      const nearestX = THREE.MathUtils.clamp(camera.position.x, x * SIZE, (x + 1) * SIZE)
      const nearestZ = THREE.MathUtils.clamp(camera.position.z, z * SIZE, (z + 1) * SIZE)
      const nearby = Math.hypot(nearestX - camera.position.x, nearestZ - camera.position.z) < GRASS_VISIBLE_DISTANCE
      if (!nearby || x * SIZE >= INFINITE_HIGHWAY_START_X + 10) { mesh.visible = false; continue }
      const key = `${x},${z}`
      if (mesh.userData.tile !== key) {
        const clumps = createHighwayGrassTile(x, z, settings)
        mesh.position.set(x * SIZE, 0, z * SIZE); mesh.count = clumps.length
        clumps.forEach((clump, index) => {
          transform.position.set(clump.x - x * SIZE, clump.y, clump.z - z * SIZE)
          transform.rotation.set(0, clump.yaw, clump.roll); transform.scale.set(clump.width, clump.height, clump.width); transform.updateMatrix()
          mesh.setMatrixAt(index, transform.matrix); mesh.setColorAt(index, colors[clump.color])
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 2
        mesh.userData.tile = key
      }
      mesh.visible = mesh.count > 0
    }
  })
  return <group name="Grass_highway_extension">
    {Array.from({ length: SLOT_COUNT }, (_, i) => <instancedMesh key={i} name={`Grass_highway_tile_${i}`}
      ref={mesh => { meshes.current[i] = mesh }} args={[geometry, material, GRASS_TILE_CANDIDATES]}
      userData={{ vegetation: 'highway-extension' }} visible={false} castShadow={false} receiveShadow={false} />)}
  </group>
}
