import * as THREE from 'three'
import * as C from './entityHitReactionConfig'

export function createEntityHitReaction(model, root) {
  const names = new Map(), pose = []
  model.traverse(bone => {
    if (!bone.isBone) return
    const item = { bone, frozen: new THREE.Quaternion(), frozenPosition: new THREE.Vector3(),
      frozenScale: new THREE.Vector3(), base: new THREE.Quaternion(),
      basePosition: new THREE.Vector3(), baseScale: new THREE.Vector3() }
    pose.push(item)
    const name = bone.name.split(':').pop().replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
    names.set(name, item)
  })
  const entries = [], used = new Set()
  for (const definition of C.HIT_BONES) {
    const item = definition.aliases.map(name => names.get(name)).find(Boolean)
    if (!item || used.has(item.bone)) continue
    used.add(item.bone)
    entries.push({ ...item, ...definition, limit: THREE.MathUtils.degToRad(definition.degrees) })
  }
  const localDirection = new THREE.Vector3(), angular = new THREE.Vector3()
  const headDirection = new THREE.Vector3()
  const rootRotation = new THREE.Quaternion(), parentInverse = new THREE.Quaternion()
  const offset = new THREE.Quaternion(), target = new THREE.Quaternion()
  let active = false, applied = false, elapsed = 0, recovery = C.HIT_RECOVERY_DURATION
  let recoveryStart = C.HIT_RECOIL_DURATION
  let amplitude = 1, variation = 1, count = 0, variant = 1
  let direction = 'FRONT'
  const variantSeed = model.uuid.charCodeAt(0) + model.uuid.charCodeAt(1)

  function restore() {
    if (!applied) return
    for (const item of pose) {
      item.bone.quaternion.copy(item.base)
      item.bone.position.copy(item.basePosition)
      item.bone.scale.copy(item.baseScale)
    }
    applied = false
  }
  return {
    get direction() { return direction },
    get duration() { return recoveryStart + recovery },
    restore,
    cancel() { restore(); active = false },
    freeze() { active = false; applied = false },
    trigger(worldDirection, interruptedAttack, strength = C.HIT_STRENGTH, knockdown = false, swingDirection) {
      // Capture the visible full-body pose, including an interrupted reaction.
      // Then remove its old layer before replacing it with the new hit.
      for (const item of pose) {
        item.frozen.copy(item.bone.quaternion)
        item.frozenPosition.copy(item.bone.position)
        item.frozenScale.copy(item.bone.scale)
      }
      restore()
      root.current.getWorldQuaternion(rootRotation)
      localDirection.copy(worldDirection).applyQuaternion(rootRotation.invert())
      localDirection.y = 0
      localDirection.normalize()
      headDirection.copy(swingDirection ?? worldDirection).applyQuaternion(rootRotation)
        .multiplyScalar(0.8).addScaledVector(localDirection, 0.35).normalize()
      direction = Math.abs(localDirection.x) > Math.abs(localDirection.z)
        ? localDirection.x > 0 ? 'LEFT' : 'RIGHT' : localDirection.z < 0 ? 'FRONT' : 'BACK'
      count++
      variant = (count + variantSeed) % 2 ? 1 : -1
      variation = Math.sin((count + variantSeed) * 2.39996)
      amplitude = THREE.MathUtils.clamp(strength, 0, 1.5)
        * (1 + variation * C.HIT_AMPLITUDE_VARIATION)
        * (interruptedAttack ? C.HIT_ATTACK_INTERRUPT_BOOST : 1)
      recovery = C.HIT_RECOVERY_DURATION + (interruptedAttack ? C.HIT_INTERRUPT_RECOVERY_EXTRA : 0)
      recoveryStart = knockdown ? C.FALL_DURATION + C.FALL_HOLD_DURATION : C.HIT_RECOIL_DURATION
      if (knockdown) recovery = C.FALL_RECOVERY_DURATION
      elapsed = 0
      active = true
    },
    apply(dt) {
      if (!active) return
      elapsed += dt
      const recoveryProgress = THREE.MathUtils.smoothstep(elapsed,
        recoveryStart, recoveryStart + recovery)
      if (recoveryProgress === 1) { active = false; return }
      const hold = 1 - recoveryProgress
      // Legs and all other bones stop cycling. During recovery the fresh mixer
      // pose gradually regains control, not just the torso.
      for (const item of pose) {
        item.base.copy(item.bone.quaternion)
        item.basePosition.copy(item.bone.position)
        item.baseScale.copy(item.bone.scale)
        item.bone.quaternion.slerp(item.frozen, hold)
        item.bone.position.lerp(item.frozenPosition, hold)
        item.bone.scale.lerp(item.frozenScale, hold)
      }
      root.current.getWorldQuaternion(rootRotation)
      for (const entry of entries) {
        const whip = entry.role === 'head' || entry.role === 'neck'
        const lag = whip ? entry.lag : entry.lag * (1 + variation * C.HIT_DURATION_VARIATION)
        const time = Math.max(0, elapsed - lag)
        const rise = 0.45 + 0.55 * THREE.MathUtils.smoothstep(time, 0, C.HIT_RISE_TIME)
        const delayed = elapsed < lag ? elapsed / lag : 1
        const settling = Math.max(0, (elapsed - recoveryStart) / recovery)
        const bend = rise * delayed * Math.cos(settling * Math.PI * 1.35)
        const side = entry.side ?? 0
        const leg = entry.role === 'leftLeg' || entry.role === 'rightLeg'
        const pelvis = entry.role === 'pelvis'
        angular.set(localDirection.z * (leg ? (side === variant ? -0.7 : 0.25) : 1),
          -localDirection.x * 0.6 + (pelvis ? variant * 0.25 : 0),
          -localDirection.x + side * Math.abs(localDirection.z) * (leg ? 0.15 : 0.3))
        angular.multiplyScalar(entry.limit * amplitude * bend)
        if (whip) {
          // Analytic damped impulse: delayed peak, small rebound, then rest.
          // Target is relative to the captured impact pose, with a strict cap.
          const response = Math.exp(-C.HEAD_WHIP_DAMPING * time)
            * Math.sin(C.HEAD_WHIP_FREQUENCY * time) * 1.65
          angular.set(headDirection.z - headDirection.y * 0.25,
            -headDirection.x * 0.75, -headDirection.x * 0.65)
            .normalize().multiplyScalar(entry.limit * amplitude * response)
        }
        const angle = Math.min(entry.limit, angular.length())
        target.copy(entry.frozen)
        if (angle > 0.000001) {
          entry.bone.parent.getWorldQuaternion(parentInverse).invert()
          angular.normalize().applyQuaternion(rootRotation).applyQuaternion(parentInverse)
          offset.setFromAxisAngle(angular, angle)
          target.premultiply(offset)
        }
        entry.bone.quaternion.slerp(target, C.HIT_OVERRIDE_WEIGHT * hold)
      }
      applied = true
    },
  }
}
