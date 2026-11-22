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
import { ScottReturnMotion } from './ScottReturnMotion.js'
import { ScottArmorIdleMotion } from './ScottArmorIdleMotion.js'
import { ScottArmorBoostMotion } from './ScottArmorBoostMotion.js'
import { TransformationScottPose } from './TransformationScottPose.js'
import { ArmorLocomotion } from './ArmorLocomotion.js'
import {ArmorReactiveMotion} from './ArmorReactiveMotion.js'
import {ArmorArticulation,armorAttachmentTarget} from './ArmorArticulation.js'
import {ArmorLandingMotion} from './ArmorLandingMotion.js'
import {ArmorArmMotion} from './ArmorArmMotion.js'
import { armorIdleState } from './armorIdleState.js'
import {isJumpCharging} from './armorJumpMotion.js'
import {ScottDefeatMotion} from './ScottDefeatMotion.js'
import {playerCombat} from '../player/playerCombat.js'
import {rideUI} from './rideUI.js'

// Start the rider and its maps alongside the motorcycle request. Without this,
// Suspense discovers GLB -> action data -> shoulder maps in separate retries.
const SCOTT_MODEL='/models/mospeada/scott-bernard-animated-original.glb'
const SCOTT_ACTIONS='/animations/scott-cyclone-actions.json'
const SCOTT_MAPS=['/models/mospeada/scott-shoulders-color.png', '/models/mospeada/scott-shoulders-normal.png', '/models/mospeada/scott-shoulders-roughness.png']
useGLTF.preload(SCOTT_MODEL)
useLoader.preload(T.FileLoader,SCOTT_ACTIONS)
useTexture.preload(SCOTT_MAPS)

