import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { highwayFogState } from './sectors/highwayFogState'
import { subscribeTouchAction } from '../player/touchInput'

export const timeOfDayState = { value: 0, target: 0 }

export default function TimeOfDay() {
  const { scene } = useThree()
  const hemisphere = useRef()
  const daylight = useRef()
  const nightBackground = useMemo(() => new THREE.Color('#030507'), [])
  const dayBackground = useMemo(() => new THREE.Color('#839196'), [])
  const nightSkyLight = useMemo(() => new THREE.Color('#4b5558'), [])
  const daySkyLight = useMemo(() => new THREE.Color('#b4c2c1'), [])
  const nightGroundLight = useMemo(() => new THREE.Color('#090b09'), [])
  const dayGroundLight = useMemo(() => new THREE.Color('#59645d'), [])
  const nightSunLight = useMemo(() => new THREE.Color('#89999d'), [])
  const daySunLight = useMemo(() => new THREE.Color('#adbabb'), [])

  useEffect(() => {
    const switchTime = (event) => {
      if (event.code === 'KeyN') timeOfDayState.target = 1
      if (event.code === 'KeyM') timeOfDayState.target = 0
    }
    window.addEventListener('keydown', switchTime)
    const unsubscribe = subscribeTouchAction('time', () => switchTime({
      code: timeOfDayState.target === 0 ? 'KeyN' : 'KeyM',
    }))
    return () => { window.removeEventListener('keydown', switchTime); unsubscribe() }
  }, [])

  useFrame((_, delta) => {
    const blend = 1 - Math.exp(-delta * 2.2)
    timeOfDayState.value = THREE.MathUtils.lerp(timeOfDayState.value, timeOfDayState.target, blend)
    if (Math.abs(timeOfDayState.value - timeOfDayState.target) < 0.001) {
      timeOfDayState.value = timeOfDayState.target
    }
    const day = timeOfDayState.value
    hemisphere.current.intensity = THREE.MathUtils.lerp(0.06, 0.82, day)
    hemisphere.current.color.copy(nightSkyLight).lerp(daySkyLight, day)
    hemisphere.current.groundColor.copy(nightGroundLight).lerp(dayGroundLight, day)
    daylight.current.intensity = THREE.MathUtils.lerp(0.06, 0.48, day)
    daylight.current.color.copy(nightSunLight).lerp(daySunLight, day)
    scene.background.copy(nightBackground).lerp(dayBackground, day)
    const transmission = 1 - highwayFogState.absorption
    hemisphere.current.intensity *= transmission
    daylight.current.intensity *= transmission
    scene.background.multiplyScalar(transmission)
  })

  return (
    <>
      <hemisphereLight ref={hemisphere} args={['#4b5558', '#090b09', 0.06]} />
      <directionalLight
        ref={daylight}
        position={[-25, 35, 20]}
        intensity={0.06}
        color="#89999d"
      />
    </>
  )
}
