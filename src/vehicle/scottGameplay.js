import * as T from 'three'
import { isCycloneAction } from './cycloneScottActions.js'
import { sampleRideHeight } from './rideSurface.js'
import { MountedScottMotion, riderFootTransition } from './mountedScottMotion.js'
import { bikeConfig } from './bikeConfig.js'
import { TransformationScottPose } from './TransformationScottPose.js'
import { ArmorLocomotion } from './ArmorLocomotion.js'
import {playerCombat} from '../player/playerCombat.js'

// Complete source clips drive locomotion and the corrected mount crossing.
// A separate, reset-every-frame posture layer runs only while riding/seating.
export function updateScottGameplay(instance, authored, clips, runtime, wrapper, delta) {
  instance.defeatMotion?.restore()
  instance.armorHands?.restore()
  instance.armorGallantPose?.restore()
  instance.shooterPose?.restore()
  instance.armorArms?.restore()
  instance.armorLanding?.restore()
  instance.armorLocomotion?.restore()
  instance.armorIdle?.restore()
  instance.armorBoostMotion?.restore()
  instance.armorReaction?.restore()
  instance.returnMotion?.restore()
  instance.transformationPose?.restore()
  instance.mountedMotion?.restore()
  // Armor presents its reference translations after the mixer. Restore the
  // evaluated clip values first: a paused RidingPose may share the same action
  // across both modes, so Three's unchanged-value cache won't write them again.
  for (const ref of instance.armorClipTransforms || []) { ref.bone.position.copy(ref.position); ref.bone.scale.copy(ref.scale) }
  instance.armorClipTransforms = null
  const s = runtime.state, p = s.pedestrian, mode = s.riderMode, dt = runtime.paused||playerCombat.dead ? 0 : Math.min(delta, .1)
  const armor=runtime.armorController?.active?runtime.armorController:null
  const armorReturn=!!runtime.transformEntry?.returnFlight
  if(armorReturn){
    // Armor already occupies the bike's control frame. This is not an
    // on-foot mounting transition: no world-space wrapper tween or outgoing
    // walk/run action may drag Scott sideways through the returning assembly.
    instance.frameTransition=null
    for(const retired of instance.retiredActions||[])retired.action.stop()
    instance.retiredActions=[]
  }
  if(armor&&!instance.armorLocomotion)instance.armorLocomotion=new ArmorLocomotion(instance,authored.data.actorScale)
  let name = 'Cyclone_RidingPose', time = 0, hold = true
  if(armor?.state.mode==='ARMOR_GROUND'&&!armor.state.jump&&!armor.state.groundLanding){
    if(armor.state.groundTurn){name=armor.state.groundTurn.name;time=armor.state.groundTurn.time}
    else{name=instance.armorLocomotion.groundGait(armor.state.speed);hold=false}
  }
  else if (mode === 'mounting') { name = 'Cyclone_Mount'; time = (1 - s.dismountBlend) * authored.data.duration }
  else if (mode === 'dismounting') { name = 'Cyclone_Dismount'; time = s.dismountBlend * authored.data.duration }
  else if (mode === 'onFoot' || mode === 'approaching') {
    if (p.crouchBlend > .5) { name = 'air_squat'; time = .8166668266 }
    else if (p.moving) { name = p.runBlend > .5 ? 'Running' : 'walking_2_inplace'; hold = false }
    else { name = 'Walking'; time = .12 }
  }
  if (name !== instance.clip) {
    const previous = instance.action, changedFrame = previous && !armor && !armorReturn && isCycloneAction(instance.clip) !== isCycloneAction(name)
    const nativeTransition=instance.clip?.startsWith('Armor_')&&name.startsWith('Armor_')
    const from=instance.armorLocomotion?.info.get(instance.clip),to=instance.armorLocomotion?.info.get(name)
    const gaitPhase=nativeTransition&&from?.contactPhase!==undefined&&to?.contactPhase!==undefined?((previous.time/previous.getClip().duration-from.contactPhase+to.contactPhase)%1+1)%1:null
    const blend = armor ? (nativeTransition ? (name.startsWith('Armor_Turn')?.10:name==='Armor_Run'?.12:.18) : 0) : (changedFrame || !isCycloneAction(name) ? .18 : 0)
    instance.clip = name
    const clip = instance.armorLocomotion?.clips.get(name)||clips.find(c => c.name === name)
    instance.action = instance.mixer.clipAction(clip).reset().setLoop(isCycloneAction(name) ? T.LoopOnce : T.LoopRepeat, Infinity).setEffectiveWeight(1).play()
    instance.action.clampWhenFinished = isCycloneAction(name)
    if(gaitPhase!==null)instance.action.time=gaitPhase*clip.duration
    if (previous && blend) {
      instance.action.crossFadeFrom(previous, blend, false)
      instance.retiredActions ||= []; instance.retiredActions.push({ action: previous, remaining: blend })
    } else if (previous) previous.stop()
    if (changedFrame) instance.frameTransition = { position: wrapper.position.clone(), quaternion: wrapper.quaternion.clone(), time: 0, duration: blend }
  }
  instance.action.paused = hold
  instance.action.setEffectiveTimeScale(armor&&name.startsWith('Armor_')?Math.min(3,armor.state.speed/instance.armorLocomotion.info.get(name).speed):1)
  if (hold) { instance.action.enabled = true; instance.action.time = time }
  instance.mixer.update(dt)
  for (const retired of instance.retiredActions || []) { retired.remaining -= dt; if (retired.remaining <= 0 && retired.action !== instance.action) retired.action.stop() }
  instance.retiredActions = (instance.retiredActions || []).filter(a => a.remaining > 0)
  if(armor)instance.armorLocomotion.capture(name)
  const position = new T.Vector3(), quaternion = new T.Quaternion(), yaw = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), s.yaw)
  if (armor || isCycloneAction(name)) {
    const origin = new T.Vector3().fromArray(authored.data.actorOrigin), body = runtime.scottBikeBody
    body.updateWorldMatrix(true, false); position.copy(body.localToWorld(origin.clone())); quaternion.copy(body.getWorldQuaternion(new T.Quaternion()))
    if (s.dismountBlend > 0) {
      const upright = origin.applyQuaternion(yaw).add(new T.Vector3(s.x, sampleRideHeight(s.x, s.z), s.z))
      position.lerp(upright, s.dismountBlend); quaternion.slerp(yaw, s.dismountBlend)
    }
  } else { position.set(p.x, p.ground, p.z); quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), p.yaw) }
  if (instance.frameTransition) {
    const transition = instance.frameTransition; transition.time += dt
    const alpha = Math.min(1, transition.time / transition.duration)
    position.lerpVectors(transition.position, position, alpha); quaternion.slerpQuaternions(transition.quaternion, quaternion, alpha)
    if (alpha === 1) instance.frameTransition = null
  }
  wrapper.position.copy(position); wrapper.quaternion.copy(quaternion); wrapper.scale.setScalar(authored.data.actorScale); wrapper.updateMatrixWorld(true)
  instance.mountedMotion ||= new MountedScottMotion(instance, wrapper, runtime.vehicleRig, authored.data.measuredTargets.grips)
  const transformPose=runtime.transformEntry?.poseBlend||0
  if (runtime.armorController?.active) {
    // Preserve the exact approved pelvis placement captured on entry; riding
    // boost/stand/foot IK no longer controls the Armor base.
    instance.armorClipTransforms = (instance.armorReferencePose || []).map(ref => ({ bone: ref.bone, position: ref.bone.position.clone(), scale: ref.bone.scale.clone() }))
    for(const ref of instance.armorReferencePose||[]){ref.bone.position.copy(ref.position);ref.bone.scale.copy(ref.scale)}
    instance.bones.get('mixamorigHips').position.copy(instance.armorBaseHipPosition)
    wrapper.updateMatrixWorld(true)
  }
  else if (mode === 'mounted' || mode === 'stopping') instance.mountedMotion.apply(s, sampleRideHeight, bikeConfig, dt)
  else instance.mountedMotion.applyFeetBlend(riderFootTransition(mode, time, authored.data))
  if (transformPose>0) {
    instance.transformationPose ||= new TransformationScottPose(instance,wrapper)
    instance.transformationPose.apply(transformPose,runtime.transformEntry.actorPose)
    const offset=runtime.transformEntry.actorOffset
    if(offset){wrapper.position.add(offset);wrapper.updateMatrixWorld(true)}
  }
  instance.hands?.forEach(hand => hand.update(transformPose>.5?'onFoot':mode, dt, riderFootTransition(mode, time, authored.data)))
}
