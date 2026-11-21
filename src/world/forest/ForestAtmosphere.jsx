import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Vector3 } from 'three'
import { timeOfDayState } from '../TimeOfDay.jsx'
import { followCharacterShadow } from '../characterShadow.js'
import { sampleRideHeight } from '../../vehicle/rideSurface.js'
import { FOREST } from './forestConfig.js'

export default function ForestAtmosphere() {
  const { scene } = useThree(), sun = useRef(), hemi = useRef(), actor = useRef()
  const colors = useMemo(() => ({ sky: new Color(FOREST.palette.sky), fog: new Color(FOREST.palette.fog),
    night: new Color('#112e49'), position: new Vector3() }), [])
  useEffect(() => {
    const target = sun.current.target; scene.add(target)
    const onKey = e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
      if (e.code === 'KeyN') timeOfDayState.target = 1
      if (e.code === 'KeyM') timeOfDayState.target = 0
    }
    window.addEventListener('keydown', onKey)
    return () => { target.removeFromParent(); window.removeEventListener('keydown', onKey) }
  }, [scene])
  useFrame((_, dt) => {
    timeOfDayState.value += (timeOfDayState.target - timeOfDayState.value) * (1 - Math.exp(-dt * 2.2))
    const day = timeOfDayState.value
    scene.background.copy(colors.night).lerp(colors.sky, day)
    scene.fog.color.copy(colors.night).lerp(colors.fog, day)
    scene.fog.density = FOREST.fogDensity
    hemi.current.intensity = .28 + day * .9
    sun.current.intensity = .09 + day * .9
    if (!actor.current?.parent) actor.current = scene.getObjectByName('Scott_original_playback') || scene.getObjectByName('Cyclone_riding_vehicle')
    if (actor.current) {
      actor.current.getWorldPosition(colors.position)
      const ground = sampleRideHeight(colors.position.x, colors.position.z)
      followCharacterShadow(sun.current, colors.position, Number.isFinite(ground) ? ground : colors.position.y)
    }
  })
  return <>
    <color attach="background" args={[FOREST.palette.sky]} />
    <fogExp2 attach="fog" args={[FOREST.palette.fog, FOREST.fogDensity]} />
    <hemisphereLight ref={hemi} color="#b6dbe0" groundColor="#325c69" intensity={1.18} />
    <directionalLight ref={sun} name="Character_sun_shadow" position={[-25, 35, 20]} color="#dce9dc" intensity={.99}
      castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-normalBias={.025} shadow-bias={-.00015} shadow-radius={3} />
  </>
}
