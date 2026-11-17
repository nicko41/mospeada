import { isGameInputActive } from './touchInput'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { playerActionState } from './FirstPersonRig'
import { playerCombat } from './playerCombat'
import { MOVE_SPEED, RUN_SPEED } from './movementConfig'
import useFootstepAudio from './useFootstepAudio'

const WALK = { vertical: 0.032, lateral: 0.018, pitch: 0.4, roll: 0.5, frequency: 1.65 }
const RUN = { vertical: 0.055, lateral: 0.028, pitch: 0.7, roll: 0.9, frequency: 2.35 }
const BOB_BLEND = 10

export default function CameraLocomotion() {
  const updateFootsteps = useFootstepAudio()
  const { camera } = useThree()
  const s = useMemo(() => ({ last: new THREE.Vector3(), offset: new THREE.Vector3(),
    right: new THREE.Vector3(), angles: new THREE.Euler(0, 0, 0, 'YXZ'),
    initialized: false, applied: false, amount: 0, running: 0, phase: 0, pitch: 0, roll: 0 }), [])
  const restore = () => {
    if (!s.applied) return
    camera.position.sub(s.offset)
    s.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    s.angles.x -= s.pitch; s.angles.z -= s.roll
    camera.quaternion.setFromEuler(s.angles)
    s.applied = false
  }
  useEffect(() => () => restore(), [camera, s])
  // Undo in reverse layer order: damage (-4), melee (-3), bob (-2.9).
  // All are removed before narrative teleports and the player controller.
  useFrame(restore, -2.9)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const travel = s.initialized ? Math.hypot(camera.position.x - s.last.x, camera.position.z - s.last.z) : 0
    s.last.copy(camera.position); s.initialized = true
    const allowed = playerActionState.mode === 'GROUND' && !playerActionState.locked
      && !playerCombat.dead && !!isGameInputActive()
    const speed = allowed && dt > 0 && travel <= RUN_SPEED * dt + 0.05 ? travel / dt : 0
    const running = THREE.MathUtils.clamp((speed - MOVE_SPEED) / (RUN_SPEED - MOVE_SPEED), 0, 1)
    updateFootsteps(speed, running, camera.position)
    s.amount = THREE.MathUtils.damp(s.amount, Math.min(1, speed / MOVE_SPEED), BOB_BLEND, dt)
    if (!allowed) { s.amount = 0; return }
    s.running = THREE.MathUtils.damp(s.running, running, BOB_BLEND, dt)
    const frequency = THREE.MathUtils.lerp(WALK.frequency, RUN.frequency, running) * Math.min(1, speed / MOVE_SPEED)
    s.phase = (s.phase + dt * frequency * Math.PI * 2) % (Math.PI * 4)
    if (s.amount < 0.0001) { s.amount = 0; return }
    s.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    s.right.set(Math.cos(s.angles.y), 0, -Math.sin(s.angles.y))
    s.offset.copy(s.right).multiplyScalar(Math.sin(s.phase * 0.5)
      * THREE.MathUtils.lerp(WALK.lateral, RUN.lateral, s.running) * s.amount)
    s.offset.y = Math.sin(s.phase) * THREE.MathUtils.lerp(WALK.vertical, RUN.vertical, s.running) * s.amount
    const pitch = Math.cos(s.phase) * THREE.MathUtils.degToRad(THREE.MathUtils.lerp(WALK.pitch, RUN.pitch, s.running)) * s.amount
    s.pitch = THREE.MathUtils.clamp(s.angles.x + pitch, -1.569, 1.569) - s.angles.x
    s.roll = Math.sin(s.phase * 0.5) * THREE.MathUtils.degToRad(THREE.MathUtils.lerp(WALK.roll, RUN.roll, s.running)) * s.amount
    camera.position.add(s.offset)
    s.angles.x += s.pitch; s.angles.z += s.roll
    camera.quaternion.setFromEuler(s.angles)
    s.applied = true
  }, -0.6)
  return null
}
