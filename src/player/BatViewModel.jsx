import { isGameInputActive } from './touchInput'
import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { createBatWood, batWoodGeometry } from './batWood'
import { batAttack, batEquipment } from './batAttackState'
import { playerCombat } from './playerCombat'
import { playerActionState } from './FirstPersonRig'
import { BAT_POSITION, BAT_ROTATION, BAT_SCALE, BAT_GRIP_OFFSET, sampleBatMotion,
  LEFT_READY_POSITION, LEFT_READY_ROTATION, RIGHT_HAND_ANCHOR,
  BAT_STOW_POSITION, BAT_STOW_ROTATION, BAT_VAULT_POSITION, BAT_VAULT_ROTATION,
  BAT_EQUIP_DURATION, BAT_STOW_DURATION, BAT_VAULT_LOWER_DURATION, BAT_VAULT_RAISE_DURATION,
  BAT_WALK_BOB, BAT_RUN_BOB, BAT_BOB_STRIDE } from './batConfig'
import { MOVE_SPEED, RUN_SPEED } from './movementConfig'

// The viewmodel is less than a metre from the 105-intensity flashlight.
// Reduce only its diffuse response and remove the white specular highlight.
const BAT_LIGHT_RESPONSE = 0.06
const BAT_AMBIENT_READABILITY = 0.18

