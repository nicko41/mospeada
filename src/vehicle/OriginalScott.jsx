import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import * as T from 'three'
import { originalScottState as playback } from './originalScottState.js'
import { sampleRideHeight } from './rideSurface.js'
import { isCycloneAction, parseCycloneScottActions } from './cycloneScottActions.js'
import { updateScottGameplay } from './scottGameplay.js'
import { createRelaxedScottHands } from './relaxedScottHands.js'

export default function OriginalScott({ runtime }) {
  const asset = useGLTF('/models/mospeada/scott-bernard-animated-original.glb')
  const actionData = useLoader(T.FileLoader, '/animations/scott-cyclone-actions.json')
  const authored = useMemo(() => { const data = JSON.parse(actionData); return { data, clips: parseCycloneScottActions(data) } }, [actionData])
  const clips = useMemo(() => [...asset.animations, ...authored.clips], [asset.animations, authored])
  const maps = useTexture(['/models/mospeada/scott-shoulders-color.png', '/models/mospeada/scott-shoulders-normal.png', '/models/mospeada/scott-shoulders-roughness.png'])
  const wrapper = useRef(), instance = useMemo(() => {
    const model = clone(asset.scene), skins = [], bones = new Map(), hands = []
    model.traverse(node => {
      if (node.isBone) bones.set(node.name, node)
      if (node.isSkinnedMesh) {
        node.frustumCulled = false; node.castShadow = true
        const original = node.material, clean = original.clone()
        skins.push({ mesh: node, original, clean })
        const relaxed = createRelaxedScottHands(node)
        if (relaxed) hands.push(relaxed)
      }
    })
    return { model, sourceScene: asset.scene, hands, mixer: new T.AnimationMixer(model), skins, bones, action: null, clip: null, lastSeek: -1, clean: null, stamp: 0, anchor: new T.Vector3() }
  }, [asset.scene])
  useLayoutEffect(() => {
    // StrictMode replays effect setup/cleanup; reinstall the private variant.
    instance.hands.forEach(hand => hand.attach())
    maps.forEach((map, i) => { map.flipY = false; map.colorSpace = i === 0 ? T.SRGBColorSpace : T.NoColorSpace; map.needsUpdate = true })
    for (const skin of instance.skins) { skin.clean.map = maps[0]; skin.clean.normalMap = maps[1]; skin.clean.roughnessMap = maps[2]; skin.clean.metalnessMap = maps[2] }
    playback.set({ clips: clips.map(c => ({ name: c.name, duration: c.duration })), ready: true })
    runtime.scottData = authored.data
    if (import.meta.env.DEV) window.__SCOTT_ORIGINAL__ = { instance, source: asset, playback, wrapper, authored, statement: 'Original GLB and 16 unchanged clips. Mounted posture layer; corrected Roll_Dodge_4 crossing and original locomotion run without rider IK.' }
    return () => { instance.mixer.stopAllAction(); instance.mixer.uncacheRoot(instance.model); instance.clip = null; instance.action = null; instance.lastSeek = -1; instance.hands.forEach(h => h.dispose()); instance.skins.forEach(s => s.clean.dispose()); if (import.meta.env.DEV) delete window.__SCOTT_ORIGINAL__ }
  }, [instance, asset.animations, clips, authored, maps[0], maps[1], maps[2]])
  useFrame((_, delta) => {
    const s = runtime.state
    if (!s || !wrapper.current) return
    const p = playback.snapshot()
    if (runtime.gameplay) {
      if (instance.clean !== p.cleanShoulders) { instance.clean = p.cleanShoulders; instance.skins.forEach(skin => { skin.mesh.material = p.cleanShoulders ? skin.clean : skin.original }) }
      updateScottGameplay(instance, authored, clips, runtime, wrapper.current, delta)
      return
    }
    if (p.clip !== instance.clip || p.selectionRequest !== instance.selectionRequest) {
      instance.mixer.stopAllAction(); instance.clip = p.clip
      instance.selectionRequest = p.selectionRequest
      const clip = clips.find(c => c.name === p.clip)
      instance.action = clip ? instance.mixer.clipAction(clip).reset() : null
      if (instance.action) {
        instance.action.setLoop(isCycloneAction(p.clip) ? T.LoopOnce : T.LoopRepeat, Infinity)
        instance.action.clampWhenFinished = isCycloneAction(p.clip)
        instance.action.play()
      }
    }
    if (p.cleanShoulders !== instance.clean) {
      instance.clean = p.cleanShoulders
      instance.skins.forEach(skin => { skin.mesh.material = p.cleanShoulders ? skin.clean : skin.original })
    }
    if (p.seekRequest !== instance.lastSeek) {
      instance.lastSeek = p.seekRequest
      if (instance.action) { instance.action.enabled = true; instance.action.paused = false; instance.action.time = Math.min(1, p.seek) * instance.action.getClip().duration }
    }
    instance.mixer.update(p.playing && !runtime.paused ? Math.min(delta, 0.1) * p.speed : 0)
    instance.hands.forEach(h => h.update(isCycloneAction(p.clip) ? 'mounted' : 'onFoot', runtime.paused ? 0 : Math.min(delta, .1)))
    if (isCycloneAction(p.clip)) {
      // Same bike-local frame used to measure the seat, grips and foot supports.
      runtime.scottBikeBody?.updateWorldMatrix(true, false)
      const origin = new T.Vector3().fromArray(authored.data.actorOrigin)
      wrapper.current.position.copy(runtime.scottBikeBody ? runtime.scottBikeBody.localToWorld(origin) : origin)
      if (runtime.scottBikeBody) wrapper.current.quaternion.copy(runtime.scottBikeBody.getWorldQuaternion(new T.Quaternion()))
    } else {
      const origin = new T.Vector3().fromArray(authored.data.actorOrigin).applyAxisAngle(new T.Vector3(0, 1, 0), s.yaw)
      const x = s.x + origin.x, z = s.z + origin.z, ground = sampleRideHeight(x, z)
      wrapper.current.position.set(x, Number.isFinite(ground) ? ground : s.height, z); wrapper.current.rotation.set(0, s.yaw, 0)
    }
    wrapper.current.scale.setScalar(authored.data.actorScale)
    wrapper.current.updateMatrixWorld(true)
    const hip = [...instance.bones.values()].find(b => /Hips$/.test(b.name))
    hip.getWorldPosition(instance.anchor)
    runtime.originalScottTarget = { ...s, x: instance.anchor.x, z: instance.anchor.z, height: instance.anchor.y - 0.80, speed: 0, boostTime: 0 }
    instance.stamp += delta
    if (instance.stamp > 0.1) {
      instance.stamp = 0
      const progress = instance.action ? instance.action.time / instance.action.getClip().duration : 0
      playback.set({ progress, ...(isCycloneAction(p.clip) && progress >= 1 ? { playing: false } : {}) })
    }
  }, -1)
  return <group ref={wrapper} name="Scott_original_playback"><primitive object={instance.model} dispose={null} /></group>
}
