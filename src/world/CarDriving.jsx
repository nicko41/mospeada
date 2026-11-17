import { isGameInputActive, touchInput, subscribeTouchAction } from '../player/touchInput'
import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vehicleState } from '../player/vehicleState'
import { playerActionState } from '../player/FirstPersonRig'
import { playerCombat } from '../player/playerCombat'
import { canOccupy } from '../player/playerCollision'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { registerDynamicCollider, queryColliders, overlapsFootprint } from '../player/collisionWorld'
import { WORLD_WIDTH, WORLD_LENGTH, WORLD_CENTER_Z } from './terrain'
import { HIGHWAY_Z, HIGHWAY_TOP_HALF_WIDTH } from './sectors/highwayProfile'

const MAX_SPEED = 24
const REVERSE_SPEED = 4
const ACCELERATION = 5
const BRAKING = 12
const COAST_DRAG = 2.8
const TURN_RATE = 0.8
const DOOR_DISTANCE = 2
const CAMERA_DISTANCE = 7
const CAMERA_HEIGHT = 4
const MAX_STEP = 0.15
const RUN_OVER_MIN_SPEED = 4
const RUN_OVER_SPEED_LOSS = 0.35
const EXIT_OFFSETS = [1, 1.8, 2.6]
const EXIT_ALONG = [0.7, -1, 2]

function withinGround(x, z) {
  return (Math.abs(x) < WORLD_WIDTH / 2 - 5 && Math.abs(z - WORLD_CENTER_Z) < WORLD_LENGTH / 2 - 5)
    || (x < 0 && Math.abs(z - HIGHWAY_Z) < HIGHWAY_TOP_HALF_WIDTH - 4)
}

