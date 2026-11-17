import * as THREE from 'three'
import { ENTITY_STATE as S } from '../player/meleeConfig'
import { batAttack } from '../player/batAttackState'
import { entityPositionFree, occluded } from '../player/meleeWorld'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { WORLD_WIDTH, WORLD_LENGTH, WORLD_CENTER_Z } from './terrain'
import * as C from './entityAbilitiesConfig'
import { entityBodyOpacity, restoreEntityBodySurface } from './entityVisual'

export function createEntityAbilities({ combat, root, camera, materials, actions, enterState, showSmoke }) {
  const probe = new THREE.Vector3(), start = new THREE.Vector3(), destination = new THREE.Vector3()
  const toward = new THREE.Vector3(), forward = new THREE.Vector3(), chest = new THREE.Vector3()
  const original = materials.map(m => ({ opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }))
  const smoke = { active: false, elapsed: 0, duration: C.TELEPORT_SMOKE_DURATION, serial: 0, position: new THREE.Vector3() }
  let now = 0, dodgeReady = 0, teleportReady = C.TELEPORT_COOLDOWN, nextCheck = 0
  let farTime = 0, chaseTime = 0, recoveryUntil = 0, dodgeSide = 1, dodgeYaw = 0
  let lastHit = -Infinity, previousHit = -Infinity
  let nextArrivalAttempt = 0
  combat.meleeEnabled = true

  const eligible = () => combat.health > 0 && (combat.state === S.IDLE || combat.state === S.CHASE)
  const distanceToPlayer = p => Math.hypot(p.x - camera.position.x, p.z - camera.position.z)
  function validGround(p, clearance = 0) {
    if (Math.abs(p.x) > WORLD_WIDTH / 2 - 1 || Math.abs(p.z - WORLD_CENTER_Z) > WORLD_LENGTH / 2 - 1) return false
    const ground = getWalkableHeightAt(p.x, p.z)
    if (!Number.isFinite(ground)) return false
    p.y = ground + 0.02
    const r = combat.radius + clearance
    for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (Math.abs(getWalkableHeightAt(p.x + x, p.z + z) - ground) > C.GROUND_MAX_VARIATION) return false
    }
    return entityPositionFree(p, r, combat.height)
  }
  function validDestination(p) {
    const distance = distanceToPlayer(p)
    return distance >= C.TELEPORT_MIN_DISTANCE && distance <= C.TELEPORT_MAX_DISTANCE
      && validGround(p, 0.12)
      && Math.abs(p.y - getWalkableHeightAt(camera.position.x, camera.position.z)) <= C.TELEPORT_MAX_HEIGHT_CHANGE
  }
  function chooseDestination() {
    camera.getWorldDirection(forward)
    const heading = Math.atan2(forward.x, forward.z)
    for (let attempt = 0; attempt < C.TELEPORT_CANDIDATES; attempt++) {
      let choice = Math.random(), region = 0
      while (region < C.TELEPORT_WEIGHTS.length - 1 && choice > C.TELEPORT_WEIGHTS[region]) {
        choice -= C.TELEPORT_WEIGHTS[region++]
      }
      const angle = heading + C.TELEPORT_ANGLES[region] + (Math.random() - 0.5) * C.TELEPORT_ANGLE_JITTER
      const radius = C.TELEPORT_MIN_DISTANCE + Math.random() * (C.TELEPORT_MAX_DISTANCE - C.TELEPORT_MIN_DISTANCE)
      probe.set(camera.position.x + Math.sin(angle) * radius, 0, camera.position.z + Math.cos(angle) * radius)
      if (validDestination(probe) && probe.distanceTo(root.current.position) > 2) {
        destination.copy(probe)
        return true
      }
    }
    return false
  }
  function restore() {
    root.current.visible = true
    combat.meleeEnabled = true
    materials.forEach((m, i) => {
      const base = original[i]
      m.opacity = i === 0 ? entityBodyOpacity() : base.opacity
      if (m.transparent !== base.transparent || m.depthWrite !== base.depthWrite) {
        m.transparent = base.transparent; m.depthWrite = base.depthWrite; m.needsUpdate = true
      }
    })
    restoreEntityBodySurface(materials[0])
  }
  function opacity(body, eyes, aura = body) {
    materials.forEach((m, i) => {
      if (!m.transparent || m.depthWrite) {
        m.transparent = true; m.depthWrite = false; m.needsUpdate = true
      }
      m.opacity = Math.min(1, (i === 0 ? entityBodyOpacity() : original[i].opacity) * (i === 1 ? eyes : i > 1 ? aura : body))
    })
  }
  function emit() {
    smoke.active = true; smoke.elapsed = 0; smoke.serial++
    root.current.getWorldPosition(smoke.position)
    showSmoke(true)
  }
  function interrupt() {
    if (combat.state === S.TELEPORT_OUT || combat.state === S.TELEPORT_IN) restore()
    if (combat.state === S.DODGE) root.current.rotation.z = 0
    if (smoke.active) { smoke.active = false; showSmoke(false) }
  }
  function attemptDodge() {
    if (!eligible() || now < dodgeReady || now < recoveryUntil) return
    toward.subVectors(camera.position, root.current.position); toward.y = 0
    const distance = toward.length()
    if (distance > C.DODGE_RANGE || distance < 0.1) return
    toward.normalize()
    const facing = toward.x * Math.sin(root.current.rotation.y) + toward.z * Math.cos(root.current.rotation.y)
    chest.copy(root.current.position); chest.y += 1.2
    if (facing < 0.3 || occluded(chest, camera.position)
      || Math.random() >= C.DODGE_CHANCE * (combat.lightAbilityChance ?? 1)) return
    const firstSide = Math.random() < 0.5 ? -1 : 1
    for (const side of [firstSide, -firstSide]) {
      const steps = Math.ceil(C.DODGE_DISTANCE / C.DODGE_PATH_STEP)
      let free = true
      for (let i = 1; i <= steps; i++) {
        probe.copy(root.current.position)
        probe.x += toward.z * side * C.DODGE_DISTANCE * i / steps
        probe.z -= toward.x * side * C.DODGE_DISTANCE * i / steps
        if (!validGround(probe) || distanceToPlayer(probe) < combat.radius + 0.35
          || Math.abs(probe.y - root.current.position.y) > C.GROUND_MAX_VARIATION) { free = false; break }
      }
      if (!free) continue
      start.copy(root.current.position); destination.copy(probe)
      dodgeSide = side; dodgeYaw = root.current.rotation.y
      dodgeReady = now + C.DODGE_COOLDOWN
      combat.state = S.DODGE; combat.elapsed = 0
      if (actions.mapping.dodge) actions.playEntityAction('dodge', { once: true, restart: true })
      console.info('[entity] dodge ' + (side < 0 ? 'left' : 'right'))
      break
    }
  }
  return {
    smoke, attemptDodge,
    interruptForLight: interrupt,
    canAttack: () => now >= recoveryUntil,
    hit() { previousHit = lastHit; lastHit = now; interrupt() },
    advance(dt) {
      now += dt
      if (smoke.active) {
        smoke.elapsed += dt
        if (smoke.elapsed >= smoke.duration) { smoke.active = false; showSmoke(false) }
      }
    },
    update(dt) {
      if (combat.state === S.DODGE) {
        probe.lerpVectors(start, destination, THREE.MathUtils.smoothstep(combat.elapsed, 0, C.DODGE_DURATION))
        if (distanceToPlayer(probe) >= combat.radius + 0.35 && validGround(probe)) root.current.position.copy(probe)
        root.current.rotation.z = dodgeSide * C.DODGE_TILT * Math.sin(Math.PI * Math.min(1, combat.elapsed / C.DODGE_DURATION))
        if (combat.elapsed >= C.DODGE_DURATION) {
          root.current.rotation.z = 0; root.current.rotation.y = dodgeYaw
          enterState(S.IDLE)
        }
        return true
      }
      if (combat.state === S.TELEPORT_OUT) {
        const t = combat.elapsed
        if (t < C.TELEPORT_OUT_DURATION) {
          const phase = t / C.TELEPORT_OUT_DURATION
          opacity(1 - THREE.MathUtils.smoothstep(phase, 0, 1),
            1 - THREE.MathUtils.smoothstep(phase, 0.65, 1), 1 + Math.sin(phase * Math.PI))
        } else {
          root.current.visible = false; combat.meleeEnabled = false
          if (t >= C.TELEPORT_OUT_DURATION + C.TELEPORT_HIDDEN_DURATION && now >= nextArrivalAttempt) {
            // Recheck against the current player location after the absence.
            const valid = validDestination(destination) || chooseDestination()
            // If the player occupied every candidate during the absence, wait
            // for a safe point instead of re-forming inside/next to the player.
            if (!valid) { nextArrivalAttempt = now + C.TELEPORT_DESTINATION_RECHECK; return true }
            root.current.position.copy(destination)
            root.current.visible = true
            combat.state = S.TELEPORT_IN; combat.elapsed = 0
            recoveryUntil = now + C.TELEPORT_IN_DURATION + C.TELEPORT_RECOVERY
            opacity(0, 0, 0)
            emit()
            console.info('[entity] teleport in')
          }
        }
        return true
      }
      if (combat.state === S.TELEPORT_IN) {
        root.current.rotation.y = Math.atan2(camera.position.x - root.current.position.x, camera.position.z - root.current.position.z)
        const t = combat.elapsed
        const body = THREE.MathUtils.smoothstep(t, C.TELEPORT_IN_BODY_DELAY, C.TELEPORT_IN_DURATION)
        opacity(body, THREE.MathUtils.smoothstep(t, C.TELEPORT_IN_EYES_DELAY, C.TELEPORT_IN_BODY_DELAY), body)
        combat.meleeEnabled = t >= C.TELEPORT_IN_BODY_DELAY
        if (t >= C.TELEPORT_IN_DURATION) {
          restore(); recoveryUntil = now + C.TELEPORT_RECOVERY
          enterState(S.IDLE)
        }
        return true
      }
      if (!eligible() || !combat.alerted) { farTime = 0; chaseTime = 0; return false }
      farTime = distanceToPlayer(root.current.position) >= C.TELEPORT_FAR_DISTANCE ? farTime + dt : 0
      chaseTime = combat.state === S.CHASE ? chaseTime + dt : 0
      if (now < teleportReady || now < recoveryUntil || now < nextCheck || batAttack.active) return false
      nextCheck = now + C.TELEPORT_CHECK_INTERVAL
      if (farTime < C.TELEPORT_FAR_TIME && chaseTime < C.TELEPORT_CHASE_TIME
        && now - previousHit > C.TELEPORT_HIT_WINDOW) return false
      if (Math.random() >= C.TELEPORT_CHANCE * (combat.lightAbilityChance ?? 1) || !chooseDestination()) return false
      teleportReady = now + C.TELEPORT_COOLDOWN
      farTime = chaseTime = 0
      combat.state = S.TELEPORT_OUT; combat.elapsed = 0
      actions.playEntityAction('idle')
      emit()
      console.info('[entity] teleport out')
      return true
    },
  }
}
