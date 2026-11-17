import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { createEntityVisual, ENTITY_MODEL_SCALE, updateEntityDayColor, entityBodyOpacity } from './entityVisual'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { lightningState } from './Lightning'
import { highwaySequence, entityOpacity } from '../narrative/highwaySequence'

const APPARITION_SIZE = 2
const PREVIOUS_BASE_CLIP = 'Zombie|ZombieBite'
const APPARITION_BASE_CLIP = 'Zombie|ZombieIdle'
const APPARITION_ANIMATION_SPEED = 0.75
const APPARITION_CLIP_START = 0
const loggedBaseClips = new WeakSet()
const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const location = new THREE.Vector3()

function chooseAppearance(camera) {
  const roll = Math.random()
  const kind = roll < 0.6 ? 'ambiguous' : roll < 0.94 ? 'clear' : 'strong'
  const distance = kind === 'ambiguous'
    ? 8 + Math.random() * 3
    : kind === 'clear'
      ? 6 + Math.random() * 3
      : 4.5 + Math.random() * 2
  const side = Math.random() < 0.5 ? -1 : 1
  const angle = kind === 'ambiguous'
    ? 8 + Math.random() * 10
    : kind === 'clear'
      ? 6 + Math.random() * 9
      : 5 + Math.random() * 7

  forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
  forward.y = 0
  forward.normalize()
  right.crossVectors(forward, camera.up).normalize()
  const radians = angle * Math.PI / 180
  location.copy(camera.position)
    .addScaledVector(forward, Math.cos(radians) * distance)
    .addScaledVector(right, Math.sin(radians) * distance * side)
  location.y = getWalkableHeightAt(location.x, location.z)

  return {
    x: location.x,
    y: location.y,
    z: location.z,
    kind,
    distance,
    height: 2.7 + Math.random() * 0.38,
    opacity: kind === 'ambiguous' ? 0.68 + Math.random() * 0.09
      : kind === 'clear' ? 0.78 + Math.random() * 0.09
        : 0.85 + Math.random() * 0.05,
    pulse: Math.random() < 0.35 ? 0 : 1,
  }
}

export default function ApparitionSystem() {
  const root = useRef()
  const { camera } = useThree()
  const source = useLoader(FBXLoader, '/models/enemies/Zombie.fbx')
  const visual = useMemo(() => createEntityVisual(source), [source])
  const { model, materials, eyeGeometry, offset, mixer } = visual
  const clip = useMemo(() => source.animations.find(clip => clip.name === APPARITION_BASE_CLIP)
    ?? source.animations.find(clip => clip.name === PREVIOUS_BASE_CLIP), [source])
  const actionRef = useRef(null)
  const state = useRef({ seenEvent: 0, cooldown: 0, appearance: null, animationKey: null })

  useEffect(() => {
    if (!loggedBaseClips.has(source)) {
      loggedBaseClips.add(source)
      console.info('[entity] available clips:', source.animations.map(clip => clip.name))
      console.info('[entity] previous base clip:', PREVIOUS_BASE_CLIP)
      console.info('[entity] new base clip:', clip?.name ?? 'none')
    }
    // StrictMode replays setup after cleanup. Acquire fresh bindings after
    // uncacheRoot rather than replaying a memoized, invalidated action.
    const action = clip ? mixer.clipAction(clip) : null
    actionRef.current = action
    materials.forEach((material, index) => {
      material.userData.apparitionOpacity = index === 0 ? 1 : material.opacity
      material.transparent = true
      material.depthWrite = false
      material.needsUpdate = true
    })
    action?.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(APPARITION_ANIMATION_SPEED).play()
    return () => {
      actionRef.current = null
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      const skeletons = new Set()
      model.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton) })
      skeletons.forEach(skeleton => skeleton.dispose())
      materials.forEach(material => material.dispose())
      eyeGeometry.dispose()
    }
  }, [model, materials, eyeGeometry, mixer, clip])

  useFrame((_, delta) => {
    updateEntityDayColor(materials)
    const current = state.current
    const show = (key, x, y, z, yaw, opacity) => {
      root.current.position.set(x, y, z)
      root.current.rotation.set(0, yaw, 0)
      if (current.animationKey !== key) {
        current.animationKey = key
        const action = actionRef.current
        action?.reset().setEffectiveTimeScale(APPARITION_ANIMATION_SPEED).play()
        // The selected idle starts calmly; no attack gesture in the base pose.
        if (action && clip) action.time = Math.min(APPARITION_CLIP_START, clip.duration * 0.4)
      }
      materials.forEach((material, index) => {
        material.opacity = material.userData.apparitionOpacity * opacity * (index === 0 ? entityBodyOpacity() : 1)
      })
      mixer.update(Math.min(delta, 0.05))
    }
    if (highwaySequence.active) {
      current.seenEvent = lightningState.eventId
      current.appearance = null
      const entity = highwaySequence.entity
      root.current.visible = Boolean(entity && entity.age < 3.2 && !highwaySequence.blackout)
      if (!root.current.visible) return
      // Preserve the scripted appearance's placement, orientation and fade.
      show(entity, entity.x, getWalkableHeightAt(entity.x, entity.z), entity.z,
        -Math.PI / 2, entityOpacity(entity.age))
      return
    }
    if (lightningState.eventId !== current.seenEvent) {
      current.seenEvent = lightningState.eventId
      current.appearance = null
      if (current.cooldown > 0) current.cooldown -= 1
      else if (Math.random() < 0.4) {
        current.appearance = chooseAppearance(camera)
        current.cooldown = current.appearance.kind === 'strong' ? 2 : 1
      }
    }
    const appearance = current.appearance
    const age = lightningState.age
    const start = appearance?.pulse === 0 ? 0.008 : 0.22
    const end = appearance?.pulse === 0 ? 0.128 : 0.39
    root.current.visible = Boolean(appearance && age >= start && age <= end && lightningState.flash > 0.22)
    if (!root.current.visible) return
    show(appearance, appearance.x, appearance.y, appearance.z,
      Math.atan2(camera.position.x - appearance.x, camera.position.z - appearance.z),
      appearance.opacity * (0.78 + lightningState.flash * 0.22))
  })

  return <group ref={root} visible={false} scale={APPARITION_SIZE}>
    <group position={offset}>
      <group scale={ENTITY_MODEL_SCALE}>
        <primitive object={model} dispose={null} />
      </group>
    </group>
  </group>
}
