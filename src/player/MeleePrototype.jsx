import { useEffect, useMemo, useRef } from 'react'
import { isGameInputActive, subscribeTouchAction } from './touchInput'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { playerActionState } from './FirstPersonRig'
import { highwaySequence } from '../narrative/highwaySequence'
import { getCasetaScene } from '../narrative/casetaScene'
import { strikeMelee } from './meleeWorld'
import { playerCombat } from './playerCombat'
import useBatSwingAudio from './useBatSwingAudio'
import useBatHitAudio from './useBatHitAudio'
import { MELEE_COOLDOWN } from './meleeConfig'
import { batAttack, batEquipment, cancelBatAttack, notifyBatImpact, notifyBatSwing } from './batAttackState'
import { BAT_WINDUP, BAT_SWING, BAT_DURATION, BAT_CHAIN_TIME, BAT_HIT_TIME, BAT_HIT_STOP, BAT_TIP_LOCAL_Y,
  BAT_IMPACT_DURATION, BAT_IMPACT_BACK, BAT_IMPACT_ROTATION, sampleBatMotion } from './batConfig'

export default function MeleePrototype() {
  const touchAttack = useRef({ pending: false, perform: null })
  useBatSwingAudio()
  useBatHitAudio()
  const { camera } = useThree()
  const pose = useMemo(() => ({ applied: false, offset: new THREE.Vector3(),
    batBefore: new THREE.Vector3(), batAfter: new THREE.Vector3(), batPosition: new THREE.Vector3(),
    batRotation: new THREE.Euler(), batQuaternion: new THREE.Quaternion(), swingDirection: new THREE.Vector3(),
    local: new THREE.Vector3(), forward: new THREE.Vector3(), rotation: new THREE.Euler(),
    angles: new THREE.Euler(0, 0, 0, 'YXZ'), pitch: 0, yaw: 0, roll: 0 }), [])
  const blocked = () => playerCombat.dead || !isGameInputActive() || playerActionState.mode === 'VAULT' || playerActionState.mode === 'DRIVE'
    || playerActionState.locked || highwaySequence.movementLocked || getCasetaScene().letterOpen
  const restoreCamera = () => {
    if (!pose.applied) return
    camera.position.sub(pose.offset)
    pose.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    pose.angles.x -= pose.pitch
    pose.angles.y -= pose.yaw
    pose.angles.z -= pose.roll
    camera.quaternion.setFromEuler(pose.angles)
    pose.applied = false
  }

  useEffect(() => {
    const down = event => {
      if (event.pointerType === 'touch') return
      if (event.button === 2) {
        if (!blocked() && batAttack.ready) {
          event.preventDefault()
          batEquipment.equipped = !batEquipment.equipped
        }
        return
      }
      if (event.button !== 0 || blocked() || !batAttack.ready
        || !batEquipment.equipped || !batEquipment.canAttack) return
      if (batAttack.active) {
        // Buffer one deliberate click; holding the button never auto-attacks.
        if (batAttack.elapsed <= BAT_CHAIN_TIME) batAttack.queued = true
        return
      }
      const now = performance.now() / 1000
      if (now < batAttack.nextAllowed) return
      Object.assign(batAttack, { active: true, phase: 'WINDUP', elapsed: 0, checked: false,
        hit: false, freeze: 0, impactAge: Infinity, nextAllowed: now + MELEE_COOLDOWN,
        direction: batAttack.readySide, queued: false })
      notifyBatSwing()
    }
    const lockChanged = () => { if (!document.pointerLockElement) cancelBatAttack() }
    const clear = () => { touchAttack.current.pending = false; cancelBatAttack() }
    const contextMenu = event => { if (document.pointerLockElement) event.preventDefault() }
    window.addEventListener('pointerdown', down)
    const unsubscribe = subscribeTouchAction('attack', () => {
      if (blocked() || !batAttack.ready) return
      batEquipment.equipped = true
      if (batEquipment.canAttack) down({ button: 0 })
      else touchAttack.current.pending = true
    })
    touchAttack.current.perform = () => down({ button: 0 })
    window.addEventListener('blur', clear)
    window.addEventListener('contextmenu', contextMenu)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      unsubscribe()
      touchAttack.current.pending = false
      touchAttack.current.perform = null
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('blur', clear)
      window.removeEventListener('contextmenu', contextMenu)
      document.removeEventListener('pointerlockchange', lockChanged)
      cancelBatAttack()
      restoreCamera()
    }
  }, [camera, pose])

  useFrame(restoreCamera, -3)
  useFrame((_, delta) => {
    if (touchAttack.current.pending) {
      if (blocked()) touchAttack.current.pending = false
      else if (batEquipment.canAttack) {
        touchAttack.current.pending = false
        touchAttack.current.perform?.()
      }
    }
    const swing = batAttack
    if (!swing.active) return
    if (blocked() || !batEquipment.equipped) { cancelBatAttack(); return }
    let dt = Math.min(delta, 0.05)
    if (swing.freeze > 0) {
      const held = Math.min(dt, swing.freeze)
      swing.freeze -= held
      dt -= held
    }
    swing.elapsed += dt
    if (Number.isFinite(swing.impactAge)) swing.impactAge += dt
    if (swing.queued && swing.elapsed >= BAT_CHAIN_TIME) {
      const now = performance.now() / 1000
      if (now >= swing.nextAllowed) {
        swing.readySide = -swing.direction
        Object.assign(swing, { elapsed: 0, checked: false, hit: false, freeze: 0,
          impactAge: Infinity, queued: false, direction: swing.readySide,
          phase: 'WINDUP', nextAllowed: now + MELEE_COOLDOWN })
        notifyBatSwing()
      } else swing.elapsed = BAT_CHAIN_TIME
    }
    camera.getWorldDirection(pose.forward)
    if (!swing.checked && swing.elapsed >= BAT_HIT_TIME) {
      // Exactly one check at contact, using the base aim before camera offsets.
      swing.elapsed = BAT_HIT_TIME
      swing.checked = true
      // Sample the striking end of the actual weapon trajectory on each side
      // of contact. The hit direction follows the swing, not a random sign.
      sampleBatMotion(BAT_HIT_TIME - 0.006, pose.batPosition, pose.batRotation, null, null, swing.direction)
      pose.batQuaternion.setFromEuler(pose.batRotation)
      pose.batBefore.set(0, BAT_TIP_LOCAL_Y, 0).applyQuaternion(pose.batQuaternion).add(pose.batPosition)
      sampleBatMotion(BAT_HIT_TIME + 0.006, pose.batPosition, pose.batRotation, null, null, swing.direction)
      pose.batQuaternion.setFromEuler(pose.batRotation)
      pose.batAfter.set(0, BAT_TIP_LOCAL_Y, 0).applyQuaternion(pose.batQuaternion).add(pose.batPosition)
      pose.swingDirection.subVectors(pose.batAfter, pose.batBefore).normalize().applyQuaternion(camera.quaternion)
      swing.hit = strikeMelee(camera.position, pose.forward, pose.swingDirection)
      if (swing.hit) {
        swing.freeze = BAT_HIT_STOP
        swing.impactAge = 0
        notifyBatImpact()
      }
    }
    if (swing.elapsed >= BAT_DURATION && !swing.queued) { cancelBatAttack(true); return }
    swing.phase = swing.freeze > 0 ? 'IMPACT' : swing.elapsed < BAT_WINDUP ? 'WINDUP'
      : swing.elapsed < BAT_WINDUP + BAT_SWING ? 'SWING' : swing.elapsed < BAT_DURATION ? 'RECOVER' : 'CHAIN_WAIT'
    sampleBatMotion(swing.elapsed, null, null, pose.local, pose.rotation, swing.direction)
    const kick = Number.isFinite(swing.impactAge)
      ? (1 - THREE.MathUtils.smoothstep(swing.impactAge, 0, BAT_IMPACT_DURATION))
        * Math.cos(swing.impactAge / BAT_IMPACT_DURATION * Math.PI * 0.7) : 0
    pose.local.z += BAT_IMPACT_BACK * kick
    pose.rotation.x += BAT_IMPACT_ROTATION[0] * kick
    pose.rotation.y += BAT_IMPACT_ROTATION[1] * kick * swing.direction
    pose.rotation.z += BAT_IMPACT_ROTATION[2] * kick * swing.direction
    pose.offset.copy(pose.local).applyQuaternion(camera.quaternion)
    camera.position.add(pose.offset)
    pose.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    const limitedPitch = THREE.MathUtils.clamp(pose.angles.x + pose.rotation.x, -1.569, 1.569)
    pose.pitch = limitedPitch - pose.angles.x
    pose.yaw = pose.rotation.y
    pose.roll = pose.rotation.z
    pose.angles.x = limitedPitch
    pose.angles.y += pose.yaw
    pose.angles.z += pose.roll
    camera.quaternion.setFromEuler(pose.angles)
    pose.applied = true
  }, -0.5)
  return null
}