export default function BatViewModel() {
  const asset = useLoader(GLTFLoader, '/models/bat.glb')
  const { camera, scene } = useThree()
  const pivot = useRef()
  const motion = useMemo(() => ({ mode: 'STOWED', elapsed: 1, duration: BAT_STOW_DURATION,
    from: new THREE.Vector3(...BAT_STOW_POSITION), to: new THREE.Vector3(...BAT_STOW_POSITION),
    fromRotation: new THREE.Quaternion(), toRotation: new THREE.Quaternion(),
    euler: new THREE.Euler(), lastCamera: new THREE.Vector3(), initialized: false,
    speed: 0, phase: 0, bob: 0 }), [])
  const { model, materials, wood, geometries } = useMemo(() => {
    const model = asset.scene.clone(true)
    const wood = createBatWood()
    const geometries = []
    const shared = new Map()
    const materialFor = source => {
      if (!shared.has(source)) {
        const isWood = source.name === '795548'
        const tint = isWood ? new THREE.Color('#bfb6a7') : source.color.clone()
        const material = new THREE.MeshLambertMaterial({
          color: tint.clone().multiplyScalar(BAT_LIGHT_RESPONSE),
          map: isWood ? wood : source.map,
          emissive: tint,
          emissiveMap: isWood ? wood : null,
          emissiveIntensity: BAT_AMBIENT_READABILITY,
          fog: false,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        })
        shared.set(source, material)
      }
      return shared.get(source)
    }
    model.traverse(mesh => {
      if (!mesh.isMesh) return
      if (!Array.isArray(mesh.material) && mesh.material.name === '795548') {
        mesh.geometry = batWoodGeometry(mesh.geometry)
        geometries.push(mesh.geometry)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(materialFor) : materialFor(mesh.material)
      mesh.castShadow = mesh.receiveShadow = false
      mesh.frustumCulled = false
      mesh.renderOrder = 1000
    })
    return { model, materials: [...shared.values()], wood, geometries }
  }, [asset])
  useEffect(() => {
    const attached = !camera.parent
    if (attached) scene.add(camera)
    batAttack.ready = true
    return () => {
      batAttack.ready = false
      batEquipment.canAttack = false
      if (attached) scene.remove(camera)
      materials.forEach(material => material.dispose())
      geometries.forEach(geometry => geometry.dispose())
      wood.dispose()
    }
  }, [camera, scene, materials, geometries, wood])
  // Sample after player movement and before melee/damage camera offsets.
  useFrame((_, delta) => {
    const distance = motion.initialized ? Math.hypot(camera.position.x - motion.lastCamera.x,
      camera.position.z - motion.lastCamera.z) : 0
    motion.lastCamera.copy(camera.position)
    motion.initialized = true
    motion.speed = delta > 0 && distance <= RUN_SPEED * Math.min(delta, 0.05) + 0.05 && playerActionState.mode === 'GROUND'
      && !playerActionState.locked && isGameInputActive() ? distance / delta : 0
  }, -0.75)
  useFrame((_, delta) => {
    if (!pivot.current) return
    const dt = Math.min(delta, 0.05)
    const available = !playerCombat.dead && !playerActionState.locked && playerActionState.mode !== 'DRIVE'
    const wanted = available && (batEquipment.equipped || batAttack.active)
      ? playerActionState.mode === 'VAULT' ? 'VAULT' : 'READY' : 'STOWED'
    if (wanted !== motion.mode) {
      const previous = motion.mode
      motion.mode = wanted
      motion.elapsed = 0
      // Capture the current pose, including a cancelled swing, rather than snapping to idle.
      motion.from.copy(pivot.current.position)
      motion.fromRotation.copy(pivot.current.quaternion)
      const position = wanted === 'READY' ? (batAttack.readySide < 0 ? LEFT_READY_POSITION : BAT_POSITION)
        : wanted === 'VAULT' ? BAT_VAULT_POSITION : BAT_STOW_POSITION
      const rotation = wanted === 'READY' ? (batAttack.readySide < 0 ? LEFT_READY_ROTATION : BAT_ROTATION)
        : wanted === 'VAULT' ? BAT_VAULT_ROTATION : BAT_STOW_ROTATION
      motion.to.set(...position)
      motion.toRotation.setFromEuler(motion.euler.set(...rotation))
      motion.duration = wanted === 'VAULT' ? BAT_VAULT_LOWER_DURATION : wanted === 'STOWED'
        ? BAT_STOW_DURATION : previous === 'VAULT' ? BAT_VAULT_RAISE_DURATION : BAT_EQUIP_DURATION
    }
    motion.elapsed += dt
    const transition = Math.min(1, motion.elapsed / motion.duration)
    batEquipment.canAttack = wanted === 'READY' && transition === 1 && batEquipment.equipped
    pivot.current.visible = wanted !== 'STOWED' || transition < 1
    const moving = motion.speed > 0.05 && wanted === 'READY' && !batAttack.active && transition === 1
    const running = THREE.MathUtils.clamp((motion.speed - MOVE_SPEED) / Math.max(0.01, RUN_SPEED - MOVE_SPEED), 0, 1)
    const amplitude = moving ? THREE.MathUtils.lerp(BAT_WALK_BOB, BAT_RUN_BOB, running)
      * Math.min(1, motion.speed / MOVE_SPEED) : 0
    motion.bob = THREE.MathUtils.damp(motion.bob, amplitude, 14, dt)
    motion.phase = (motion.phase + motion.speed * dt / BAT_BOB_STRIDE * Math.PI * 2) % (Math.PI * 2)
    if (transition < 1) {
      const ease = transition * transition * (3 - 2 * transition)
      pivot.current.position.lerpVectors(motion.from, motion.to, ease)
      pivot.current.quaternion.slerpQuaternions(motion.fromRotation, motion.toRotation, ease)
    } else if (wanted === 'READY') {
      sampleBatMotion(batAttack.active ? batAttack.elapsed : 0, pivot.current.position, pivot.current.rotation,
        null, null, batAttack.active ? batAttack.direction : batAttack.readySide)
      if (!batAttack.active) {
        pivot.current.position.x += Math.sin(motion.phase) * motion.bob
        pivot.current.position.y += Math.cos(motion.phase * 2) * motion.bob * 0.85
        pivot.current.position.z += Math.sin(motion.phase * 2) * motion.bob * 0.3
        pivot.current.rotation.z += Math.sin(motion.phase) * motion.bob * 1.8
        pivot.current.rotation.x += Math.cos(motion.phase * 2) * motion.bob * 0.8
      }
    } else {
      pivot.current.position.copy(motion.to)
      pivot.current.quaternion.copy(motion.toRotation)
    }
  }, -0.3)
  return createPortal(<group name="RightHandAnchor" position={RIGHT_HAND_ANCHOR}>
    <group name="GripPivot" ref={pivot} position={BAT_STOW_POSITION} rotation={BAT_STOW_ROTATION} visible={false}>
    <group scale={BAT_SCALE}><group position={BAT_GRIP_OFFSET}>
      <primitive object={model} dispose={null} />
    </group></group>
    </group>
  </group>, camera)
}