export default function CarDriving({ car, size, ground }) {
  const { camera } = useThree()
  const state = useMemo(() => ({
    keys: {}, speed: 0, nearby: [], cameraNearby: [], impacts: [], prompt: null,
    impactDirection: new THREE.Vector3(),
    probe: new THREE.Vector3(), desired: new THREE.Vector3(),
    target: new THREE.Vector3(), cameraPosition: new THREE.Vector3(),
    collider: { type: 'box', walkable: false, vaultable: false, environment: true },
  }), [])

  useLayoutEffect(() => {
    const collider = state.collider
    collider.sync = () => {
      const root = car.current
      if (!root) return false
      const c = Math.abs(Math.cos(root.rotation.y)), s = Math.abs(Math.sin(root.rotation.y))
      const x = (size[0] * c + size[2] * s) / 2
      const z = (size[0] * s + size[2] * c) / 2
      collider.minX = root.position.x - x; collider.maxX = root.position.x + x
      collider.minZ = root.position.z - z; collider.maxZ = root.position.z + z
      collider.minY = root.position.y; collider.maxY = root.position.y + size[1]
      return true
    }
    const unregister = registerDynamicCollider(collider)
    const prompt = document.createElement('div')
    prompt.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);color:#ddd;background:#0009;padding:8px 12px;font:13px sans-serif;pointer-events:none;display:none;z-index:30'
    document.body.appendChild(prompt)
    state.prompt = prompt
    const localPoint = (x, z, output) => {
      const root = car.current, yaw = root.rotation.y
      output.set(root.position.x + x * Math.cos(yaw) + z * Math.sin(yaw), 0,
        root.position.z - x * Math.sin(yaw) + z * Math.cos(yaw))
      output.y = getWalkableHeightAt(output.x, output.z)
    }
    const down = (event) => {
      if (!isGameInputActive() || playerCombat.dead || playerActionState.locked) return
      if (event.code !== 'KeyF') {
        if (vehicleState.active) {
          state.keys[event.code] = true
          if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) event.preventDefault()
        }
        return
      }
      if (!vehicleState.active && !vehicleState.nearDoor) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      if (vehicleState.active) {
        // Stop first, and only leave where an upright player actually fits.
        state.speed = 0
        for (const margin of EXIT_OFFSETS) {
          for (const side of [-1, 1]) {
            for (const along of EXIT_ALONG) {
              localPoint(side * (size[0] / 2 + margin), along, state.probe)
              if (!withinGround(state.probe.x, state.probe.z) || !canOccupy(state.probe)) continue
              vehicleState.exitPosition.copy(state.probe)
              vehicleState.exitYaw = car.current.rotation.y + Math.PI
              vehicleState.exitRequested = true
              vehicleState.active = false; vehicleState.nearDoor = false
              state.keys = {}
              return
            }
          }
        }
        prompt.textContent = 'Salida bloqueada: mové el auto a un lugar libre'
      } else if (playerActionState.mode === 'GROUND') {
        vehicleState.active = true
        playerActionState.mode = 'DRIVE'
        state.cameraPosition.copy(camera.position)
        state.speed = 0; state.keys = {}
      }
    }
    const up = (event) => { state.keys[event.code] = false }
    const clear = () => { state.keys = {}; state.speed = 0 }
    const lockChanged = () => { if (!isGameInputActive()) clear() }
    window.addEventListener('keydown', down, true)
    const unsubscribe = subscribeTouchAction('vehicle', () => down({
      code: 'KeyF', preventDefault() {}, stopImmediatePropagation() {},
    }))
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      unsubscribe()
      unregister(); prompt.remove(); state.prompt = null
      vehicleState.active = false; vehicleState.nearDoor = false; vehicleState.exitRequested = false
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('pointerlockchange', lockChanged)
    }
  }, [camera, car, size, state])

  useFrame((_, delta) => {
    const root = car.current
    if (!root) return
    const yaw = root.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw)
    const dx = camera.position.x - root.position.x, dz = camera.position.z - root.position.z
    const localX = dx * c - dz * s, localZ = dx * s + dz * c
    vehicleState.nearDoor = !vehicleState.active && playerActionState.mode === 'GROUND'
      && Math.hypot(Math.abs(localX) - size[0] / 2, localZ - 0.7) < DOOR_DISTANCE
      && Math.abs(camera.position.y - root.position.y - 1.7) < 1.5
    if (state.prompt) {
      state.prompt.style.display = isGameInputActive() && !playerCombat.dead
        && (vehicleState.active || vehicleState.nearDoor) ? 'block' : 'none'
      if (!vehicleState.active) state.prompt.textContent = touchInput.enabled ? 'Interactuar · Conducir' : 'F · Conducir'
      else if (!state.prompt.textContent.startsWith('Salida')) state.prompt.textContent = touchInput.enabled
        ? 'Joystick · Conducir     Interactuar · Bajar' : 'WASD · Conducir     F · Bajar'
    }
    if (!vehicleState.active) return
    const enabled = isGameInputActive() && !playerCombat.dead && !playerActionState.locked
    const dt = enabled ? Math.min(delta, 0.05) : 0
    if (!enabled) state.speed = 0
    const throttle = touchInput.enabled ? touchInput.y : (state.keys.KeyW ? 1 : 0) - (state.keys.KeyS ? 1 : 0)
    const desiredSpeed = throttle > 0 ? MAX_SPEED * throttle : throttle < 0 ? REVERSE_SPEED * throttle : 0
    const acceleration = !throttle ? COAST_DRAG : state.speed * throttle < 0 ? BRAKING : ACCELERATION
    state.speed += THREE.MathUtils.clamp(desiredSpeed - state.speed, -acceleration * dt, acceleration * dt)
    const steering = touchInput.enabled ? -touchInput.x : (state.keys.KeyA ? 1 : 0) - (state.keys.KeyD ? 1 : 0)
    const steps = Math.max(1, Math.ceil(Math.abs(state.speed) * dt / MAX_STEP))
    for (let i = 0; i < steps; i += 1) {
      const oldYaw = root.rotation.y, oldX = root.position.x, oldY = root.position.y, oldZ = root.position.z
      root.rotation.y += steering * TURN_RATE * Math.min(1, Math.abs(state.speed) / 3) * Math.sign(state.speed) * dt / steps
      root.position.x += Math.sin(root.rotation.y) * state.speed * dt / steps
      root.position.z += Math.cos(root.rotation.y) * state.speed * dt / steps
      root.position.y = getWalkableHeightAt(root.position.x, root.position.z) + 0.025
      state.collider.sync()
      const box = state.collider
      queryColliders(box.minX, box.minZ, box.maxX, box.maxZ, state.nearby, true)
      let blocked = !Number.isFinite(root.position.y) || Math.abs(root.position.y - oldY) > 0.22
        || !withinGround(root.position.x, root.position.z)
      state.impacts.length = 0
      for (const obstacle of state.nearby) {
        if (obstacle === box || obstacle.maxY <= box.minY + 0.2 || obstacle.minY >= box.maxY) continue
        if (obstacle.entity) {
          // Broad phase uses the existing AABB; actual impacts use the rotated
          // car footprint, so empty corners cannot hit a pedestrian.
          const dx = obstacle.x - root.position.x, dz = obstacle.z - root.position.z
          const c = Math.cos(root.rotation.y), s = Math.sin(root.rotation.y)
          const x = dx * c - dz * s, z = dx * s + dz * c
          const ex = x - THREE.MathUtils.clamp(x, -size[0] / 2, size[0] / 2)
          const ez = z - THREE.MathUtils.clamp(z, -size[2] / 2, size[2] / 2)
          if (ex * ex + ez * ez >= obstacle.radius ** 2) continue
          if (Math.abs(state.speed) >= RUN_OVER_MIN_SPEED) state.impacts.push(obstacle.entity)
          else blocked = true
          continue
        }
        if (obstacle.type === 'cylinder') {
          const x = THREE.MathUtils.clamp(obstacle.x, box.minX, box.maxX)
          const z = THREE.MathUtils.clamp(obstacle.z, box.minZ, box.maxZ)
          if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < obstacle.radius ** 2) blocked = true
        } else blocked = true
      }
      if (blocked) {
        root.position.set(oldX, oldY, oldZ); root.rotation.y = oldYaw
        state.collider.sync(); state.speed = 0
        break
      }
      // Commit hits only after this movement step passed the solid-obstacle checks.
      state.impactDirection.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y))
        .multiplyScalar(Math.sign(state.speed))
      for (const entity of state.impacts) {
        // The normal lethal-hit path owns death, animation and smoke. Its collider
        // disappears immediately, preventing repeated damage in later substeps.
        if (entity.receiveHit(entity.health, state.impactDirection, state.impactDirection)) {
          state.speed = Math.sign(state.speed) * Math.max(0, Math.abs(state.speed) - RUN_OVER_SPEED_LOSS)
        }
      }
    }
    const forwardX = Math.sin(root.rotation.y), forwardZ = Math.cos(root.rotation.y)
    ground.value = root.position.y
    if (state.speed !== 0 && state.prompt?.textContent.startsWith('Salida')) {
      state.prompt.textContent = 'WASD · Conducir     F · Bajar'
    }
    state.target.copy(root.position); state.target.y += 1.8
    state.desired.set(root.position.x - forwardX * CAMERA_DISTANCE, root.position.y + CAMERA_HEIGHT,
      root.position.z - forwardZ * CAMERA_DISTANCE)
    // A handful of primitive probes shortens the boom near obstacles; no mesh raycasts.
    queryColliders(Math.min(state.target.x, state.desired.x) - 0.3, Math.min(state.target.z, state.desired.z) - 0.3,
      Math.max(state.target.x, state.desired.x) + 0.3, Math.max(state.target.z, state.desired.z) + 0.3, state.cameraNearby)
    for (let i = 1; i <= 12; i += 1) {
      state.probe.lerpVectors(state.target, state.desired, i / 12)
      let obstructed = false
      for (const obstacle of state.cameraNearby) {
        if (obstacle !== state.collider && state.probe.y > obstacle.minY - 0.25
          && state.probe.y < obstacle.maxY + 0.25 && overlapsFootprint(obstacle, state.probe.x, state.probe.z, 0.3)) {
          obstructed = true; break
        }
      }
      if (obstructed) {
        state.desired.lerpVectors(state.target, state.desired, (i - 1) / 12)
        break
      }
    }
    state.cameraPosition.lerp(state.desired, 1 - Math.exp(-7 * Math.min(delta, 0.05)))
    state.cameraPosition.y = Math.max(state.cameraPosition.y,
      getWalkableHeightAt(state.cameraPosition.x, state.cameraPosition.z) + 0.5)
    camera.position.copy(state.cameraPosition)
    camera.lookAt(state.target)
  }, -0.9)
  return null
}