export default function OriginalScott({ runtime }) {
  const asset = useGLTF(SCOTT_MODEL)
  const actionData = useLoader(T.FileLoader, SCOTT_ACTIONS)
  const authored = useMemo(() => { const data = JSON.parse(actionData); return { data, clips: parseCycloneScottActions(data) } }, [actionData])
  const clips = useMemo(() => [...asset.animations, ...authored.clips], [asset.animations, authored])
  const maps = useTexture(SCOTT_MAPS)
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
    return { model, sourceScene: asset.scene, sourceClips:asset.animations, hands, mixer: new T.AnimationMixer(model), skins, bones, action: null, clip: null, lastSeek: -1, clean: null, stamp: 0, anchor: new T.Vector3() }
  }, [asset.scene])
  useLayoutEffect(() => {
    // StrictMode replays effect setup/cleanup; reinstall the private variant.
    instance.hands.forEach(hand => hand.attach())
    maps.forEach((map, i) => { map.flipY = false; map.colorSpace = i === 0 ? T.SRGBColorSpace : T.NoColorSpace; map.needsUpdate = true })
    for (const skin of instance.skins) { skin.clean.map = maps[0]; skin.clean.normalMap = maps[1]; skin.clean.roughnessMap = maps[2]; skin.clean.metalnessMap = maps[2] }
    playback.set({ clips: clips.map(c => ({ name: c.name, duration: c.duration })), ready: true })
    runtime.scottData = authored.data
    runtime.scottInstance = instance
    // Sample/measure original clips during loading, not on the first T or
    // the first Armor frame. These constructors do not apply a body pose.
    instance.armorLocomotion ||= new ArmorLocomotion(instance,authored.data.actorScale)
    instance.transformationPose ||= new TransformationScottPose(instance,wrapper.current)
    if (import.meta.env.DEV) window.__SCOTT_ORIGINAL__ = { instance, source: asset, playback, wrapper, authored, statement: 'Original GLB and 16 unchanged clips. Mounted posture layer; corrected Roll_Dodge_4 crossing and original locomotion run without rider IK.' }
    return () => { delete runtime.scottInstance; instance.mixer.stopAllAction(); instance.mixer.uncacheRoot(instance.model); instance.clip = null; instance.action = null; instance.lastSeek = -1; instance.hands.forEach(h => h.dispose()); instance.skins.forEach(s => s.clean.dispose()); if (import.meta.env.DEV) delete window.__SCOTT_ORIGINAL__ }
  }, [instance, asset.animations, clips, authored, maps[0], maps[1], maps[2]])
  useLayoutEffect(()=>()=>{instance.armorArticulation?.dispose();delete instance.armorArticulation},[instance])
  // Restore ONLY the four attachment assemblies before the normal mechanics.
  useFrame(()=>instance.armorArticulation?.restore(),-2.15)
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
  useFrame(()=>{
    const armor=armorAttachmentTarget(runtime.armorController,runtime.transformEntry)
    if(!runtime.gameplay||!runtime.guardTransformation||!runtime.rearTransformation)return
    instance.armorArticulation ||=new ArmorArticulation(runtime)
    instance.armorArticulation.prepare(armor)
  },-.65)
  useFrame((_,delta)=>{
    if(!runtime.gameplay||!wrapper.current)return
    if(playerCombat.dead){
      instance.defeatMotion ||=new ScottDefeatMotion(instance,wrapper.current,runtime)
      instance.defeatMotion.apply(runtime.paused?0:Math.min(.1,delta),sampleRideHeight)
      return
    }
    if(instance.defeatMotion?.active){instance.defeatMotion.reset();rideUI.publish({defeat:null})}
    const entry=runtime.transformEntry
    if(entry?.returnFlight&&entry.poseBlend>0){
      instance.returnMotion ||= new ScottReturnMotion(instance,wrapper.current)
      instance.returnMotion.apply(entry,runtime.frontTransformation)
    }
    const armor=runtime.armorController
    if(armor?.active&&!armor.state.groundLanding&&!isJumpCharging(armor.state)){
      instance.armorReaction ||=new ArmorReactiveMotion(instance,wrapper.current)
      instance.armorReaction.apply(armor.state,Math.min(.1,delta),runtime.paused)
    }
    instance.armorBoostMotion ||= new ScottArmorBoostMotion(instance,wrapper.current)
    instance.armorBoostMotion.apply(entry,armor?.active?armor.state.groundLanding||armor.state.jump?{disabled:true}:{boostBlend:instance.armorReaction.diagnostics.boost,reverseBlend:instance.armorReaction.diagnostics.reverse,boosting:armor.state.boosting,thrustForward:armor.state.thrustForward}:runtime.state,Math.min(.1,delta),runtime.paused)
    instance.armorIdle ||= new ScottArmorIdleMotion(instance,wrapper.current)
    if(!armor?.state?.groundLanding&&!armor?.state?.jump)instance.armorIdle.apply(entry,delta,runtime.paused,armorIdleState.snapshot(),!!entry?.actorOffset.y||runtime.state?.airborne)
    instance.armorLocomotion?.apply(armor,Math.min(.1,delta),runtime.paused)
    instance.armorLanding ||= new ArmorLandingMotion(instance)
    instance.armorLanding.apply(armor,Math.min(.1,delta),runtime.paused)
    instance.armorArms ||= new ArmorArmMotion(instance)
    instance.armorArms.apply(armor,instance.armorReaction?.diagnostics,Math.min(.1,delta),runtime.paused)
    wrapper.current.updateMatrixWorld(true)
    if(armor?.active)armor.guardFloor(instance,wrapper.current)
  },-.5)
  useFrame((_,delta)=>{
    if(!runtime.gameplay)return
    instance.armorArticulation?.apply(armorAttachmentTarget(runtime.armorController,runtime.transformEntry),runtime.transformEntry,runtime.paused?0:Math.min(.1,delta))
  },-.45)
  useFrame((_,delta)=>{
    if(!runtime.gameplay||!playerCombat.dead||!instance.defeatMotion?.active)return
    instance.defeatMotion.groundArmor(instance.armorArticulation)
    instance.defeatMotion.publishAge+=delta
    if(instance.defeatMotion.publishAge>.1){instance.defeatMotion.publishAge=0;rideUI.publish({defeat:{...runtime.defeat}})}
  },-.4)
  return <group ref={wrapper} name="Scott_original_playback"><primitive object={instance.model} dispose={null} /></group>
}
