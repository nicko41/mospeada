import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { highwayFogState } from '../world/sectors/highwayFogState'
import MobileViewModel from './MobileViewModel'
import { MOBILE_POSITION, MOBILE_RAISE_TIME, FLASHLIGHT_MAX_ACTIVE_TIME,
  FLASHLIGHT_RECHARGE_DELAY, FLASHLIGHT_FULL_RECHARGE, FLASHLIGHT_RESTART_THRESHOLD } from './flashlightConfig'
import { playerCombat } from './playerCombat'
import { playerActionState } from './FirstPersonRig'
import { vehicleState } from './vehicleState'
import { isGameInputActive, subscribeTouchAction } from './touchInput'

const LIGHT_DISTANCE = 38
const TARGET_DISTANCE = 12

export const phoneLightState = {
  enabled: false, raised: 0, range: LIGHT_DISTANCE, energy: 1,
  position: new THREE.Vector3(),
  direction: new THREE.Vector3(0, 0, -1),
}

export default function PhoneLight() {
  const { camera, scene } = useThree()
  const light = useRef()
  const wanted = useRef(false)
  const progress = useRef(0)
  const battery = useRef({ offTime: 0, flicker: 0 })
  const target = useMemo(() => new THREE.Object3D(), [])
  const forward = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    scene.add(target)

    const toggleWanted = () => {
      if (!isGameInputActive() || vehicleState.active || playerCombat.dead || playerActionState.locked) return
      if (wanted.current) wanted.current = false
      else if (phoneLightState.energy >= FLASHLIGHT_RESTART_THRESHOLD) wanted.current = true
    }

    const toggleLight = (event) => {
      if (event.defaultPrevented || vehicleState.active || vehicleState.nearDoor) return
      if (event.code === 'KeyF' && !event.repeat && isGameInputActive()
        && !playerCombat.dead && !playerActionState.locked) {
        event.preventDefault()
        toggleWanted()
      }
    }

    window.addEventListener('keydown', toggleLight, true)
    const unsubscribe = subscribeTouchAction('light', toggleWanted)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', toggleLight, true)
      phoneLightState.enabled = false
      phoneLightState.raised = 0
      scene.remove(target)
    }
  }, [scene, target])

  useFrame((_, delta) => {
    if (!light.current) return
    const dt = isGameInputActive() && !playerCombat.dead && !playerActionState.locked ? Math.min(delta, 0.05) : 0
    const available = !playerCombat.dead && !playerActionState.locked && playerActionState.mode !== 'VAULT' && !vehicleState.active
    if (vehicleState.active) { wanted.current = false; progress.current = 0 }
    const raising = wanted.current && available
    progress.current = THREE.MathUtils.clamp(progress.current + (raising ? 1 : -1) * Math.min(delta, 0.05) / MOBILE_RAISE_TIME, 0, 1)
    phoneLightState.raised = THREE.MathUtils.smoothstep(progress.current, 0, 1)
    let enabled = raising && progress.current > 0.75 && phoneLightState.energy > 0
    battery.current.flicker = Math.max(0, battery.current.flicker - dt)
    if (enabled) {
      const previous = phoneLightState.energy
      phoneLightState.energy = Math.max(0, previous - dt / FLASHLIGHT_MAX_ACTIVE_TIME)
      battery.current.offTime = 0
      if ((previous >= 0.18 && phoneLightState.energy < 0.18)
        || (previous >= 0.08 && phoneLightState.energy < 0.08)) battery.current.flicker = 0.065
      if (phoneLightState.energy === 0) { wanted.current = false; enabled = false }
    } else {
      const before = Math.max(0, battery.current.offTime - FLASHLIGHT_RECHARGE_DELAY)
      battery.current.offTime += dt
      const after = Math.max(0, battery.current.offTime - FLASHLIGHT_RECHARGE_DELAY)
      phoneLightState.energy = Math.min(1, phoneLightState.energy + (after - before) / FLASHLIGHT_FULL_RECHARGE)
    }
    phoneLightState.enabled = enabled
    light.current.intensity = enabled ? 105 * (1 - highwayFogState.absorption * 0.96)
      * (battery.current.flicker > 0 ? 0.25 : 1) : 0
    light.current.distance = LIGHT_DISTANCE * (1 - highwayFogState.absorption * 0.94)

    camera.getWorldDirection(forward)
    light.current.position.set(MOBILE_POSITION[0], MOBILE_POSITION[1] + 0.08, MOBILE_POSITION[2])
      .applyQuaternion(camera.quaternion).add(camera.position)
    target.position.copy(light.current.position).addScaledVector(forward, TARGET_DISTANCE)
    target.updateMatrixWorld()
    phoneLightState.position.copy(light.current.position)
    phoneLightState.range = light.current.distance
    phoneLightState.direction.copy(forward)
  }, -0.5)

  return (
    <><Suspense fallback={null}><MobileViewModel /></Suspense><spotLight
      ref={light}
      target={target}
      color="#d8e4e8"
      intensity={0}
      distance={LIGHT_DISTANCE}
      angle={Math.PI / 5}
      penumbra={0.78}
      decay={2}
      castShadow
      shadow-mapSize-width={512}
      shadow-mapSize-height={512}
      shadow-camera-near={0.35}
      shadow-camera-far={LIGHT_DISTANCE}
      shadow-bias={-0.0002}
      shadow-normalBias={0.025}
    /></>
  )
}
