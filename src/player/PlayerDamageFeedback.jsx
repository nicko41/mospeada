import { isGameInputActive } from './touchInput'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { playerCombat } from './playerCombat'
import { playerActionState } from './FirstPersonRig'
import * as FX from './damageFeedbackConfig'
import usePlayerHurtAudio from './usePlayerHurtAudio'

export default function PlayerDamageFeedback() {
  const deathAudioFinished = usePlayerHurtAudio()
  const { camera } = useThree()
  const state = useMemo(() => ({
    version: playerCombat.hitVersion, elapsed: Infinity, critical: 0, phase: 0, death: 0,
    deathElapsed: 0, restarting: false,
    pitch: 0, yaw: 0, roll: 0, hitPitch: 0, hitYaw: 0, applied: false,
    offset: new THREE.Vector3(), away: new THREE.Vector3(),
    forward: new THREE.Vector3(), right: new THREE.Vector3(),
    angles: new THREE.Euler(0, 0, 0, 'YXZ'), layers: null,
  }), [])
  const restore = () => {
    if (!state.applied) return
    camera.position.sub(state.offset)
    state.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    state.angles.x -= state.pitch
    state.angles.y -= state.yaw
    state.angles.z -= state.roll
    camera.quaternion.setFromEuler(state.angles)
    state.applied = false
  }
  useEffect(() => {
    const overlay = document.createElement('div')
    overlay.className = 'damage-feedback'
    overlay.setAttribute('aria-hidden', 'true')
    const layers = {}
    for (const name of ['critical', 'veil', 'hit', 'death']) {
      const layer = document.createElement('div')
      layer.className = 'damage-feedback-' + name
      layer.style.opacity = '0'
      overlay.appendChild(layer)
      layers[name] = layer
    }
    const pulse = document.createElement('div')
    pulse.className = 'damage-feedback-vignette'
    pulse.style.setProperty('--breath-min', FX.CRITICAL_VIGNETTE_MIN)
    pulse.style.setProperty('--breath-max', FX.CRITICAL_VIGNETTE_MAX)
    pulse.style.animationDuration = FX.CRITICAL_BREATH_PERIOD + 's'
    layers.critical.appendChild(pulse)
    layers.pulse = pulse
    document.body.appendChild(overlay)
    state.layers = layers
    return () => { restore(); overlay.remove(); state.layers = null }
  }, [camera, state])

  // Undo feedback before melee's restore (-3), narrative (-2) and movement (-1).
  // Add it back after melee (-0.5). No feedback offset becomes player position.
  useFrame(restore, -4)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (state.version !== playerCombat.hitVersion) {
      state.version = playerCombat.hitVersion
      state.elapsed = 0
      camera.getWorldDirection(state.forward)
      state.forward.y = 0
      state.forward.normalize()
      state.right.crossVectors(state.forward, camera.up).normalize()
      if (playerCombat.hasHitSource) {
        state.away.copy(camera.position).sub(playerCombat.hitSource)
        state.away.y = 0
      } else state.away.copy(state.forward).negate()
      if (state.away.lengthSq() < 0.0001) state.away.copy(state.forward).negate()
      state.away.normalize()
      state.hitYaw = -state.away.dot(state.right) * FX.PLAYER_HIT_KICK_ROTATION
      state.hitPitch = -state.away.dot(state.forward) * FX.PLAYER_HIT_KICK_ROTATION
    }
    state.elapsed += dt
    const hit = THREE.MathUtils.smoothstep(state.elapsed, 0, FX.PLAYER_HIT_RISE)
      * (1 - THREE.MathUtils.smoothstep(state.elapsed, FX.PLAYER_HIT_RISE, FX.PLAYER_HIT_CAMERA_DURATION))
    const ratio = playerCombat.playerHealth / playerCombat.playerMaxHealth
    const criticalTarget = !playerCombat.dead && ratio <= FX.CRITICAL_HEALTH_THRESHOLD
      ? 0.75 + 0.25 * THREE.MathUtils.clamp(1 - ratio / FX.CRITICAL_HEALTH_THRESHOLD, 0, 1) : 0
    state.critical = THREE.MathUtils.damp(state.critical, criticalTarget, 5 / FX.CRITICAL_FADE_DURATION, dt)
    if (state.critical < 0.001 && !criticalTarget) state.critical = 0
    state.phase = (state.phase + dt * Math.PI * 2 / FX.CRITICAL_BREATH_PERIOD) % (Math.PI * 2)
    state.death = playerCombat.dead ? Math.min(1, state.death + dt / FX.PLAYER_DEATH_FADE_DURATION) : 0
    state.deathElapsed = playerCombat.dead ? state.deathElapsed + dt : 0
    if (playerCombat.dead && !state.restarting && state.death === 1
      && state.deathElapsed >= FX.PLAYER_DEATH_RESTART_DELAY
      && (deathAudioFinished.current || state.deathElapsed >= 30)) {
      // Full prototype restart also resets enemy instances, narrative and cooldowns.
      state.restarting = true
      window.location.reload()
      return
    }
    if (state.layers) {
      const opacity = (layer, value) => {
        const text = value.toFixed(3)
        if (layer.style.opacity !== text) layer.style.opacity = text
      }
      opacity(state.layers.critical, state.critical)
      opacity(state.layers.veil, state.critical * FX.CRITICAL_VEIL_OPACITY)
      opacity(state.layers.hit, FX.PLAYER_HIT_DARKEN_OPACITY
        * (1 - THREE.MathUtils.smoothstep(state.elapsed, FX.PLAYER_HIT_DARKEN_HOLD, FX.PLAYER_HIT_DARKEN_DURATION)))
      opacity(state.layers.death, state.death)
      state.layers.pulse.style.animationPlayState = state.critical > 0 ? 'running' : 'paused'
    }
    // Vault owns its full camera trajectory; overlays still communicate damage.
    if ((!hit && !state.critical) || !isGameInputActive()
      || playerActionState.mode === 'VAULT' || playerActionState.mode === 'DRIVE' || playerActionState.locked || playerCombat.dead) return
    const breath = Math.sin(state.phase) * state.critical
    const shake = hit ? Math.sin(state.elapsed * FX.PLAYER_HIT_SHAKE_FREQUENCY * Math.PI * 2)
      * FX.PLAYER_HIT_SHAKE * hit : 0
    state.offset.copy(state.away).multiplyScalar(FX.PLAYER_HIT_KICK_POSITION * hit)
    state.offset.y = breath * FX.CRITICAL_CAMERA_Y + shake
    state.offset.addScaledVector(state.right, shake * 0.5)
    camera.position.add(state.offset)
    state.angles.setFromQuaternion(camera.quaternion, 'YXZ')
    const pitch = THREE.MathUtils.clamp(state.angles.x + state.hitPitch * hit, -1.569, 1.569)
    state.pitch = pitch - state.angles.x
    state.yaw = state.hitYaw * hit
    state.roll = Math.sin(state.phase + 0.6) * state.critical * FX.CRITICAL_CAMERA_ROLL
    state.angles.x = pitch
    state.angles.y += state.yaw
    state.angles.z += state.roll
    camera.quaternion.setFromEuler(state.angles)
    state.applied = true
  }, -0.4)
  return null
}
