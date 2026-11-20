import { clamp, damp, wrapAngle } from './physicsMath.js'

export function requestRiderToggle(s, config) {
  if (s.riderMode === 'mounted') { s.riderMode = 'stopping'; return true }
  if (s.riderMode === 'stopping') { s.riderMode = 'mounted'; return true }
  if (s.riderMode === 'onFoot' && Math.hypot(s.pedestrian.x - s.x, s.pedestrian.z - s.z) < 1.8) {
    s.riderMode = config?.mountAnchor ? 'approaching' : 'mounting'; s.pedestrian.moving = false; return true
  }
  if (s.riderMode === 'approaching') { s.riderMode = 'onFoot'; return true }
  return false
}

export function riderMountPoint(s, anchor) {
  return { x: s.x + Math.cos(s.yaw) * anchor[0] + Math.sin(s.yaw) * anchor[2], z: s.z - Math.sin(s.yaw) * anchor[0] + Math.cos(s.yaw) * anchor[2] }
}

function beginDismount(s, sample, canWalk, c) {
  for (const side of [1, -1]) {
    if (c.mountAnchor && side === -1) continue
    const anchor = c.mountAnchor ? riderMountPoint(s, c.mountAnchor) : null
    const x = anchor?.x ?? s.x + Math.cos(s.yaw) * side * 1.1 - Math.sin(s.yaw) * 0.2
    const z = anchor?.z ?? s.z - Math.sin(s.yaw) * side * 1.1 - Math.cos(s.yaw) * 0.2
    if (!Number.isFinite(sample(x, z)) || !canWalk(x, z)) continue
    s.pedestrian = { x, z, ground: sample(x, z), yaw: s.yaw, phase: 0, moving: false, motionBlend: 0, runBlend: 0, crouchBlend: 0, feet: { Left: null, Right: null }, side }
    s.riderMode = 'dismounting'; return
  }
  s.riderMode = 'mounted'
}

