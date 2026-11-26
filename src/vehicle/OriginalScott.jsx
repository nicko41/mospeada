import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {useGLTF,loadGLTF,loadTexture,useJSON,loadJSON} from '../loading/resources.js'
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
import {isJumpCharging,jumpUsesStrafePose} from './armorJumpMotion.js'
import {ScottDefeatMotion} from './ScottDefeatMotion.js'
import {ScottHitMotion} from './ScottHitMotion.js'
import {playerCombat} from '../player/playerCombat.js'
import {rideUI} from './rideUI.js'
import {SCOTT_MODEL,SCOTT_RIG_REFERENCE,SCOTT_V2_MODEL,SCOTT_MODEL_VARIANT} from './scottModelConfig.js'
import {createScottRidingPose} from './ScottAirSquatRidingPose.js'
import {ScottModelComparison} from './ScottModelComparison.js'
import {scottModelSelection} from './scottModelSelection.js'

// Start the rider and its maps alongside the motorcycle request. Without this,
// Suspense discovers GLB -> action data -> shoulder maps in separate retries.
const SCOTT_ACTIONS='/animations/scott-cyclone-actions.json'
const SCOTT_MAPS=['/models/mospeada/scott-shoulders-decals.png', '/models/mospeada/scott-shoulders-normal.png', '/models/mospeada/scott-shoulders-roughness.png']
const CONTROLLER='/delivery/scott-controller-v2.glb',REFERENCE='/delivery/scott-reference-v1.glb',VISUAL='/delivery/scott-v3.glb'
useGLTF.preload(CONTROLLER);useGLTF.preload(REFERENCE);useGLTF.preload(VISUAL);loadJSON(SCOTT_ACTIONS)

