import { bikeConfig } from './bikeConfig.js'
import { clamp, damp, spring, wrapAngle } from './physicsMath.js'
import { updateVerticalDynamics } from './verticalDynamics.js'
import { updateRiderMotion } from './riderMotion.js'
import { updateRoadResponse } from './roadResponse.js'
import { updateWheelie, wheelieSteerBlend } from './wheelieDynamics.js'
import { updateRiderPresence } from './riderPresence.js'
import {createBurnoutState,updateBurnout} from './burnoutDynamics.js'
export { clamp, damp, spring } from './physicsMath.js'

export function createBikeState(start, metrics, sample) {
  const state = {
    ...start, speed: 0, acceleration: 0, steer: 0, yawRate: 0,
    lean: 0, leanVelocity: 0, pitch: 0, bank: 0, height: 0,
    frontSpring: 0, frontVelocity: 0, rearSpring: 0, rearVelocity: 0,
    frontGround: 0, rearGround: 0, frontSpin: 0, rearSpin: 0,
    distance: 0, blocked: false, accumulator: 0,
    travelYaw: start.yaw, slip: 0, handbrake: 0,
    handbrakeTime: 0, rearLateralVelocity: 0,
    burnout:createBurnoutState(),
    parked: true,
    frontGrounded: true, rearGrounded: true, airborne: false, airTime: 0,
    frontAirGap: 0, rearAirGap: 0, verticalVelocity: 0, landingImpact: 0,
    frontImpact: 0, rearImpact: 0, frontLandingCount: 0, rearLandingCount: 0,
    frontLandingLoad: 0, rearLandingLoad: 0,
    frontContact: { surface: null }, rearContact: { surface: null }, roadPhase: 0,
    reverseWait: 0, reverseIntent: false, reverseBlend: 0, reversePhase: 0,
    reverseFeet: { Left: null, Right: null }, boostKick: 0,
    brakeBlend: 0, boostBlend: 0,
    frontAngularSpeed: 0, rearAngularSpeed: 0,
    idleBlend: 1, idleTime: 0,
    riderStand: 0, riderDabLeft: 0, riderDabRight: 0,
    wheelieAngle: 0, wheelieVelocity: 0, wheelieTime: 0, wheelieExhausted: false, wheelieRemaining: 0,
    wheelieSteer: 0, wheelieLandingSpeed: 0, wheelieLandingKick: 0,
    riderMode: 'mounted', dismountBlend: 0, pedestrian: null,
    throttlePressed: false, launchTime: 0,
    boostPressed: false, boostTime: 0, boostCooldown: 0, boostCount: 0,
    boostMode:'ground',airBoostUsed:false,airBoostCount:0,airBoostBlend:0,airBoostGroundTime:0,
    frontHasSurface:true,rearHasSurface:true,
  }
  const f = sample(start.x + Math.sin(start.yaw) * metrics.frontZ, start.z + Math.cos(start.yaw) * metrics.frontZ)
  const r = sample(start.x + Math.sin(start.yaw) * metrics.rearZ, start.z + Math.cos(start.yaw) * metrics.rearZ)
  if (!Number.isFinite(f) || !Number.isFinite(r)) throw Error('El punto de inicio no tiene una superficie de conducción cargada.')
  state.frontGround = f; state.rearGround = r
  state.frontTarget = f + metrics.frontRadius - metrics.frontY
  state.rearTarget = r + metrics.rearRadius - metrics.rearY
  state.frontSpring = f + metrics.frontRadius - metrics.frontY
  state.rearSpring = r + metrics.rearRadius - metrics.rearY
  state.height = (state.frontSpring + state.rearSpring) / 2
  state.pitch = -Math.atan2(state.frontSpring - state.rearSpring, metrics.wheelbase)
  return state
}

