import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { timeOfDayState } from '../world/TimeOfDay'
import { weatherState } from '../world/weatherState.js'

export default function DrivingLighting({ manageFog = true }) {
  const { scene, gl } = useThree()
  const environment = useRef(null), vehicle = useRef(null), materials = useRef(new Set())
  useLayoutEffect(() => {
    const room = new RoomEnvironment(), generator = new PMREMGenerator(gl)
    const result = generator.fromScene(room, 0.04)
    room.dispose(); generator.dispose(); environment.current = result
    // Keep studio reflections on the vehicle's private materials, off the world.
    const previous = scene.environment
    scene.environment = null
    return () => {
      for (const material of materials.current) if (material.envMap === result.texture) {
        material.envMap = null; material.needsUpdate = true
      }
      materials.current.clear(); vehicle.current = null; environment.current = null
      scene.environment = previous; result.dispose()
    }
  }, [scene, gl])
  useFrame(() => {
    if (!environment.current) return
    const root = scene.getObjectByName('Cyclone_riding_vehicle')
    if (root !== vehicle.current) {
      vehicle.current = root; materials.current.clear()
      root?.traverse(node => {
        const list = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of list) if (material?.isMeshStandardMaterial) {
          material.envMap = environment.current.texture; material.needsUpdate = true
          materials.current.add(material)
        }
      })
    }
    for (const material of materials.current) material.envMapIntensity = 0.04 + timeOfDayState.value * 0.55
    // Weather keeps the original storm density and a lighter sunny haze.
    if (manageFog && scene.fog) scene.fog.density = weatherState.fogDensity
  })
  return null
}
