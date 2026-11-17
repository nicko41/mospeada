import * as THREE from 'three'
import { ANIM_FADE, WALK_REFERENCE_SPEED, WALK_REFERENCE_TIME_SCALE,
  WALK_MAX_TIME_SCALE, WALK_STOP_SPEED } from '../player/meleeConfig'

// Central mapping: Bite is the attack supplied by this FBX. Attack candidates
// are excluded from reaction matching so hitAttack cannot become a hurt clip.
export const ENTITY_CLIP_PATTERNS = {
  idle: /idle|stand/i, walk: /walk/i, run: /run/i,
  attack: /attack|punch|strike|hitAttack|melee|bite/i,
  reaction: /hit|damage|hurt|impact|reaction/i,
  death: /death|die|dead|fall/i,
  dodge: /dodge|evade|step|strafe/i,
}

export function createEntityActions(mixer, clips, options = {}) {
  const mapping = Object.fromEntries(Object.entries(ENTITY_CLIP_PATTERNS).map(([role, pattern]) =>
    [role, clips.find(clip => pattern.test(clip.name)
      && (role !== 'reaction' || !ENTITY_CLIP_PATTERNS.attack.test(clip.name)))]))
  for (const [role, name] of Object.entries(options.clips ?? {})) {
    mapping[role] = name === null ? undefined : clips.find(clip => clip.name === name)
  }
  const referenceSpeed = options.referenceSpeed ?? WALK_REFERENCE_SPEED
  mapping.locomotion = mapping.walk ?? mapping.run ?? mapping.idle ?? clips[0]
  let current = null
  return {
    mapping,
    beginHitOverride() {
      // Capture the pose before calling this. Stop all fading locomotion/attack
      // actions as well, so no pending crossfade can restore their authority.
      mixer.stopAllAction()
      current = null
      if (mapping.reaction) this.playEntityAction('reaction', { once: true, restart: true })
    },
    recoverFromHit() {
      // The hit-pose layer supplies the recovery crossfade over the entire rig.
      this.playEntityAction('locomotion', { speed: WALK_REFERENCE_TIME_SCALE })
    },
    syncLocomotion(actualSpeed) {
      const moving = actualSpeed > WALK_STOP_SPEED
      this.playEntityAction(moving ? 'locomotion' : 'idle', {
        preservePhase: moving,
        speed: moving ? THREE.MathUtils.clamp(actualSpeed / referenceSpeed
          * WALK_REFERENCE_TIME_SCALE, 0.01, WALK_MAX_TIME_SCALE) : 1,
      })
    },
    playEntityAction(name, { once = false, restart = false, speed = 1, preservePhase = false } = {}) {
      const clip = mapping[name] ?? mapping.idle ?? mapping.locomotion
      if (!clip) return 0
      const next = mixer.clipAction(clip)
      if (next === current && !restart) {
        next.setEffectiveTimeScale(speed)
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
        next.clampWhenFinished = once
        return clip.duration / speed
      }
      const previous = current
      const previousTime = next.time
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed)
      if (preservePhase) next.time = previousTime
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
      next.clampWhenFinished = once
      next.play()
      if (previous && previous !== next) next.crossFadeFrom(previous, ANIM_FADE, false)
      current = next
      return clip.duration / speed
    },
  }
}
