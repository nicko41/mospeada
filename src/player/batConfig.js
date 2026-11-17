export const RIGHT_HAND_ANCHOR = [0.23, -0.40, -0.52]
// Both orientations share the same right-hand grip. Positions below are local
// offsets from the fixed anchor, including the existing stow/vault transitions.
export const RIGHT_READY_POSITION = [0, 0, 0]
export const RIGHT_READY_ROTATION = [-0.30, 0.25, -0.55]
export const LEFT_READY_POSITION = RIGHT_READY_POSITION
export const LEFT_READY_ROTATION = [-0.45, -0.35, 1.35]
export const BAT_POSITION = RIGHT_READY_POSITION
export const BAT_ROTATION = RIGHT_READY_ROTATION
export const BAT_SCALE = 0.072
export const BAT_GRIP_OFFSET = [0, -2, 0]
// GLB inspected: handle Y=0.545..4.434, barrel tip Y=14.8742.
// Model offset puts the rotation pivot at Y=2, inside the lower grip.
export const BAT_TIP_LOCAL_Y = (14.8742036819458 - 2) * BAT_SCALE
export const BAT_STOW_POSITION = [0.25, -0.85, 0.17]
export const BAT_STOW_ROTATION = [0.35, 0, -1.6]
export const BAT_VAULT_POSITION = [0.17, -0.55, 0.12]
export const BAT_VAULT_ROTATION = [-0.2, 0.3, -1.35]
export const BAT_EQUIP_DURATION = 0.34
export const BAT_STOW_DURATION = 0.28
export const BAT_VAULT_LOWER_DURATION = 0.16
export const BAT_VAULT_RAISE_DURATION = 0.28
export const BAT_WALK_BOB = 0.04
export const BAT_RUN_BOB = 0.075
export const BAT_BOB_STRIDE = 6
export const BAT_WINDUP = 0.075
export const BAT_ACCELERATION = 0.025
export const BAT_MAIN_SWING = 0.055
export const BAT_STRIKE = BAT_ACCELERATION + BAT_MAIN_SWING * 0.7
export const BAT_FOLLOW_THROUGH = 0.10
export const BAT_SWING = BAT_STRIKE + BAT_FOLLOW_THROUGH
export const BAT_RECOVER = 0.08
export const BAT_HIT_TIME = BAT_WINDUP + BAT_STRIKE
export const BAT_DURATION = BAT_WINDUP + BAT_SWING + BAT_RECOVER
export const BAT_CHAIN_TIME = BAT_DURATION
export const BAT_HIT_STOP = 0.07
export const BAT_IMPACT_DURATION = 0.18
export const BAT_IMPACT_BACK = 0.13
export const BAT_IMPACT_ROTATION = [0.060, 0.055, -0.045]
export const BAT_KNOCKBACK_DURATION = 0.26
export const BAT_STAGGER_YAW = 0.18
const ACCELERATION_END = BAT_WINDUP + BAT_ACCELERATION
const PEAK_SPEED_TIME = BAT_HIT_TIME - 0.008
const MAIN_SWING_END = ACCELERATION_END + BAT_MAIN_SWING

// time, weapon position/rotation, local camera translation/rotation (radians).
export const BAT_POSES = [
  [0, RIGHT_READY_POSITION, RIGHT_READY_ROTATION, [0, 0, 0], [0, 0, 0]],
  [BAT_WINDUP, [0.018, 0.018, 0.03], [-0.08, 0.08, -1.18], [0.018, 0.004, 0.028], [0.018, -0.075, -0.038]],
  [ACCELERATION_END, [0.012, 0.012, 0.012], [-0.45, 0.16, -0.88], [0.01, 0, 0.012], [0.008, -0.045, -0.022]],
  [PEAK_SPEED_TIME, [0.002, 0.002, -0.042], [-1.10, 0.04, 0], [-0.012, 0, -0.05], [-0.022, 0.085, 0.042]],
  [BAT_HIT_TIME, [0, 0, -0.05], [-1.11, 0, 0.251], [-0.016, 0, -0.06], [-0.026, 0.11, 0.052]],
  [MAIN_SWING_END, [-0.008, -0.006, -0.042], [-0.94, -0.18, 0.66], [-0.018, -0.004, -0.052], [-0.021, 0.12, 0.06]],
  [BAT_WINDUP + BAT_SWING, [-0.012, -0.008, -0.015], [-0.58, -0.42, 1.60], [-0.01, -0.004, -0.02], [-0.012, 0.065, 0.035]],
  [BAT_DURATION, LEFT_READY_POSITION, LEFT_READY_ROTATION, [0, 0, 0], [0, 0, 0]],
]