export function updateRiderPresence(s, input, dt, sample, canWalk, c) {
  if (s.riderMode === 'stopping' && Math.abs(s.speed) < 0.03 && s.frontGrounded && s.rearGrounded && s.wheelieAngle < 0.01) beginDismount(s, sample, canWalk, c)
  if (s.riderMode === 'dismounting') {
    s.dismountBlend = Math.min(1, s.dismountBlend + dt / c.dismountDuration)
    if (s.dismountBlend === 1) s.riderMode = 'onFoot'
  } else if (s.riderMode === 'mounting') {
    s.dismountBlend = Math.max(0, s.dismountBlend - dt / c.dismountDuration)
    if (s.dismountBlend === 0) { s.riderMode = 'mounted'; s.pedestrian = null }
  } else if (s.riderMode === 'approaching') {
    const p = s.pedestrian, target = riderMountPoint(s, c.mountAnchor), dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz)
    const step = Math.min(distance, c.walkSpeed * dt), x = p.x + dx / Math.max(distance, .00001) * step, z = p.z + dz / Math.max(distance, .00001) * step
    if (distance > .015 && !canWalk(x, z)) { s.riderMode = 'onFoot'; p.moving = false; return }
    p.x = x; p.z = z; p.ground = sample(x, z); p.moving = distance > .015; p.runBlend = 0; p.crouchBlend = 0
    p.yaw += wrapAngle((p.moving ? Math.atan2(dx, dz) : s.yaw) - p.yaw) * (1 - Math.exp(-dt * 16))
    if (distance < .015 && Math.abs(wrapAngle(p.yaw - s.yaw)) < .04) { p.x = target.x; p.z = target.z; p.yaw = s.yaw; p.moving = false; s.riderMode = 'mounting' }
  } else if (s.riderMode === 'onFoot') {
    const p = s.pedestrian, forward = input.walkForward || 0, side = input.walkSide || 0, yaw = input.walkYaw || 0
    p.crouchBlend = damp(p.crouchBlend || 0, input.crouch ? 1 : 0, 10, dt)
    p.runBlend = damp(p.runBlend || 0, input.run && !input.crouch && Math.hypot(forward, side) > 0 ? 1 : 0, 10, dt)
    const stride = c.walkStride + p.runBlend * (1.5 - c.walkStride)
    p.stride = stride; p.contactDuty = 0.6 - p.runBlend * 0.28
    const length = Math.hypot(forward, side), distance = (c.walkSpeed + p.runBlend * (c.runSpeed - c.walkSpeed)) * (1 - p.crouchBlend * 0.6) * dt
    const dx = (Math.sin(yaw) * forward - Math.cos(yaw) * side) / Math.max(1, length) * distance
    const dz = (Math.cos(yaw) * forward + Math.sin(yaw) * side) / Math.max(1, length) * distance
    const free = (x, z) => Number.isFinite(sample(x, z)) && Math.abs(sample(x, z) - p.ground) < 0.24 && canWalk(x, z)
    const oldX = p.x, oldZ = p.z
    if (free(p.x + dx, p.z)) p.x += dx
    if (free(p.x, p.z + dz)) p.z += dz
    const travelled = Math.hypot(p.x - oldX, p.z - oldZ)
    p.moving = travelled > 1e-6; p.ground = sample(p.x, p.z)
    p.motionBlend = damp(p.motionBlend || 0, p.moving ? 1 : 0, 10, dt)
    if (p.moving) {
      const heading = Math.atan2(p.x - oldX, p.z - oldZ)
      p.yaw += wrapAngle(heading - p.yaw) * (1 - Math.exp(-dt * 14))
      p.phase += travelled / stride * Math.PI * 2
      for (const side of ['Left', 'Right']) {
        const phase = p.phase / (Math.PI * 2) + (side === 'Right' ? 0.5 : 0), cycle = Math.floor(phase), part = phase - cycle
        if (part >= p.contactDuty) { p.feet[side] = null; continue }
        if (p.feet[side]?.cycle !== cycle) {
          const x = side === 'Left' ? 0.2 : -0.2, z = 0.25
          p.feet[side] = { cycle, x: p.x + Math.cos(p.yaw) * x + Math.sin(p.yaw) * z, z: p.z - Math.sin(p.yaw) * x + Math.cos(p.yaw) * z }
        }
      }
    } else { p.feet.Left = p.feet.Right = null }
  }
}

export function pedestrianFoot(p, side) {
  const anchor = p.feet[side]
  if (p.moving && anchor) return { ...anchor, lift: 0 }
  const phase = p.phase / (Math.PI * 2) + (side === 'Right' ? 0.5 : 0), part = phase - Math.floor(phase)
  const duty = p.contactDuty ?? 0.6, travel = (p.stride ?? 0.9) * duty
  const swing = clamp((part - duty) / (1 - duty), 0, 1)
  const x = side === 'Left' ? 0.2 : -0.2, z = p.moving ? 0.25 - travel + travel * swing : 0
  return { x: p.x + Math.cos(p.yaw) * x + Math.sin(p.yaw) * z, z: p.z - Math.sin(p.yaw) * x + Math.cos(p.yaw) * z, lift: p.moving ? (0.1 + (p.runBlend || 0) * 0.04) * Math.sin(swing * Math.PI) : 0 }
}

export function riderCameraState(s) {
  if (!s.pedestrian || !s.dismountBlend) return s
  const blend = s.dismountBlend * s.dismountBlend * (3 - 2 * s.dismountBlend), p = s.pedestrian
  return { ...s, x: s.x + (p.x - s.x) * blend, z: s.z + (p.z - s.z) * blend, height: s.height + (p.ground - s.height) * blend, yaw: p.yaw, travelYaw: p.yaw, speed: p.moving ? 1.7 : 0, boostTime: 0 }
}
