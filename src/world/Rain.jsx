import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { phoneLightState } from '../player/PhoneLight'

const DROP_COUNT = 520
const SPAN_Y = 17
const unlitColor = new THREE.Color('#565f62')
const litColor = new THREE.Color('#b8c1c2')

function hash(value) {
  const result = Math.sin(value * 127.1 + 78.233) * 43758.5453
  return result - Math.floor(result)
}

export default function Rain() {
  const mesh = useRef()
  const { geometry, drops } = useMemo(() => {
    const positions = new Float32Array(DROP_COUNT * 6)
    const colors = new Float32Array(DROP_COUNT * 6)
    const seeds = Array.from({ length: DROP_COUNT }, (_, index) => ({
      x: (hash(index * 3 + 1) - 0.5) * 32,
      z: (hash(index * 3 + 2) - 0.5) * 32,
      phase: hash(index * 3 + 3) * SPAN_Y,
      speed: 10 + hash(index * 7 + 4) * 5,
      length: 0.18 + hash(index * 7 + 5) * 0.16,
    }))
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    buffer.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return { geometry: buffer, drops: seeds }
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera, clock }) => {
    if (!mesh.current) return
    mesh.current.position.copy(camera.position)
    const positions = geometry.attributes.position.array
    const colors = geometry.attributes.color.array
    const time = clock.elapsedTime
    for (let index = 0; index < DROP_COUNT; index += 1) {
      const drop = drops[index]
      const y = 8 - ((drop.phase + time * drop.speed) % SPAN_Y)
      const offset = index * 6
      positions[offset] = drop.x
      positions[offset + 1] = y
      positions[offset + 2] = drop.z
      positions[offset + 3] = drop.x + 0.055
      positions[offset + 4] = y - drop.length
      positions[offset + 5] = drop.z + 0.035

      const dx = drop.x
      const dy = y - drop.length * 0.5
      const dz = drop.z
      const distance = Math.hypot(dx, dy, dz)
      const direction = phoneLightState.direction
      const alignment = (dx * direction.x + dy * direction.y + dz * direction.z) / Math.max(distance, 0.001)
      const cone = THREE.MathUtils.smoothstep(alignment, 0.76, 0.94)
      const reach = 1 - THREE.MathUtils.smoothstep(distance, 12, 32)
      const illumination = phoneLightState.enabled ? cone * reach : 0
      const red = THREE.MathUtils.lerp(unlitColor.r, litColor.r, illumination)
      const green = THREE.MathUtils.lerp(unlitColor.g, litColor.g, illumination)
      const blue = THREE.MathUtils.lerp(unlitColor.b, litColor.b, illumination)
      colors[offset] = colors[offset + 3] = red
      colors[offset + 1] = colors[offset + 4] = green
      colors[offset + 2] = colors[offset + 5] = blue
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  })

  return (
    <lineSegments ref={mesh} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.19} depthWrite={false} fog={false} />
    </lineSegments>
  )
}
