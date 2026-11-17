export const HIT_STRENGTH = 1
export const HIT_RECOIL_DURATION = 0.20
export const HIT_RECOVERY_DURATION = 0.22
export const HIT_INTERRUPT_RECOVERY_EXTRA = 0.05
export const HIT_OVERRIDE_WEIGHT = 0.85
export const HIT_DURATION_VARIATION = 0.12
export const HIT_AMPLITUDE_VARIATION = 0.15
export const HIT_ATTACK_INTERRUPT_BOOST = 1.2
export const HIT_HEAD_LAG = 0.035
export const HEAD_IMPACT_MAX = 34
export const NECK_IMPACT_MAX = 13
export const HEAD_WHIP_DAMPING = 8
export const HEAD_WHIP_FREQUENCY = 22 // Radians per second, damped response.
export const HIT_RISE_TIME = 0.025
export const HIT_ROOT_DELAY = 0.01
export const HIT_ROOT_TILT_WEIGHT = 0.35
export const FALL_CHANCE = 0.25
export const FALL_COOLDOWN = 4
export const FALL_DURATION = 0.34
export const FALL_HOLD_DURATION = 0.40
export const FALL_RECOVERY_DURATION = 0.70
export const FALL_ANGLE = Math.PI * 0.48
export const FALL_GROUND_CLEARANCE = 0.30

// Procedural target limits relative to the captured impact pose, in degrees.
// Parent-first order distributes the impact down the existing bone hierarchy.
export const HIT_BONES = [
  { role: 'pelvis', aliases: ['hips', 'pelvis'], degrees: 9, lag: 0.01 },
  { role: 'leftLeg', aliases: ['leftupleg', 'thighl'], degrees: 12, lag: 0.018, side: -1 },
  { role: 'rightLeg', aliases: ['rightupleg', 'thighr'], degrees: 12, lag: 0.022, side: 1 },
  { role: 'spine', aliases: ['spine', 'spine0'], degrees: 5, lag: 0.012 },
  { role: 'upperSpine', aliases: ['spine1', 'abdomen'], degrees: 4, lag: 0.006 },
  { role: 'chest', aliases: ['spine2', 'chest', 'upperchest'], degrees: 10, lag: 0 },
  { role: 'neck', aliases: ['neck', 'neck1'], degrees: NECK_IMPACT_MAX, lag: 0.018 },
  { role: 'head', aliases: ['head'], degrees: HEAD_IMPACT_MAX, lag: HIT_HEAD_LAG },
  { role: 'leftShoulder', aliases: ['leftshoulder', 'claviclel', 'shoulderl'], degrees: 8, lag: 0.01, side: -1 },
  { role: 'rightShoulder', aliases: ['rightshoulder', 'clavicler', 'shoulderr'], degrees: 8, lag: 0.016, side: 1 },
]
