import { isGameInputActive } from '../player/touchInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ZOMBIE02_OPTIONS, ZOMBIE02_ANIMATION_OPTIONS, prepareZombie02Animations } from './entityVariants'
import { createEntityVisual, ENTITY_MODEL_SCALE, updateEntityDayColor, entityBodyOpacity, restoreEntityBodySurface } from './entityVisual'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { registerMeleeTarget, entityPositionFree, occluded } from '../player/meleeWorld'
import { cylinderCollider, registerDynamicCollider } from '../player/collisionWorld'
import { ENTITY_HEALTH, ENTITY_RADIUS, ENTITY_HEIGHT, ENTITY_STATE,
  STAGGER_PUSH, STAGGER_TILT } from '../player/meleeConfig'

import { createEntityActions } from './entityAnimations'
import { createEntityHitReaction } from './entityHitReaction'
import { createEntityKnockdown } from './entityKnockdown'
import { createEntityLightStun } from './entityLightStun'
import { FLASHLIGHT_STUN_ANIMATION } from '../player/flashlightConfig'
import { HIT_ROOT_DELAY, HIT_ROOT_TILT_WEIGHT, HIT_RECOIL_DURATION } from './entityHitReactionConfig'
import { createEntityAbilities } from './entityAbilities'
import { subscribeBatSwing } from '../player/batAttackState'
import { HIGHWAY_Z } from './sectors/highwayProfile'
import EntityDeathSmoke from './EntityDeathSmoke'
import { playerCombat, damagePlayer } from '../player/playerCombat'
import { playerActionState } from '../player/FirstPersonRig'
import useMonsterAudio from './useMonsterAudio'
import { BAT_HIT_STOP, BAT_STAGGER_YAW } from '../player/batConfig'
import { AGGRO_RANGE, CHASE_SPEED, ENTITY_ATTACK_RANGE, ENTITY_ATTACK_DAMAGE,
  ENTITY_ATTACK_COOLDOWN, ENTITY_IMPACT_FRACTION, SMOKE_DELAY, SMOKE_DURATION,
  BODY_FADE_DURATION, WALK_TURN_SPEED } from '../player/meleeConfig'

const ZOMBIE_TEST_URL = '/models/enemies/Zombie.fbx'
export const ZOMBIE_TEST_SCALE = ENTITY_MODEL_SCALE
// Left (-X) when arriving from the dirt road, on the near carriageway.
const HIGHWAY_ENTITIES = Array.from({ length: 20 }, (_, index) => {
  const row = index % 4, column = Math.floor(index / 4)
  const x = -8 - column * 4.5 - (row % 2) * 0.6
  const z = HIGHWAY_Z + 4 + row * 1.65
  return { position: [x, getWalkableHeightAt(x, z) + 0.02, z],
    rotation: [0, Math.atan2(-x, HIGHWAY_Z + 14 - z), 0] }
})

export default function ZombieTest() {
  const first = useLoader(FBXLoader, ZOMBIE_TEST_URL)
  const second = useLoader(GLTFLoader, '/models/enemies/Zombie02.glb')
  const secondSource = useMemo(() => {
    second.scene.animations = prepareZombie02Animations(second.animations)
    return second.scene
  }, [second])
  // Keep twenty total (ten of each model), shuffled once per population.
  const [variants] = useState(() => {
    const result = Array.from({ length: HIGHWAY_ENTITIES.length }, (_, index) => index % 2)
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const previous = result[i]
      result[i] = result[j]
      result[j] = previous
    }
    return result
  })
  const sources = [first, secondSource]
  return HIGHWAY_ENTITIES.map((spawn, index) => <HighwayEntity key={index} {...spawn}
    source={sources[variants[index]]}
    visualOptions={variants[index] === 1 ? ZOMBIE02_OPTIONS : undefined}
    animationOptions={variants[index] === 1 ? ZOMBIE02_ANIMATION_OPTIONS : undefined} />)
}

