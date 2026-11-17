import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import DesktopLookControls from './DesktopLookControls'
import useTouchDevice from './useTouchDevice'
import { touchInput, isGameInputActive, resetTouchInput, resetTouchLook, subscribeTouchAction } from './touchInput'
import { smoothLookDelta } from './mobileLookInput'
import { MOBILE_LOOK_SENSITIVITY_X, MOBILE_LOOK_SENSITIVITY_Y, MOBILE_LOOK_PITCH_LIMIT } from './mobileLookConfig'
import { playerCombat } from './playerCombat'
import { vehicleState } from './vehicleState'
import * as THREE from 'three'
import { getWalkableHeightAt } from './getWalkableHeight'
import { floorAt, moveAndSlide } from './playerCollision'
import { findVault, vaultPosition } from './playerVault'
import { highwaySequence } from '../narrative/highwaySequence'
import { getCasetaScene } from '../narrative/casetaScene'
import { EYE_HEIGHT, MOVE_SPEED, RUN_SPEED, JUMP_FORCE, GRAVITY, GROUND_EPSILON,
  MAX_MOVE_STEP, MAX_FRAME_DELTA, VAULT_DURATION, VAULT_CAMERA_DUCK, VAULT_CAMERA_PITCH } from './movementConfig'

// Read-only action availability for optional interactions; movement remains owned here.
export const playerActionState = { mode: 'GROUND', locked: false }

