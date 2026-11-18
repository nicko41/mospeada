import { clamp, damp, spring } from './physicsMath.js'
import { compressionStroke } from './suspensionLimits.js'

// Each sprung axle can lose its unilateral ground support. An unsupported axle
// follows gravity, retaining its take-off velocity, until its drooped wheel lands.
export function updateVerticalDynamics(s, dt, m, c) {
  // Terrain suspension retains its own front contact while the exhibition
  // controlled wheelie rotates the complete assembly around the rear axle.
  if (s.frontWheelieLifted) s.frontGrounded = s.frontTerrainGrounded
  const pitchLoad = clamp(-s.acceleration * c.pitchIntensity - (s.boostBlend || 0) * c.boostChassisPitch, -c.maxPitch, c.maxPitch)
  let landingSpeed = 0
  for (const side of ['front', 'rear']) {
    const front = side === 'front', positionKey = side + 'Spring', velocityKey = side + 'Velocity'
    const target = s[side + 'Ground'] + m[side + 'Radius'] - m[side + 'Y']
    const previous = s[side + 'Target'] ?? target
    const previousSurfaceVelocity = s[side + 'SurfaceVelocity'] || 0
    const terrainVelocity = (target - previous) / dt
    const surfaceVelocity = damp(previousSurfaceVelocity, terrainVelocity, 35, dt)
    const travelled = Math.max(Math.abs(s.speed) * dt, 1e-6)
    const grade = (target - previous) / travelled
    let rampSlope = (s[side + 'RampSlope'] || 0) * Math.exp(-travelled / 1.4)
    let rampRise = (s[side + 'RampRise'] || 0) * Math.exp(-travelled / 3)
    if (s[side + 'Grounded'] !== false && Math.abs(s.speed) > 2 && grade > 0.025) {
      rampSlope = Math.max(rampSlope, grade)
      rampRise += Math.max(0, target - previous)
    }
    s[side + 'RampSlope'] = rampSlope; s[side + 'RampRise'] = rampRise
    s[side + 'Target'] = target; s[side + 'SurfaceVelocity'] = surfaceVelocity
    const extension = (front ? c.forkExtension * 0.872 : c.rearExtension)
    const normalCompression = (front ? c.forkCompression * 0.872 : c.rearCompression)
    s[side + 'LandingLoad'] = (s[side + 'LandingLoad'] || 0) * Math.exp(-dt * c.landingSettleRate)
    const compression = () => compressionStroke(s, side, c) * (front ? 0.872 : 1)
    // Acceleration plants the rear support; braking plants the front. Limit the
    // requested chassis shift to the real stroke so a load transfer cannot unseat a fork.
    const loadShift = clamp((front ? -1 : 1) * pitchLoad * m.wheelbase / 2, -normalCompression, extension)
    let position = s[positionKey], velocity = s[velocityKey], grounded = s[side + 'Grounded'] !== false
    let impact = (s[side + 'Impact'] || 0) * Math.exp(-dt * c.landingRecovery)
    if (s.wheelieLandingSpeed > 0 && grounded) {
      const closingSpeed = s.wheelieLandingSpeed * (front ? 1 : 0.22)
      const load = clamp(closingSpeed / c.landingFullCompressionSpeed, 0, 1)
      s[side + 'LandingLoad'] = Math.max(s[side + 'LandingLoad'], load)
      impact = Math.max(impact, load)
      velocity = Math.min(velocity, surfaceVelocity - closingSpeed * c.landingVelocityRetention)
      if (front) {
        landingSpeed = Math.max(landingSpeed, closingSpeed)
        s.frontLandingCount++; s.frontLandingSpeed = closingSpeed
        s.frontRampSlope = 0; s.frontRampRise = 0
      }
    }
    const land = () => {
      if (front && s.wheelieAngle > 0.025 && s.rearGrounded) {
        // This is the terrain guide underneath the raised wheel, not a tire
        // impact. Only the eventual wheelie contact may load the front fork.
        s.frontRampSlope = 0; s.frontRampRise = 0
        position = clamp(target + loadShift, target - normalCompression, target + extension)
        velocity = surfaceVelocity; grounded = true
        return
      }
      const closingSpeed = Math.max(0, terrainVelocity - velocity)
      landingSpeed = Math.max(landingSpeed, closingSpeed)
      impact = Math.max(impact, clamp(closingSpeed / c.landingFullCompressionSpeed, 0, 1))
      s[side + 'LandingCount'] = (s[side + 'LandingCount'] || 0) + 1
      s[side + 'LandingSpeed'] = closingSpeed
      s[side + 'RampSlope'] = 0; s[side + 'RampRise'] = 0
      s[side + 'LandingLoad'] = Math.max(s[side + 'LandingLoad'], impact)
      // Keep the wheel on its contact patch. The chassis retains a strong,
      // bounded downward impulse and compresses over several frames, rather
      // than teleporting to the bottom of a 6 cm stroke and killing the fall.
      position = Math.max(position, target - compression())
      velocity = surfaceVelocity - Math.min(closingSpeed * c.landingVelocityRetention, c.landingMaxCompressionVelocity)
      grounded = true
    }
    const desired = () => clamp(target + loadShift + (s[side + 'RoadOffset'] || 0), target - compression(), target + extension)
    if (!c.flightEnabled && grounded) {
      ;[position, velocity] = spring(position, velocity, desired(), c.suspensionStiffness, c.suspensionDamping, dt)
      const bounded = clamp(position, target - compression(), target + extension)
      if (bounded !== position) velocity *= 0.2
      position = bounded; grounded = true
    } else {
      if (!grounded && position <= target + extension && velocity <= terrainVelocity + 0.1) {
        land()
      }
      if (grounded) {
        const landingBlend = clamp(s[side + 'LandingLoad'] * 5, 0, 1)
        const stiffness = c.suspensionStiffness + (c.landingStiffness - c.suspensionStiffness) * landingBlend
        const damping = c.suspensionDamping + (c.landingDamping - c.suspensionDamping) * landingBlend
        const acceleration = (desired() - position) * stiffness + (surfaceVelocity - velocity) * damping
        const terrainReceding = target < previous - 0.00001 || previousSurfaceVelocity > c.takeoffVelocityThreshold && surfaceVelocity < previousSurfaceVelocity
        // Suspension recovery is not a second ramp. A very slight downhill
        // must not amplify its rebound with the terrain-launch multiplier.
        const crestRelease = s[side + 'LandingLoad'] < 0.05 && acceleration < -c.gravity - c.takeoffAccelerationMargin && velocity - surfaceVelocity > c.takeoffVelocityThreshold
        const rampCrest = rampRise > 0.08 && rampSlope > 0.04 && grade < rampSlope * 0.45 && Math.abs(s.speed) > 3
        // Ground can push the bike up, but cannot pull it down over a crest.
        if (c.flightEnabled && (rampCrest || terrainReceding && (position > target + extension + 0.002 || crestRelease))) {
          grounded = false
          // Use the ascending terrain's approach speed, not a spring velocity
          // which can lag or even turn negative when a fast bike crosses it.
          const approach = rampRise > 0.04 ? rampSlope * Math.abs(s.speed) : 0
          velocity = Math.max(velocity, approach)
          const launchLimit = c.maxTerrainLaunchSpeed * (0.70 + 0.30 * clamp(Math.abs(s.speed) / 60, 0, 1))
          velocity = velocity > 0 ? Math.min(velocity * c.terrainLaunchGain, launchLimit) : velocity
          s[side + 'RampSlope'] = 0; s[side + 'RampRise'] = 0
        }
        else {
          velocity += acceleration * dt
          position += velocity * dt
          if (position < target - compression()) {
            position = target - compression()
            velocity = Math.max(velocity, Math.min(surfaceVelocity, c.maxTerrainLaunchSpeed))
          }
          // Releasing boost/brake on flat ground must not launch the bike from
          // suspension rebound. Terrain departure, above, is the takeoff source.
          if ((!terrainReceding || s[side + 'LandingLoad'] >= 0.05) && position > target + extension) {
            position = target + extension; velocity = Math.min(velocity, surfaceVelocity)
          }
        }
      }
      if (!grounded) {
        velocity -= c.gravity * c.airGravityScale * dt
        position += velocity * dt
        if (position <= target + extension && velocity < terrainVelocity) {
          land()
        }
      }
    }
    s[positionKey] = position; s[velocityKey] = velocity; s[side + 'Grounded'] = grounded
    s[side + 'Impact'] = impact
    s[side + 'AirGap'] = grounded ? 0 : Math.max(0, position - target - extension)
  }
  s.airborne = !s.frontGrounded && !s.rearGrounded
  if (s.airborne) {
    // A single heavy chassis cannot let its two supports rotate independently
    // forever in flight. Dampen pitch while preserving its centre-of-mass fall.
    const centre = (s.frontSpring + s.rearSpring) / 2, vertical = (s.frontVelocity + s.rearVelocity) / 2
    const limit = Math.tan(c.airPitchLimit) * m.wheelbase, delta = s.frontSpring - s.rearSpring
    const bounded = clamp(delta, -limit, limit)
    let differenceVelocity = (s.frontVelocity - s.rearVelocity) * Math.exp(-dt * c.airPitchDamping)
    if (delta !== bounded && Math.sign(differenceVelocity) === Math.sign(delta)) differenceVelocity = 0
    s.frontSpring = centre + bounded / 2; s.rearSpring = centre - bounded / 2
    s.frontVelocity = vertical + differenceVelocity / 2; s.rearVelocity = vertical - differenceVelocity / 2
    s.frontAirGap = Math.max(0, s.frontSpring - s.frontTarget - c.forkExtension * 0.872)
    s.rearAirGap = Math.max(0, s.rearSpring - s.rearTarget - c.rearExtension)
  }
  s.airTime = s.airborne ? s.airTime + dt : 0
  s.height = (s.frontSpring + s.rearSpring) / 2
  s.verticalVelocity = (s.frontVelocity + s.rearVelocity) / 2
  s.pitch = -Math.atan2(s.frontSpring - s.rearSpring, m.wheelbase)
  s.landingImpact = Math.max(landingSpeed, (s.landingImpact || 0) * Math.exp(-dt * 9))
  s.frontTerrainGrounded = s.frontGrounded
  s.frontWheelieLifted = s.wheelieAngle > 0.005 && s.rearGrounded
  if (s.frontWheelieLifted) {
    s.frontGrounded = false
    s.frontAirGap = Math.max(0, Math.sin(s.wheelieAngle) * m.wheelbase)
  }
}
