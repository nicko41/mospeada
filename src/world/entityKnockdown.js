import * as THREE from 'three'
import { entityPositionFree } from '../player/meleeWorld'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import * as C from './entityHitReactionConfig'

// A visual pivot at the feet; the normal gameplay root stays upright.
export function createEntityKnockdown(root, pivot) {
  const direction = new THREE.Vector3(), axis = new THREE.Vector3()
  const inverse = new THREE.Quaternion(), probe = new THREE.Vector3()
  let active = false, cooldown = 0, amount = 0
  const recoveryStart = C.FALL_DURATION + C.FALL_HOLD_DURATION
  return {
    get active() { return active },
    get recoveryStart() { return recoveryStart },
    advance(dt) { cooldown = Math.max(0, cooldown - dt) },
    attempt(push, from, to, height) {
      if (active || cooldown > 0 || Math.random() >= C.FALL_CHANCE) return false
      // Check the swept body footprint, including the existing knockback path.
      for (let travel = 0; travel <= 4; travel++) {
        for (let body = 0; body <= 6; body++) {
          probe.lerpVectors(from, to, travel / 4).addScaledVector(push, height * body / 6)
          const ground = getWalkableHeightAt(probe.x, probe.z)
          if (!Number.isFinite(ground) || Math.abs(ground - to.y) > 0.15
            || !entityPositionFree(probe, 0.5, height)) return false
        }
      }
      direction.copy(push)
      root.current.getWorldQuaternion(inverse).invert()
      axis.set(push.z, 0, -push.x).applyQuaternion(inverse).normalize()
      cooldown = C.FALL_COOLDOWN
      active = true
      return true
    },
    update(elapsed) {
      if (!active || !pivot.current) return
      const fall = THREE.MathUtils.smoothstep(elapsed, 0, C.FALL_DURATION)
      const rise = THREE.MathUtils.smoothstep(elapsed, recoveryStart,
        recoveryStart + C.FALL_RECOVERY_DURATION)
      amount = fall * (1 - rise)
      pivot.current.quaternion.setFromAxisAngle(axis, C.FALL_ANGLE * amount)
      pivot.current.position.y = C.FALL_GROUND_CLEARANCE * amount
      if (rise === 1) active = false
    },
    syncTarget(combat, normalRadius, normalHeight) {
      combat.position.addScaledVector(direction, normalHeight * 0.45 * amount)
      combat.radius = THREE.MathUtils.lerp(normalRadius, 0.55, amount)
      combat.height = THREE.MathUtils.lerp(normalHeight, 1.1, amount)
    },
  }
}
