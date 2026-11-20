import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { timeOfDayState } from './TimeOfDay'
import { highwayFogState } from './sectors/highwayFogState'
import { weatherState } from './weatherState.js'

export const lightningState = { flash: 0, eventId: 0, age: -1 }

const pulse = (age, start, duration) => {
  if (age < start || age > start + duration) return 0
  return Math.sin(Math.PI * (age - start) / duration)
}

export default function Lightning() {
  const skyLight = useRef()
  const cloudLight = useRef()
  const { scene } = useThree()
  const nightFog = useMemo(() => new THREE.Color('#0b0e0f'), [])
  const deepNightFog = useMemo(() => new THREE.Color('#030507'), [])
  const dayFog = useMemo(() => new THREE.Color('#7d898c'), [])
  const sunnyFog = useMemo(() => new THREE.Color('#bdd9e6'), [])
  const nightFlashFog = useMemo(() => new THREE.Color('#73818b'), [])
  const dayFlashFog = useMemo(() => new THREE.Color('#aebbc0'), [])
  const mixedFog = useMemo(() => new THREE.Color(), [])
  const mixedFlashFog = useMemo(() => new THREE.Color(), [])
  const timing = useRef({ next: 5, start: -1 })

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    if (weatherState.rainIntensity <= 0) {
      timing.current.start = -1
      timing.current.next = now + 5
    }
    if (timing.current.start < 0 && now >= timing.current.next) {
      timing.current.start = now
      lightningState.eventId += 1
    }

    let flash = 0
    if (timing.current.start >= 0) {
      const age = now - timing.current.start
      flash = Math.max(pulse(age, 0, 0.13), pulse(age, 0.21, 0.2) * 0.78)
      if (age > 0.44) {
        timing.current.start = -1
        timing.current.next = now + 8 + Math.random() * 10
      }
    }

    flash *= 1 - highwayFogState.absorption
    lightningState.flash = flash
    lightningState.age = timing.current.start < 0 ? -1 : now - timing.current.start
    const day = timeOfDayState.value
    if (skyLight.current) skyLight.current.intensity = flash * THREE.MathUtils.lerp(3.6, 1.4, day)
    if (cloudLight.current) cloudLight.current.intensity = flash * THREE.MathUtils.lerp(2.4, 1.15, day)
    if (scene.fog) {
      mixedFog.copy(nightFog).lerp(deepNightFog, highwayFogState.darkness).lerp(dayFog, day)
      mixedFog.lerp(sunnyFog, weatherState.clear * day)
      mixedFlashFog.copy(nightFlashFog).lerp(dayFlashFog, day)
      scene.fog.color.copy(mixedFog).lerp(mixedFlashFog, flash * 0.62)
      scene.fog.color.multiplyScalar(1 - highwayFogState.absorption)
    }
  })

  return (
    <>
      <hemisphereLight ref={skyLight} args={['#b5c9d5', '#3c4a52', 0]} />
      <directionalLight ref={cloudLight} position={[-45, 75, -60]} color="#c6d8e2" intensity={0} />
    </>
  )
}