// Kinematic bicycle for longitudinal motion + two damped sprung axle supports.
// Each step travels along the wheel heading. Steering never adds lateral translation.
export function stepBike(s, input, dt, m, sample, canMove = () => true, c = bikeConfig, canWalk = () => true) {
  updateRiderPresence(s, input, dt, sample, canWalk, c)
  if (s.riderMode !== 'mounted') input = { brake: 1, steer: 0 }
  s.frontContact ||= { surface: null }; s.rearContact ||= { surface: null }
  if (input.brakeReverse) {
    const canPush = s.speed <= 0.025 && s.frontGrounded && s.rearGrounded && !input.throttle && !input.handbrake
    s.reverseWait = canPush ? (s.reverseWait || 0) + dt : 0
    s.reverseIntent = canPush
    input = { ...input, brake: canPush ? 0 : 1, reverse: canPush && s.reverseWait >= c.reversePause }
  } else { s.reverseWait = 0; s.reverseIntent = !!input.reverse && s.speed <= 0.025 }
  if (input.reverse && s.speed > 0.025) input = { ...input, reverse: false, brake: 1 }
  const burnout=updateBurnout(s,input,dt,c),burning=burnout.phase==='holding'
  const speed = Math.abs(s.speed), previousSpeed = s.speed
  const traction = s.frontGrounded ? 1 : s.rearGrounded ? 0.35 : 0
  s.boostCooldown = Math.max(0, s.boostCooldown - dt)
  s.boostTime = Math.max(0, s.boostTime - dt)
  s.launchTime = Math.max(0, s.launchTime - dt)
  s.boostKick = (s.boostKick || 0) * Math.exp(-dt * 20)
  const airPreset=c.airBoostEnabled&&s.airborne
  s.airBoostGroundTime=s.frontGrounded&&s.rearGrounded?(s.airBoostGroundTime||0)+dt:0
  if(s.airBoostGroundTime>.12)s.airBoostUsed=false
  // A fresh airborne press has its own charge, independent of ground cooldown.
  // The charge returns only after a stable two-wheel landing, never in flight.
  if (input.boost && !s.boostPressed && (airPreset?!s.airBoostUsed:s.boostCooldown <= 1e-8) && !input.brake && !input.brakeReverse && !input.reverse && !input.handbrake && s.speed >= 0) {
    s.boostMode=airPreset?'air':'ground'
    s.speed = Math.max(s.speed,Math.min(Math.max(c.maxSpeed, airPreset?c.airBoostMaxSpeed:c.boostMaxSpeed), s.speed + (airPreset?c.airBoostImpulse:c.boostImpulse)))
    s.boostTime = airPreset?c.airBoostDuration:c.boostDuration
    if(airPreset){s.airBoostUsed=true;s.airBoostCount++;s.frontVelocity+=c.airBoostVerticalImpulse;s.rearVelocity+=c.airBoostVerticalImpulse}
    else s.boostCooldown = c.boostCooldown
    s.boostCount++
    s.boostKick = 1
    s.parked = false
  }
  s.boostPressed = !!input.boost
  if (input.throttle && !s.throttlePressed && speed < 2 && s.rearGrounded) s.launchTime = c.launchDuration
  s.throttlePressed = !!input.throttle
  if (!input.throttle || input.brake || input.reverse) s.launchTime = 0
  if (input.brake || input.brakeReverse || input.reverse || input.handbrake) s.boostTime = 0
  if (input.throttle || input.reverse || s.boostTime > 0 || !traction || speed > 0.1) s.parked = false
  s.handbrake = damp(s.handbrake, input.handbrake ? 1 : 0, 12, dt)
  const normalSteerLimit = Math.min(c.steeringSensitivity, c.mechanicalSteerLimit, Math.atan(m.wheelbase * c.maxLateralAcceleration / (speed * speed + 0.5)))
  const slideSteerLimit = Math.min(c.handbrakeSteerLimit, c.steeringSensitivity, c.mechanicalSteerLimit)
  const steerLimit = normalSteerLimit + Math.max(0, slideSteerLimit - normalSteerLimit) * s.handbrake * clamp(speed / 5, 0, 1) * (s.frontGrounded ? 1 : 0)
  s.steer = damp(s.steer, clamp(input.steer || 0, -1, 1) * steerLimit, c.steeringResponse, dt)
  // The airborne front can show the full steering angle without granting its
  // suspended tire traction or inheriting a huge yaw impulse on touchdown.
  s.wheelieSteer = damp(s.wheelieSteer || 0, clamp(input.steer || 0, -1, 1) * c.mechanicalSteerLimit, 10, dt)
  const grade = (s.frontGround - s.rearGround) / m.wheelbase
  const drag = c.rollingDrag * traction + c.aerodynamicDrag * s.speed * s.speed
  // Engine torque tapers towards its governor, with enough thrust to overcome drag.
  // Above the engine limit, turbine speed bleeds off naturally instead of being clamped away.
  let force = (input.throttle || 0) * (drag + c.acceleration * Math.max(0, 1 - (Math.abs(s.speed) / c.maxSpeed) ** 2)) * clamp((c.maxSpeed - Math.abs(s.speed)) / 0.35, 0, 1)
  force += c.launchAcceleration * (s.launchTime / c.launchDuration)
  if (input.reverse) force = -c.reversePushAcceleration * (0.55 + 0.45 * Math.abs(Math.cos(s.reversePhase)))
  if (input.brake) {
    s.speed = Math.sign(s.speed) * Math.max(0, speed - c.braking * input.brake * traction * dt)
    force = 0
  } else {
    const turbine = (s.boostMode==='air'?c.airBoostAcceleration:c.boostAcceleration) * (s.boostTime / (s.boostMode==='air'?c.airBoostDuration:c.boostDuration))
    const rearDrive = (input.reverse ? traction : s.rearGrounded ? 1 - s.handbrake : 0)*(1-burnout.blend*.8)
    s.speed += (force * rearDrive + turbine - c.gravity * grade * traction) * dt
    s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - drag * dt)
  }
  if (s.speed < 0 && !input.reverse && traction) s.speed = Math.min(0, s.speed + c.reverseFootBrake * dt)
  if (s.handbrake > 0.01 && traction) s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - s.handbrake * c.handbrakeDeceleration * dt)
  s.speed = clamp(s.speed, -c.reverseSpeed, Math.max(c.maxSpeed, c.boostMaxSpeed,c.airBoostEnabled&&(s.airBoostUsed||s.speed>c.boostMaxSpeed)?c.airBoostMaxSpeed:0))
  if ((input.brake || s.handbrake > 0.1) && Math.abs(s.speed) < 0.025 && traction) s.parked = true
  // Scott holds the stopped bike with brake and left foot until drive input.
  if (s.parked && traction && !input.throttle && !input.reverse) s.speed = 0
  if (!input.reverse && !input.throttle && Math.abs(s.speed) < 0.025) s.speed = 0
  s.acceleration = damp(s.acceleration, (s.speed - previousSpeed) / dt, 9, dt)
  s.brakeBlend = damp(s.brakeBlend, (input.brake || 0) * clamp(Math.abs(s.speed) / 2, 0, 1), 18, dt)
  s.boostBlend = damp(s.boostBlend, s.boostTime / c.boostDuration, input.brake || input.handbrake ? 20 : 14, dt)
  s.airBoostBlend=damp(s.airBoostBlend||0,s.boostMode==='air'&&s.boostTime>0?1:0,14,dt)
  s.handbrakeTime = input.handbrake ? s.handbrakeTime + dt : s.handbrake < 0.02 ? 0 : s.handbrakeTime
  const groundYawRate = s.speed * Math.tan(s.steer) / m.wheelbase
  if (traction && s.speed === 0) s.yawRate = 0
  if (s.frontGrounded && s.handbrake > 0.02) {
    const moving = clamp(Math.abs(s.speed) / 6, 0, 1) ** 2, frequency = c.handbrakeWagFrequency * Math.PI * 2
    // Rear-lock instability is an entry transient, not an endless motor-driven
    // oscillation. It fades with the braking speed and expires during the hold.
    const entry = clamp(1 - s.handbrakeTime / c.handbrakeWagDuration, 0, 1)
    const wag = input.handbrake ? c.handbrakeWagAngle * frequency * Math.cos(s.handbrakeTime * frequency) * (1 - Math.abs(input.steer || 0)) * entry : 0
    const turnFade = clamp((c.handbrakeTurnDuration - s.handbrakeTime) / 0.65, 0, 1)
    const oversteer = clamp(groundYawRate * c.handbrakeYawMultiplier, -c.handbrakeYawRate, c.handbrakeYawRate) * turnFade
    s.yawRate = damp(s.yawRate, (oversteer + wag) * s.handbrake * moving, 11, dt)
  } else s.yawRate = s.frontGrounded ? damp(s.yawRate, groundYawRate, 18, dt) : damp(s.yawRate,c.airBoostEnabled?(input.steer||0)*c.airSteerRate:0,c.airBoostEnabled?c.airSteerResponse:1.5,dt)
  if(burnout.phase!=='idle')s.yawRate=burning?burnout.yawRate:s.yawRate*(1-burnout.blend)+burnout.yawRate*burnout.blend
  const yaw = s.yaw + s.yawRate * dt, middleYaw = (s.yaw + yaw) / 2, previousTravelYaw = s.travelYaw
  const drifting = s.handbrake > 0.02 || Math.abs(s.slip) > 0.002
  if (drifting || !traction) {
    const slidingGrip = c.recoveryGrip + (c.handbrakeGrip - c.recoveryGrip) * clamp(Math.abs(s.speed) / 8, 0, 1)
    const grip = traction ? s.handbrake > 0.1 ? slidingGrip : c.recoveryGrip : c.airBoostEnabled?c.airTravelGrip:0
    s.travelYaw += wrapAngle(yaw - s.travelYaw) * (1 - Math.exp(-grip * dt))
    const slip = traction ? clamp(wrapAngle(yaw - s.travelYaw), -c.maxDriftAngle, c.maxDriftAngle) : wrapAngle(yaw - s.travelYaw)
    s.travelYaw = yaw - slip; s.slip = slip
  } else { s.travelYaw = middleYaw; s.slip = 0 }
  if(burning){s.travelYaw=yaw;s.slip=0}
  if (traction && s.speed === 0) { s.travelYaw = s.yaw; s.slip = 0; s.rearAngularSpeed = 0 }
  const distance = s.speed * dt
  // A locked rear slides around the planted front contact. The centre follows
  // that pivot instead of merely tracing a tighter bicycle arc.
  const frontPivot = s.frontGrounded ? m.frontZ * Math.max(s.handbrake * clamp(speed / 3, 0, 1),burnout.pivot) : 0
  const x = s.x + Math.sin(s.travelYaw) * distance + (Math.sin(s.yaw) - Math.sin(yaw)) * frontPivot
  const z = s.z + Math.cos(s.travelYaw) * distance + (Math.cos(s.yaw) - Math.cos(yaw)) * frontPivot
  s.rearLateralVelocity = -Math.sin(s.slip) * s.speed - s.yawRate * m.wheelbase * Math.max(s.handbrake,burnout.pivot)
  s.blocked = !canMove(x, z, yaw)
  if (!s.blocked) { s.x = x; s.z = z; s.yaw = yaw; s.distance += Math.abs(distance) }
  else { s.speed = 0; s.yawRate = 0; s.slip = 0; s.travelYaw = s.yaw;burnout.yawRate=0 }
  if (!s.blocked||burnout.phase!=='idle') {
    if (s.frontGrounded) s.frontAngularSpeed = s.speed * Math.sqrt(1 + grade * grade) / (m.frontRadius * Math.cos(s.steer))
    if (s.rearGrounded && s.handbrake < 0.02) s.rearAngularSpeed = s.speed * Math.sqrt(1 + grade * grade) * Math.cos(s.slip) / m.rearRadius
    if (s.handbrake > 0.02) s.rearAngularSpeed = damp(s.rearAngularSpeed, 0, 42 * s.handbrake, dt)
    if(burnout.phase!=='idle'&&s.rearGrounded)s.rearAngularSpeed=Math.max(Math.abs(s.rearAngularSpeed),burnout.spinSpeed/m.rearRadius)
    s.frontSpin = (s.frontSpin + s.frontAngularSpeed * dt) % (Math.PI * 2)
    s.rearSpin = (s.rearSpin + s.rearAngularSpeed * dt) % (Math.PI * 2)
  }
  const forward = Math.sin(s.yaw), along = Math.cos(s.yaw)
  for(const side of ['front','rear']){
    const ground=sample(s.x+forward*m[side+'Z'],s.z+along*m[side+'Z'],s[side+'Contact'])
    s[side+'HasSurface']=Number.isFinite(ground)
    // Retain a finite last-support reference for attitude/rig calculations;
    // HasSurface=false explicitly removes support in verticalDynamics.
    if(Number.isFinite(ground))s[side+'Ground']=ground
  }
  const resting = Math.abs(s.speed) < 0.35 && !input.throttle && !input.reverse && !s.reverseIntent && s.frontGrounded && s.rearGrounded
  s.idleBlend = damp(s.idleBlend, resting ? 1 : 0, c.idlePoseResponse, dt)
  s.idleTime = s.idleBlend > 0.5 ? s.idleTime + dt : 0
  const pathYawRate = wrapAngle(s.travelYaw - previousTravelYaw) / dt
  const leanYawRate = s.yawRate * (1 - s.handbrake * 0.8) + pathYawRate * s.handbrake * 0.8
  const burnoutLean=burnout.phase==='idle'?0:burnout.yawRate/c.burnoutYawRate*c.burnoutLean*burnout.blend
  const targetLean = traction ? clamp(-Math.atan(s.speed * leanYawRate / c.gravity) - c.idleLean * s.idleBlend - s.wheelieSteer * wheelieSteerBlend(s) * 0.14-burnoutLean, -c.maxLean, c.maxLean) : s.lean
  ;[s.lean, s.leanVelocity] = spring(s.lean, s.leanVelocity, targetLean, c.leanStiffness, c.leanDamping, dt)
  updateRoadResponse(s, dt, m, c)
  updateWheelie(s, input, dt, c)
  updateVerticalDynamics(s, dt, m, c)
  const rightGround = sample(s.x + along * 0.38, s.z - forward * 0.38)
  const leftGround = sample(s.x - along * 0.38, s.z + forward * 0.38)
  s.bank = damp(s.bank, traction&&Number.isFinite(rightGround)&&Number.isFinite(leftGround) ? Math.atan2(rightGround - leftGround, 0.76) : 0, traction ? 12 : 0.5, dt)
  updateRiderMotion(s, dt, c)
}

export function advanceBike(s, input, delta, metrics, sample, canMove, config = bikeConfig, canWalk) {
  s.accumulator += Math.min(Math.max(delta, 0), 0.1)
  while (s.accumulator >= config.fixedStep) {
    stepBike(s, input, config.fixedStep, metrics, sample, canMove, config, canWalk)
    s.accumulator -= config.fixedStep
  }
}