export default function OriginalScott({ runtime }) {
  const {scene}=useThree()
  const asset = useGLTF(CONTROLLER)
  const reference = useGLTF(REFERENCE)
  const v3Asset = useGLTF(VISUAL)
  const actionData = useJSON(SCOTT_ACTIONS)
  const authored = useMemo(() => ({data:actionData,clips:parseCycloneScottActions(actionData)}),[actionData])
  const clips = useMemo(() => [...asset.animations, ...authored.clips], [asset.animations, authored])
  const wrapper = useRef(), instance = useMemo(() => {
    const model = clone(asset.scene), skins = [], bones = new Map(), hands = []
    model.traverse(node => {
      if (node.isBone) bones.set(node.name, node)
      if (node.isSkinnedMesh) {
        node.frustumCulled = false; node.castShadow = false;node.visible=false;node.userData.cpuOnly=true
        const original = node.material, clean = original.clone()
        skins.push({ mesh: node, original, clean })
        const relaxed = createRelaxedScottHands(node)
        if (relaxed) hands.push(relaxed)
      }
    })
    return { model, sourceScene: reference.scene, sourceClips:reference.animations, hands, mixer: new T.AnimationMixer(model), skins, bones, action: null, clip: null, lastSeek: -1, clean: null, stamp: 0, anchor: new T.Vector3() }
  }, [asset.scene,reference.scene])
  useLayoutEffect(() => {
    // StrictMode replays effect setup/cleanup; reinstall the private variant.
    instance.hands.forEach(hand => hand.attach())
    instance.modelComparison=new ScottModelComparison(instance,{v3:v3Asset.scene},'v3')
    instance.modelComparison.select(scottModelSelection.snapshot().variant)
    scottModelSelection.ready(true)
    playback.set({ clips: clips.map(c => ({ name: c.name, duration: c.duration })), ready: true })
    runtime.scottData = authored.data
    runtime.scottInstance = instance
    const comparison=instance.modelComparison
    const removeLoader=scottModelSelection.setLoader(async variant=>{
      if(comparison.skins.some(s=>s.variant===variant))return
      const [visual,maps]=await Promise.all([loadGLTF(variant==='v1'?SCOTT_RIG_REFERENCE:SCOTT_V2_MODEL),variant==='v1'?Promise.all(SCOTT_MAPS.map(loadTexture)):Promise.resolve([])])
      if(runtime.scottInstance!==instance)return
      maps.forEach((map,i)=>{map.flipY=false;map.colorSpace=i===0?T.SRGBColorSpace:T.NoColorSpace;map.needsUpdate=true})
      comparison.addVariant(variant,visual.scene,maps)
      const weathering=runtime.weathering
      if(weathering?.scottLayer){weathering.scottLayer.addSkins(comparison.skins.filter(s=>s.variant===variant));weathering.scottLayer.install()}
        const root=new T.Group()
        root.userData.preparationRoots=new Set(comparison.skins.filter(s=>s.variant===variant).map(s=>s.mesh))
        await scene.userData.animeRenderer.prepareStage(root,'scott-'+variant)
    })
    if(SCOTT_MODEL_VARIANT==='gear-v2')instance.v2RidingPose ||=createScottRidingPose(instance,authored.data)
    // Sample/measure original clips during loading, not on the first T or
    // the first Armor frame. These constructors do not apply a body pose.
    instance.armorLocomotion ||= new ArmorLocomotion(instance,authored.data.actorScale)
    instance.transformationPose ||= new TransformationScottPose(instance,wrapper.current)
    if (import.meta.env.DEV) window.__SCOTT_ORIGINAL__ = { instance, source: asset, reference, playback, wrapper, authored, model:SCOTT_MODEL, statement: 'Selected visual skin; original 24-bone rig, 16 unchanged clips and reference anchor topology.' }
    return () => {removeLoader();scottModelSelection.ready(false);instance.modelComparison.dispose();delete instance.modelComparison;delete runtime.scottInstance; instance.mixer.stopAllAction(); instance.mixer.uncacheRoot(instance.model); instance.clip = null; instance.action = null; instance.lastSeek = -1; instance.hands.forEach(h => h.dispose()); instance.skins.forEach(s => s.clean.dispose()); if (import.meta.env.DEV) delete window.__SCOTT_ORIGINAL__ }
    }, [instance, asset.animations, clips, authored, reference.scene, v3Asset.scene,scene])
  useLayoutEffect(()=>()=>{instance.armorArticulation?.dispose();delete instance.armorArticulation},[instance])
  // Restore ONLY the four attachment assemblies before the normal mechanics.
  useFrame(()=>{instance.modelComparison?.v3?.restoreAttachments();instance.armorArticulation?.restore()},-2.15)
  useFrame((_, delta) => {
    const s = runtime.state
    if (!s || !wrapper.current) return
    const p = playback.snapshot()
    if (runtime.gameplay) {
      if (instance.clean !== p.cleanShoulders) { instance.clean = p.cleanShoulders; (instance.modelComparison?.skins||instance.skins).forEach(skin => { skin.mesh.material = p.cleanShoulders ? skin.clean : skin.original }) }
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
      ;(instance.modelComparison?.skins||instance.skins).forEach(skin => { skin.mesh.material = p.cleanShoulders ? skin.clean : skin.original })
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
    const jumpStrafe=armor?.active&&jumpUsesStrafePose(armor.state)
    if(armor?.active&&!armor.state.groundLanding&&!isJumpCharging(armor.state)){
      instance.armorReaction ||=new ArmorReactiveMotion(instance,wrapper.current)
      instance.armorReaction.apply(armor.state,Math.min(.1,delta),runtime.paused)
    }
    instance.armorBoostMotion ||= new ScottArmorBoostMotion(instance,wrapper.current)
    instance.armorBoostMotion.apply(entry,armor?.active?armor.state.groundLanding||armor.state.jump&&!jumpStrafe?{disabled:true}:{boostBlend:instance.armorReaction.diagnostics.boost,reverseBlend:instance.armorReaction.diagnostics.reverse,boosting:armor.state.boosting,thrustForward:armor.state.thrustForward}:runtime.state,Math.min(.1,delta),runtime.paused)
    instance.armorIdle ||= new ScottArmorIdleMotion(instance,wrapper.current)
    if(!armor?.state?.groundLanding&&(!armor?.state?.jump||jumpStrafe))instance.armorIdle.apply(entry,delta,runtime.paused,armorIdleState.snapshot(),!!entry?.actorOffset.y||runtime.state?.airborne)
    instance.armorLocomotion?.apply(armor,Math.min(.1,delta),runtime.paused)
    instance.armorLanding ||= new ArmorLandingMotion(instance)
    instance.armorLanding.apply(armor,Math.min(.1,delta),runtime.paused)
    instance.armorArms ||= new ArmorArmMotion(instance)
    instance.armorArms.apply(armor,instance.armorReaction?.diagnostics,Math.min(.1,delta),runtime.paused)
    wrapper.current.updateMatrixWorld(true)
    if(armor?.active)armor.guardFloor(instance,wrapper.current)
  },-.5)
  useFrame((_,delta)=>{
    if(!runtime.gameplay||!wrapper.current||!instance.mountedMotion)return
    instance.hitMotion ||=new ScottHitMotion(instance,wrapper.current,runtime)
    instance.hitMotion.apply(runtime.paused?0:Math.min(.1,delta),sampleRideHeight)
    wrapper.current.updateMatrixWorld(true)
  },-.455)
  useFrame((_,delta)=>{
    if(!runtime.gameplay)return
    instance.armorArticulation?.apply(armorAttachmentTarget(runtime.armorController,runtime.transformEntry),runtime.transformEntry,runtime.paused?0:Math.min(.1,delta))
  },-.45)
  useFrame((_,delta)=>{
    if(runtime.gameplay&&!playerCombat.dead)instance.hitMotion?.groundArmor(instance.armorArticulation)
    if(!runtime.gameplay||!playerCombat.dead||!instance.defeatMotion?.active)return
    instance.defeatMotion.groundArmor(instance.armorArticulation)
    instance.defeatMotion.publishAge+=delta
    if(instance.defeatMotion.publishAge>.1){instance.defeatMotion.publishAge=0;rideUI.publish({defeat:{...runtime.defeat}})}
  },-.4)
  useFrame((_,delta)=>{
    const visual=instance.modelComparison;if(!visual)return
    visual.select(scottModelSelection.snapshot().variant);visual.syncHands()
    if(visual.variant==='v3'){visual.v3.apply(runtime,runtime.paused?0:Math.min(.1,delta));visual.v3.fitArmor(runtime)}
  },-.35)
  return <group ref={wrapper} name="Scott_original_playback"><primitive object={instance.model} dispose={null} /></group>
}