export default function FirstPersonRig() {
  const touchDevice = useTouchDevice()
  const { camera } = useThree()
  const keys = useRef({})
  const controls = useRef()
  const action = useRef(false)
  const state = useMemo(() => ({ mode: 'GROUND', velocityY: 0, vault: null,
    feet: new THREE.Vector3(), lastCamera: new THREE.Vector3(), baseView: new THREE.Quaternion(),
    result: { grounded: false, ceiling: false }, initialized: false, pointerSpeed: 1 }), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const forward = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const pitch = useMemo(() => new THREE.Quaternion(), [])
  const pitchAxis = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const lookAngles = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  useEffect(() => subscribeTouchAction('jump', () => {
    if (!playerActionState.locked && state.mode === 'GROUND') action.current = true
  }), [state])

  useEffect(() => {
    camera.position.set(0, getWalkableHeightAt(0, 18) + EYE_HEIGHT, 18)
    state.feet.copy(camera.position); state.feet.y -= EYE_HEIGHT
    state.lastCamera.copy(camera.position)
    state.pointerSpeed = controls.current?.pointerSpeed ?? 1
    state.initialized = true
    const clear = () => { keys.current = {}; action.current = false }
    const down = (event) => {
      if (event.code === 'Escape') { clear(); return }
      if (touchDevice || !isGameInputActive() || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat && state.mode === 'GROUND') action.current = true
      }
      keys.current[event.code] = true
    }
    const up = (event) => { keys.current[event.code] = false }
    const lockChanged = () => { if (!document.pointerLockElement) clear() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('pointerlockchange', lockChanged)
    }
  }, [camera, state, touchDevice])

  useFrame((_, delta) => {
    if (!state.initialized) return
    if (vehicleState.exitRequested) {
      vehicleState.exitRequested = false
      state.feet.copy(vehicleState.exitPosition)
      camera.position.copy(state.feet); camera.position.y += EYE_HEIGHT
      camera.rotation.set(0, vehicleState.exitYaw, 0, 'YXZ')
      state.lastCamera.copy(camera.position)
      state.mode = 'GROUND'; state.velocityY = 0; state.vault = null
      keys.current = {}; action.current = false
    }
    if (vehicleState.active) {
      resetTouchLook()
      playerActionState.mode = 'DRIVE'
      playerActionState.locked = playerCombat.dead || highwaySequence.movementLocked || getCasetaScene().letterOpen
      if (controls.current) controls.current.pointerSpeed = 0
      keys.current = {}; action.current = false
      state.lastCamera.copy(camera.position)
      return
    }
    // Respect the narrative's existing camera teleport without carrying jump/vault momentum.
    if (camera.position.distanceToSquared(state.lastCamera) > 0.0001) {
      state.feet.copy(camera.position); state.feet.y -= EYE_HEIGHT
      state.mode = 'GROUND'; state.velocityY = 0; state.vault = null; action.current = false
    }
    const locked = playerCombat.dead || highwaySequence.movementLocked || getCasetaScene().letterOpen
    playerActionState.locked = locked
    if (controls.current) {
      // Pause mouse look during narrative locks and vault animations.
      controls.current.pointerSpeed = locked || state.mode === 'VAULT' ? 0 : state.pointerSpeed
    }
    if (locked) {
      resetTouchInput()
      keys.current = {}; action.current = false
      if (state.vault) {
        state.feet.copy(state.vault.start)
        camera.quaternion.copy(state.baseView)
        state.vault = null; state.mode = 'GROUND'; state.velocityY = 0
        camera.position.copy(state.feet); camera.position.y += EYE_HEIGHT
      }
      state.lastCamera.copy(camera.position)
      playerActionState.mode = state.mode
      return
    }
    const dt = Math.min(delta, MAX_FRAME_DELTA)
    if (touchInput.enabled && isGameInputActive() && state.mode !== 'VAULT') {
      lookAngles.setFromQuaternion(camera.quaternion, 'YXZ')
      lookAngles.y -= smoothLookDelta(touchInput, 'lookX', dt) * MOBILE_LOOK_SENSITIVITY_X
      lookAngles.x = THREE.MathUtils.clamp(lookAngles.x - smoothLookDelta(touchInput, 'lookY', dt)
        * MOBILE_LOOK_SENSITIVITY_Y, -MOBILE_LOOK_PITCH_LIMIT, MOBILE_LOOK_PITCH_LIMIT)
      camera.quaternion.setFromEuler(lookAngles)
    } else resetTouchLook()
    touchInput.lookX = 0; touchInput.lookY = 0
    if (state.mode !== 'VAULT') {
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize()
      right.crossVectors(forward, camera.up).normalize()
      direction.set(0, 0, 0)
      if (!touchDevice && isGameInputActive()) {
        if (keys.current.KeyW) direction.add(forward)
        if (keys.current.KeyS) direction.sub(forward)
        if (keys.current.KeyD) direction.add(right)
        if (keys.current.KeyA) direction.sub(right)
      }
      const keyboardMoving = direction.lengthSq() > 0
      if (!keyboardMoving && touchInput.enabled && isGameInputActive()) {
        direction.addScaledVector(forward, touchInput.y).addScaledVector(right, touchInput.x)
      }
      if (keyboardMoving) direction.normalize()
      else if (direction.lengthSq() > 1) direction.normalize()
      const ground = floorAt(state.feet.x, state.feet.z, state.feet.y + GROUND_EPSILON)
      if (state.mode === 'GROUND' && Math.abs(state.feet.y - ground) > GROUND_EPSILON) state.mode = 'AIR'
      if (action.current && state.mode === 'GROUND') {
        state.vault = findVault(state.feet, forward)
        if (state.vault) {
          state.mode = 'VAULT'
          state.baseView.copy(camera.quaternion)
          if (controls.current) controls.current.pointerSpeed = 0
        } else {
          state.mode = 'AIR'
          state.velocityY = JUMP_FORCE
        }
      }
      action.current = false
    }
    if (state.mode === 'VAULT') {
      const vault = state.vault
      vault.elapsed += dt
      const progress = Math.min(1, vault.elapsed / VAULT_DURATION)
      vaultPosition(vault, progress, state.feet)
      const body = Math.sin(Math.PI * progress) ** 2
      camera.position.copy(state.feet)
      camera.position.y += EYE_HEIGHT - VAULT_CAMERA_DUCK * body
      pitch.setFromAxisAngle(pitchAxis, -VAULT_CAMERA_PITCH * body)
      camera.quaternion.copy(state.baseView).multiply(pitch)
      if (progress === 1) {
        state.mode = 'GROUND'; state.vault = null; state.velocityY = 0
        camera.quaternion.copy(state.baseView)
        if (controls.current) controls.current.pointerSpeed = state.pointerSpeed
      }
    } else {
      const speed = keys.current.ShiftLeft || keys.current.ShiftRight ||
        (touchInput.enabled && isGameInputActive() && touchInput.sprint) ? RUN_SPEED : MOVE_SPEED
      direction.multiplyScalar(speed)
      const steps = Math.max(1, Math.ceil(speed * dt / MAX_MOVE_STEP), Math.ceil(dt / (1 / 120)))
      const step = dt / steps
      for (let index = 0; index < steps; index += 1) {
        state.velocityY -= GRAVITY * step
        moveAndSlide(state.feet, direction.x * step, direction.z * step, state.velocityY * step,
          state.mode === 'GROUND', state.result)
        if (state.result.ceiling) state.velocityY = Math.min(0, state.velocityY)
        if (state.result.grounded) { state.mode = 'GROUND'; state.velocityY = 0 }
        else state.mode = 'AIR'
      }
      camera.position.copy(state.feet); camera.position.y += EYE_HEIGHT
    }
    state.lastCamera.copy(camera.position)
    playerActionState.mode = state.mode
  }, -1)

  return touchDevice ? null : <DesktopLookControls controlsRef={controls} />
}