function HighwayEntity({ position, rotation, source, visualOptions, animationOptions }) {
  const [removed, setRemoved] = useState(false)
  return removed ? null : <EntityInstance position={position} rotation={rotation} source={source}
    visualOptions={visualOptions} animationOptions={animationOptions} onRemove={() => setRemoved(true)} />
}

function EntityInstance({ onRemove, position, rotation, source, visualOptions, animationOptions }) {
  const [deathSmokeActive, setDeathSmokeActive] = useState(false)
  const [teleportSmokeActive, setTeleportSmokeActive] = useState(false)
  const { camera } = useThree()
  const root = useRef()
  const fallPivot = useRef()
  const lightPivot = useRef()
  const knockdown = useMemo(() => createEntityKnockdown(root, fallPivot), [])
  const combat = useMemo(() => ({
    health: ENTITY_HEALTH, darkness: 1, state: ENTITY_STATE.IDLE, alerted: false, biting: false, hitVersion: 0,
    radius: ENTITY_RADIUS, height: ENTITY_HEIGHT, position: new THREE.Vector3(),
    elapsed: 0, duration: 0, hitChecked: false, smokeStart: Infinity, smokePosition: new THREE.Vector3(), aim: new THREE.Vector3(), chest: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
    direction: new THREE.Vector3(), probe: new THREE.Vector3(),
  }), [])
  const { model, materials, eyeGeometry, offset, mixer, scale } = useMemo(() => createEntityVisual(source, visualOptions), [source, visualOptions])
  const hitReaction = useMemo(() => createEntityHitReaction(model, root), [model])

  const actions = useMemo(() => createEntityActions(mixer, source.animations, animationOptions), [mixer, source, animationOptions])
  const enterState = (state) => {
    combat.biting = false
    combat.state = state
    combat.elapsed = 0
    combat.hitChecked = false
    if (state === ENTITY_STATE.STAGGER) {
      combat.hitRecovery = false
      actions.beginHitOverride()
      return
    }
    const role = state === ENTITY_STATE.CHASE ? 'locomotion'
      : state === ENTITY_STATE.ATTACK ? 'attack'
      : state === ENTITY_STATE.STAGGER ? 'reaction'
      : state === ENTITY_STATE.DEAD ? 'death' : 'idle'
    const once = ['attack', 'reaction', 'death'].includes(role)
    const available = actions.mapping[role]
    combat.duration = actions.playEntityAction(role, {
      once: once && !!available, restart: once, speed: role === 'reaction' && !available ? 0.18 : 1,
    })
    if (state === ENTITY_STATE.ATTACK && !available) combat.duration = 1
    if (state === ENTITY_STATE.DEAD) {
      combat.smokeStart = available ? Math.min(combat.duration, SMOKE_DELAY) : 0
      combat.smokeReady = false
      combat.smokeStartedAt = Infinity
      root.current.getWorldPosition(combat.smokePosition)
      setDeathSmokeActive(true)
      materials.forEach((material, index) => {
        material.userData.aliveOpacity = material.opacity / (index === 0 ? entityBodyOpacity() : 1)
        material.transparent = true
        material.depthWrite = false
        material.needsUpdate = true
      })
    }
  }

  const abilities = useMemo(() => createEntityAbilities({ combat, root, camera, materials,
    actions, enterState, showSmoke: setTeleportSmokeActive }), [combat, camera, materials, actions])
  const lightStun = useMemo(() => createEntityLightStun({ combat, root, pivot: lightPivot,
    materials, actions, abilities }), [combat, materials, actions, abilities])

  useEffect(() => subscribeBatSwing(abilities.attemptDodge), [abilities])

  useEffect(() => {
    actions.playEntityAction('idle')
    return () => {
      hitReaction.cancel()
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      const skeletons = new Set()
      model.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton) })
      skeletons.forEach(skeleton => skeleton.dispose())
      materials.forEach(material => material.dispose())
      eyeGeometry.dispose()
    }
  }, [source, model, materials, mixer, eyeGeometry, actions, hitReaction])

  useEffect(() => {
    combat.syncPosition = () => {
      // Stable gameplay capsule: walk/bite hip motion must not change attack
      // range, steering or push the collision probe into nearby obstacles.
      combat.position.copy(root.current.position)
      knockdown.syncTarget(combat, ENTITY_RADIUS, ENTITY_HEIGHT)
    }
    combat.receiveHit = (damage, direction, swingDirection) => {
      if (combat.state === ENTITY_STATE.DEAD || combat.meleeEnabled === false || playerCombat.dead || !root.current) return false
      const interruptedAttack = combat.state === ENTITY_STATE.ATTACK
      lightStun.restoreVisual()
      abilities.hit()
      combat.health = Math.max(0, combat.health - damage)
      combat.hitVersion += 1
      combat.alerted = true
      // Further hits still damage a fallen enemy, without restarting the fall
      // or snapping its body upright. Lethal hits use the usual death path.
      if (knockdown.active) {
        if (combat.health === 0) {
          hitReaction.freeze()
          enterState(ENTITY_STATE.DEAD)
        }
        return true
      }
      combat.direction.copy(direction)
      combat.from.copy(root.current.position)
      combat.to.copy(combat.from)
      const recoilSteps = Math.ceil(STAGGER_PUSH / 0.05)
      for (let step = 1; step <= recoilSteps; step += 1) {
        const distance = STAGGER_PUSH * step / recoilSteps
        combat.probe.copy(combat.position).addScaledVector(direction, distance)
        const x = combat.from.x + direction.x * distance
        const z = combat.from.z + direction.z * distance
        combat.probe.y = getWalkableHeightAt(combat.probe.x, combat.probe.z) + 0.02
        if (Math.abs(combat.probe.y - combat.from.y) > 0.3
          || !entityPositionFree(combat.probe, combat.radius, combat.height)) break
        combat.to.set(x, combat.probe.y, z)
      }
      if (combat.health > 0) {
        const falling = knockdown.attempt(direction, combat.from, combat.to, ENTITY_HEIGHT)
        hitReaction.trigger(direction, interruptedAttack, undefined, falling, swingDirection)
      }
      else hitReaction.cancel()
      enterState(combat.health === 0 ? ENTITY_STATE.DEAD : ENTITY_STATE.STAGGER)
      combat.hitStop = BAT_HIT_STOP
      combat.hitYaw = root.current.rotation.y
      const impactSide = direction.x * Math.cos(combat.hitYaw) - direction.z * Math.sin(combat.hitYaw)
      combat.hitSide = Math.abs(impactSide) > 0.1 ? Math.sign(impactSide) : 1
      console.info('[entity] hit - health: ' + combat.health)
      if (combat.state === ENTITY_STATE.DEAD) console.info('[entity] dead')
      return true
    }
    combat.syncPosition()
    const collider = cylinderCollider(0, 0, ENTITY_RADIUS, 0, ENTITY_HEIGHT)
    collider.entity = combat
    collider.sync = () => {
      if (!root.current || combat.health <= 0 || combat.state === ENTITY_STATE.DEAD
        || combat.meleeEnabled === false || !root.current.visible) return false
      combat.syncPosition()
      collider.x = combat.position.x; collider.z = combat.position.z
      collider.radius = combat.radius
      collider.minX = collider.x - collider.radius; collider.maxX = collider.x + collider.radius
      collider.minZ = collider.z - collider.radius; collider.maxZ = collider.z + collider.radius
      collider.minY = combat.position.y; collider.maxY = combat.position.y + combat.height
      return true
    }
    const removeCollider = registerDynamicCollider(collider)
    const removeTarget = registerMeleeTarget(combat)
    return () => { removeCollider(); removeTarget() }
  }, [combat, actions, abilities, hitReaction, knockdown, lightStun])

  useFrame((_, delta) => {
    if (!root.current) return
    updateEntityDayColor(materials)
    if (combat.state !== ENTITY_STATE.DEAD && combat.state !== ENTITY_STATE.TELEPORT_OUT
      && combat.state !== ENTITY_STATE.TELEPORT_IN) restoreEntityBodySurface(materials[0])
    let dt = Math.min(delta, 0.05)
    const S = ENTITY_STATE
    if (combat.state !== S.DEAD && (playerCombat.dead || !isGameInputActive() || playerActionState.locked)) return
    // Remove last frame's additive layer before the mixer writes its new pose.
    hitReaction.restore()
    lightStun.restoreVisual()
    abilities.advance(dt)
    knockdown.advance(dt)
    if (lightStun.update(dt)) {
      mixer.update(dt * FLASHLIGHT_STUN_ANIMATION)
      return
    }
    if (combat.state === S.STAGGER && combat.hitStop > 0) {
      const held = Math.min(dt, combat.hitStop)
      combat.hitStop -= held
      dt -= held
      if (dt === 0) { hitReaction.apply(0); return }
    }
    combat.elapsed += dt * (combat.state === S.ATTACK || combat.state === S.ATTACK_RECOVER ? combat.lightAnimation : 1)
    if (combat.state === S.DEAD) {
      // With no death clip, dissolve in the current pose, inside the plume.
      // Body and aura dissolve into the local plume; eyes extinguish immediately.
      const fadeTime = Math.max(0, combat.elapsed - combat.smokeStartedAt - 0.18)
      const fade = THREE.MathUtils.clamp(fadeTime / BODY_FADE_DURATION, 0, 1)
      materials.forEach((material, index) => {
        material.opacity = material.userData.aliveOpacity * (index === 0 ? entityBodyOpacity() : 1)
          * (1 - (index === 1 ? Math.min(1, combat.elapsed / 0.12) : fade))
      })
      if (actions.mapping.death && combat.elapsed <= combat.duration) mixer.update(dt)
      if (combat.smokeReady && combat.elapsed >= combat.smokeStartedAt + SMOKE_DURATION) onRemove()
      return
    }
    if (combat.state === S.STAGGER) {
      root.current.position.lerpVectors(combat.from, combat.to,
        THREE.MathUtils.smoothstep(combat.elapsed, HIT_ROOT_DELAY, HIT_RECOIL_DURATION))
      const recoilEnvelope = THREE.MathUtils.smoothstep(combat.elapsed, 0, 0.07)
        * (1 - THREE.MathUtils.smoothstep(combat.elapsed, HIT_RECOIL_DURATION, hitReaction.duration))
      root.current.rotation.y = combat.hitYaw + (knockdown.active ? 0 : combat.hitSide * BAT_STAGGER_YAW * recoilEnvelope)
      if (knockdown.active) {
        root.current.rotation.x = root.current.rotation.z = 0
        knockdown.update(combat.elapsed)
      } else if (!actions.mapping.reaction) {
        const tilt = STAGGER_TILT * recoilEnvelope * HIT_ROOT_TILT_WEIGHT
        root.current.rotation.x = combat.direction.z * tilt
        root.current.rotation.z = -combat.direction.x * tilt
      }
      const recoveryStart = knockdown.active ? knockdown.recoveryStart : HIT_RECOIL_DURATION
      if (!combat.hitRecovery && combat.elapsed >= recoveryStart) {
        combat.hitRecovery = true
        actions.recoverFromHit()
      }
      if (combat.hitRecovery || actions.mapping.reaction) mixer.update(dt)
      hitReaction.apply(dt)
      if (combat.elapsed >= hitReaction.duration) {
        root.current.rotation.x = root.current.rotation.z = 0
        root.current.rotation.y = combat.hitYaw
        combat.state = S.CHASE
        combat.elapsed = 0
      }
      return
    }
    if (abilities.update(dt)) {
      mixer.update(dt * combat.lightAnimation)
      return
    }
    combat.syncPosition()
    combat.aim.subVectors(camera.position, combat.position)
    const heightDifference = combat.aim.y
    combat.aim.y = 0
    const distance = combat.aim.length()
    if (distance <= AGGRO_RANGE) combat.alerted = true
    combat.aim.normalize()
    if (combat.state === S.ATTACK) {
      if (!combat.hitChecked && combat.elapsed >= combat.duration * ENTITY_IMPACT_FRACTION) {
        combat.hitChecked = true
        const front = Math.sin(root.current.rotation.y) * combat.aim.x + Math.cos(root.current.rotation.y) * combat.aim.z
        combat.chest.copy(combat.position); combat.chest.y += 1.2
        if (distance <= ENTITY_ATTACK_RANGE && front >= 0.6 && heightDifference > 0 && heightDifference < 2.2
          && !occluded(combat.chest, camera.position)) {
          combat.biting = true
          damagePlayer(ENTITY_ATTACK_DAMAGE, combat.position)
        }
      }
      if (combat.elapsed >= combat.duration) enterState(S.ATTACK_RECOVER)
    } else if (combat.state === S.ATTACK_RECOVER) {
      if (combat.elapsed >= ENTITY_ATTACK_COOLDOWN) enterState(S.IDLE)
    } else if (!combat.alerted) {
      if (combat.state !== S.IDLE) enterState(S.IDLE)
    } else {
      combat.chest.copy(combat.position); combat.chest.y += 1.2
      if (combat.state !== S.LIGHT_RECOVER && abilities.canAttack() && distance <= ENTITY_ATTACK_RANGE && !occluded(combat.chest, camera.position)) {
        root.current.rotation.y = Math.atan2(combat.aim.x, combat.aim.z)
        enterState(S.ATTACK)
      } else {
        if (combat.state !== S.CHASE && combat.state !== S.LIGHT_RECOVER) enterState(S.CHASE)
        const targetYaw = Math.atan2(combat.aim.x, combat.aim.z)
        const turn = Math.atan2(Math.sin(targetYaw - root.current.rotation.y),
          Math.cos(targetYaw - root.current.rotation.y))
        root.current.rotation.y += THREE.MathUtils.clamp(turn, -WALK_TURN_SPEED * dt, WALK_TURN_SPEED * dt)
        const forwardX = Math.sin(root.current.rotation.y)
        const forwardZ = Math.cos(root.current.rotation.y)
        const alignment = Math.max(0, forwardX * combat.aim.x + forwardZ * combat.aim.z)
        const startX = root.current.position.x, startZ = root.current.position.z
        const travel = Math.min(CHASE_SPEED * combat.lightMovement * dt * alignment, Math.max(0, distance - 0.65))
        const steps = Math.max(1, Math.ceil(travel / 0.05))
        for (let i = 0; i < steps; i++) {
          combat.probe.copy(root.current.position)
          combat.probe.x += forwardX * travel / steps
          combat.probe.z += forwardZ * travel / steps
          combat.probe.y = getWalkableHeightAt(combat.probe.x, combat.probe.z) + 0.02
          // Keep forward motion coherent with the feet: no axis-only strafing
          // when a collider blocks the intended step.
          if (Math.abs(combat.probe.y - root.current.position.y) >= 0.3
            || !entityPositionFree(combat.probe, combat.radius, combat.height)) break
          root.current.position.copy(combat.probe)
        }
        const actualSpeed = dt > 0 ? Math.hypot(root.current.position.x - startX,
          root.current.position.z - startZ) / dt : 0
        // Mixer is slowed below; compensate here so Walk still matches travel.
        actions.syncLocomotion(actualSpeed / Math.max(0.01, combat.lightAnimation))
      }
    }
    mixer.update(dt * combat.lightAnimation)
  })
  useMonsterAudio(combat, root, camera, abilities.smoke)

  return <>{deathSmokeActive && <EntityDeathSmoke combat={combat} />}
    {teleportSmokeActive && <EntityDeathSmoke combat={combat} mode="teleport" effect={abilities.smoke} />}
    <group ref={root} position={position} rotation={rotation}>
    <group ref={lightPivot}>
    <group ref={fallPivot}>
    <group position={offset}>
      <group scale={scale}>
        <primitive object={model} dispose={null} />
      </group>
    </group>
    </group>
    </group>
  </group></>
}

