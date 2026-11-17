import * as THREE from 'three'
import { phoneLightState } from '../player/PhoneLight'
import { occluded } from '../player/meleeWorld'
import { ENTITY_STATE as S } from '../player/meleeConfig'
import * as C from '../player/flashlightConfig'

export function createEntityLightStun({ combat, root, pivot, materials, actions, abilities }) {
  const chest = new THREE.Vector3(), ray = new THREE.Vector3()
  const cosine = Math.cos(THREE.MathUtils.degToRad(C.FLASHLIGHT_STUN_CONE / 2))
  const baseOpacity = materials.map(material => material.opacity)
  let sample = Math.random() / C.FLASHLIGHT_EVALUATION_HZ
  let illuminated = false, stunned = false, hold = 0, recovery = 0, time = 0, pulse = 0
  let visualApplied = false
  combat.lightExposure = 0
  combat.lightMovement = combat.lightAnimation = combat.lightAbilityChance = 1

  function restoreVisual() {
    if (!visualApplied) return
    pivot.current.position.set(0, 0, 0)
    pivot.current.rotation.set(0, 0, 0)
    for (let i = 1; i < materials.length; i++) materials[i].opacity = baseOpacity[i]
    materials[1].color.setScalar(1)
    visualApplied = false
  }
  return {
    restoreVisual,
    update(dt) {
      if (combat.state === S.DEAD) return false
      time += dt
      sample -= dt
      if (sample <= 0) {
        sample += 1 / C.FLASHLIGHT_EVALUATION_HZ
        illuminated = false
        if (phoneLightState.enabled && root.current.visible && combat.meleeEnabled !== false) {
          combat.syncPosition()
          chest.copy(combat.position); chest.y += combat.height * 0.65
          ray.subVectors(chest, phoneLightState.position)
          const distance = ray.length()
          if (distance <= Math.min(C.FLASHLIGHT_STUN_RANGE, phoneLightState.range)
            && distance > 0.001 && ray.dot(phoneLightState.direction) / distance >= cosine) {
            illuminated = !occluded(phoneLightState.position, chest)
          }
        }
      }
      // Switching off never carries a stale positive sample into exposure.
      if (!phoneLightState.enabled || !root.current.visible || combat.meleeEnabled === false) illuminated = false
      if (illuminated) {
        combat.alerted = true
        combat.lightExposure = Math.min(1, combat.lightExposure + dt / C.FLASHLIGHT_EXPOSURE_TIME)
        if (combat.lightExposure >= 1) {
          stunned = true; hold = C.FLASHLIGHT_STUN_HOLD; recovery = 0
        }
      } else if (stunned) {
        hold -= dt
        if (hold <= 0) { stunned = false; recovery = C.FLASHLIGHT_RECOVERY_TIME }
      } else {
        combat.lightExposure = Math.max(0, combat.lightExposure - dt / C.FLASHLIGHT_RECOVERY_TIME)
      }
      if (!stunned && recovery > 0) recovery = Math.max(0, recovery - dt)
      const exposure = combat.lightExposure
      const regain = 1 - recovery / C.FLASHLIGHT_RECOVERY_TIME
      combat.lightMovement = Math.min(1 - exposure * (1 - C.FLASHLIGHT_MIN_MOVEMENT), regain)
      combat.lightAnimation = Math.min(1 - exposure * (1 - C.FLASHLIGHT_MIN_ANIMATION), 0.08 + regain * 0.92)
      combat.lightAbilityChance = stunned || recovery > 0 ? 0 : 1 - THREE.MathUtils.smoothstep(exposure, 0.5, 1)

      // Keep accumulating exposure while melee owns the body, but never replace
      // hit stop, knockback, falls or their recovery with the light animation.
      if (combat.state === S.STAGGER) return false
      if (stunned) {
        if (combat.state !== S.LIGHT_STUN) {
          abilities.interruptForLight()
          combat.state = S.LIGHT_STUN; combat.elapsed = 0; combat.hitChecked = true
          actions.playEntityAction('idle')
          pulse = 0.16
          console.info('[entity] light stun')
        }
        combat.lightMovement = 0
      } else if (combat.state === S.LIGHT_STUN || (recovery > 0 && combat.state !== S.LIGHT_RECOVER)) {
        abilities.interruptForLight()
        combat.state = S.LIGHT_RECOVER; combat.elapsed = 0
        console.info('[entity] light recover')
      } else if (combat.state === S.LIGHT_RECOVER && recovery <= 0) {
        combat.state = S.CHASE; combat.elapsed = 0
      }
      if (combat.state !== S.TELEPORT_OUT && combat.state !== S.TELEPORT_IN && exposure > 0) {
        pulse = Math.max(0, pulse - dt)
        const contraction = Math.sin(Math.PI * pulse / 0.16) * 0.045
        pivot.current.position.y = -contraction
        pivot.current.rotation.x = exposure * 0.025 + contraction
        pivot.current.rotation.z = Math.sin(time * 31) * 0.008 * exposure
        for (let i = 2; i < materials.length; i++) {
          materials[i].opacity = baseOpacity[i] * (1 + exposure * (0.35 + Math.sin(time * 23 + i) * 0.25) + contraction * 6)
        }
        materials[1].color.setScalar(1 - exposure * (0.08 + Math.sin(time * 29) * 0.08))
        visualApplied = true
      }
      return combat.state === S.LIGHT_STUN
    },
  }
}
