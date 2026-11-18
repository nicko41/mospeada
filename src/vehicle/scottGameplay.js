import * as T from 'three'
import { isCycloneAction } from './cycloneScottActions.js'
import { sampleRideHeight } from './rideSurface.js'
import { MountedScottMotion, riderFootTransition } from './mountedScottMotion.js'
import { bikeConfig } from './bikeConfig.js'

// Complete source clips drive locomotion and the corrected mount crossing.
// A separate, reset-every-frame posture layer runs only while riding/seating.
export function updateScottGameplay(instance, authored, clips, runtime, wrapper, delta) {
  instance.mountedMotion?.restore()
  const s = runtime.state, p = s.pedestrian, mode = s.riderMode, dt = runtime.paused ? 0 : Math.min(delta, .1)
  let name = 'Cyclone_RidingPose', time = 0, hold = true
  if (mode === 'mounting') { name = 'Cyclone_Mount'; time = (1 - s.dismountBlend) * authored.data.duration }
  else if (mode === 'dismounting') { name = 'Cyclone_Dismount'; time = s.dismountBlend * authored.data.duration }
  else if (mode === 'onFoot' || mode === 'approaching') {
    if (p.crouchBlend > .5) { name = 'air_squat'; time = .8166668266 }
    else if (p.moving) { name = p.runBlend > .5 ? 'Running' : 'walking_2_inplace'; hold = false }
    else { name = 'Walking'; time = .12 }
  }
  if (name !== instance.clip) {
    const previous = instance.action, changedFrame = previous && isCycloneAction(instance.clip) !== isCycloneAction(name)
    const blend = changedFrame || !isCycloneAction(name) ? .18 : 0
    instance.clip = name
    const clip = clips.find(c => c.name === name)
    instance.action = instance.mixer.clipAction(clip).reset().setLoop(isCycloneAction(name) ? T.LoopOnce : T.LoopRepeat, Infinity).setEffectiveWeight(1).play()
    instance.action.clampWhenFinished = isCycloneAction(name)
    if (previous && blend) {
      instance.action.crossFadeFrom(previous, blend, false)
      instance.retiredActions ||= []; instance.retiredActions.push({ action: previous, remaining: blend })
    } else if (previous) previous.stop()
    if (changedFrame) instance.frameTransition = { position: wrapper.position.clone(), quaternion: wrapper.quaternion.clone(), time: 0, duration: blend }
  }
  instance.action.paused = hold
  if (hold) { instance.action.enabled = true; instance.action.time = time }
  instance.mixer.update(dt)
  for (const retired of instance.retiredActions || []) { retired.remaining -= dt; if (retired.remaining <= 0 && retired.action !== instance.action) retired.action.stop() }
  instance.retiredActions = (instance.retiredActions || []).filter(a => a.remaining > 0)
  const position = new T.Vector3(), quaternion = new T.Quaternion(), yaw = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), s.yaw)
  if (isCycloneAction(name)) {
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
  if (mode === 'mounted' || mode === 'stopping') instance.mountedMotion.apply(s, sampleRideHeight, bikeConfig, dt)
  else instance.mountedMotion.applyFeetBlend(riderFootTransition(mode, time, authored.data))
  instance.hands?.forEach(hand => hand.update(mode, dt, riderFootTransition(mode, time, authored.data)))
}
