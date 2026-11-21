import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { highwayFogState } from './sectors/highwayFogState'
import { subscribeTouchAction } from '../player/touchInput'
import { weatherState } from './weatherState.js'
import {sampleRideHeight} from '../vehicle/rideSurface.js'
import {followCharacterShadow} from './characterShadow.js'
import {animeState} from '../rendering/animeState.js'

export const timeOfDayState = { value: 0, target: 0 }

export default function TimeOfDay() {
  const { scene } = useThree()
  const hemisphere = useRef()
  const daylight = useRef()
  const actor=useRef(null),shadowPosition=useMemo(()=>new THREE.Vector3(),[])
  useEffect(()=>{const target=daylight.current.target;scene.add(target);return()=>target.removeFromParent()},[scene])
  const nightBackground = useMemo(() => new THREE.Color('#030507'), [])
  const dayBackground = useMemo(() => new THREE.Color('#839196'), [])
  const nightSkyLight = useMemo(() => new THREE.Color('#4b5558'), [])
  const daySkyLight = useMemo(() => new THREE.Color('#b4c2c1'), [])
  const nightGroundLight = useMemo(() => new THREE.Color('#090b09'), [])
  const dayGroundLight = useMemo(() => new THREE.Color('#59645d'), [])
  const nightSunLight = useMemo(() => new THREE.Color('#89999d'), [])
  const daySunLight = useMemo(() => new THREE.Color('#adbabb'), [])
  const sunnySky = useMemo(() => new THREE.Color('#c4e1ff'), [])
  const sunnyGround = useMemo(() => new THREE.Color('#82846a'), [])
  const sunnySun = useMemo(() => new THREE.Color('#fff1d2'), [])
  const sunnyBackground = useMemo(() => new THREE.Color('#92c4ed'), [])

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
    const renderReady=animeState.snapshot()
    if(renderReady.nightReady||renderReady.error)timeOfDayState.value = THREE.MathUtils.lerp(timeOfDayState.value, timeOfDayState.target, blend)
    if (Math.abs(timeOfDayState.value - timeOfDayState.target) < 0.001) {
      timeOfDayState.value = timeOfDayState.target
    }
    const day = timeOfDayState.value
    const clear = weatherState.clear * day
    hemisphere.current.intensity = THREE.MathUtils.lerp(0.06, 0.82, day) + clear * .12
    hemisphere.current.color.copy(nightSkyLight).lerp(daySkyLight, day)
    hemisphere.current.color.lerp(sunnySky, clear)
    hemisphere.current.groundColor.copy(nightGroundLight).lerp(dayGroundLight, day)
    hemisphere.current.groundColor.lerp(sunnyGround, clear)
    daylight.current.intensity = THREE.MathUtils.lerp(0.06, 0.48, day) + clear * .6
    daylight.current.color.copy(nightSunLight).lerp(daySunLight, day)
    daylight.current.color.lerp(sunnySun, clear)
    scene.background.copy(nightBackground).lerp(dayBackground, day)
    scene.background.lerp(sunnyBackground, clear)
    const transmission = 1 - highwayFogState.absorption
    hemisphere.current.intensity *= transmission
    daylight.current.intensity *= transmission
    scene.background.multiplyScalar(transmission)
    if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')||scene.getObjectByName('Cyclone_riding_vehicle')
    if(actor.current){
      actor.current.getWorldPosition(shadowPosition)
      const ground=sampleRideHeight(shadowPosition.x,shadowPosition.z)
      followCharacterShadow(daylight.current,shadowPosition,Number.isFinite(ground)?ground:shadowPosition.y)
    }
  })

  return (
    <>
      <hemisphereLight ref={hemisphere} args={['#4b5558', '#090b09', 0.06]} />
      <directionalLight
        ref={daylight}
        name="Character_sun_shadow"
        position={[-25, 35, 20]}
        intensity={0.06}
        color="#89999d"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-normalBias={0.025}
        shadow-bias={-0.00015}
      />
    </>
  )
}