// Backhand has its own lower loading/follow-through poses, not a flat mirror.
const BAT_RETURN_POSES = [
  [0, LEFT_READY_POSITION, LEFT_READY_ROTATION, [0, 0, 0], [0, 0, 0]],
  [BAT_WINDUP, [-0.018, 0.018, 0.03], [-0.12, -0.02, 1.62], [-0.018, 0.004, 0.028], [0.018, 0.075, 0.038]],
  [ACCELERATION_END, [-0.012, 0.012, 0.012], [-0.65, -0.12, 1.52], [-0.01, 0, 0.012], [0.008, 0.045, 0.022]],
  [PEAK_SPEED_TIME, [-0.002, 0.002, -0.042], [-1.10, -0.08, 0.51], [0.012, 0, -0.05], [-0.022, -0.085, -0.042]],
  [BAT_HIT_TIME, [0, 0, -0.05], [-1.11, 0, 0.251], [0.016, 0, -0.06], [-0.026, -0.11, -0.052]],
  [MAIN_SWING_END, [0.008, -0.004, -0.042], [-1.0, 0.22, -0.17], [0.018, -0.004, -0.052], [-0.021, -0.12, -0.06]],
  [BAT_WINDUP + BAT_SWING, [0.012, -0.006, -0.015], [-0.45, 0.44, -0.74], [0.01, -0.004, -0.02], [-0.012, -0.065, -0.035]],
  [BAT_DURATION, RIGHT_READY_POSITION, RIGHT_READY_ROTATION, [0, 0, 0], [0, 0, 0]],
]

// Monotone cubic slopes preserve speed through contact without angle/position
// overshoot. Uneven pose spacing concentrates angular travel into the strike.
function slope(poses, index, slot, axis) {
  if (index === 0 || index === poses.length - 1 || index === 1) return 0
  const a = poses[index - 1], b = poses[index], c = poses[index + 1]
  const left = (b[slot][axis] - a[slot][axis]) / (b[0] - a[0])
  const right = (c[slot][axis] - b[slot][axis]) / (c[0] - b[0])
  return left * right <= 0 ? 0 : 2 * left * right / (left + right)
}
function sampleChannel(target, slot, poses, index, t, span) {
  if (!target) return
  const a = poses[index - 1], b = poses[index]
  const t2 = t * t, t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1, h01 = -2 * t3 + 3 * t2
  const h10 = t3 - 2 * t2 + t, h11 = t3 - t2
  target.set(
    h00 * a[slot][0] + h01 * b[slot][0] + span * (h10 * slope(poses, index - 1, slot, 0) + h11 * slope(poses, index, slot, 0)),
    h00 * a[slot][1] + h01 * b[slot][1] + span * (h10 * slope(poses, index - 1, slot, 1) + h11 * slope(poses, index, slot, 1)),
    h00 * a[slot][2] + h01 * b[slot][2] + span * (h10 * slope(poses, index - 1, slot, 2) + h11 * slope(poses, index, slot, 2)))
}

export function sampleBatMotion(time, position, rotation, cameraPosition, cameraRotation, direction = 1) {
  const poses = direction < 0 ? BAT_RETURN_POSES : BAT_POSES
  let index = 1
  while (index < poses.length - 1 && time > poses[index][0]) index++
  const a = poses[index - 1]
  const b = poses[index]
  const t = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])))
  const span = b[0] - a[0]
  sampleChannel(position, 1, poses, index, t, span)
  sampleChannel(rotation, 2, poses, index, t, span)
  sampleChannel(cameraPosition, 3, poses, index, t, span)
  sampleChannel(cameraRotation, 4, poses, index, t, span)
}
