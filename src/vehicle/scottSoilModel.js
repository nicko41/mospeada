import { wheelActivity } from './weatheringModel.js'
import { equipmentSoil } from './equipmentSoilLimit.js'

export const scottSoilRegions = ['boots', 'legs', 'arms', 'torso']
export function createScottSoilLoad() { return Object.fromEntries(scottSoilRegions.flatMap(k => [[k + 'Mud', 0], [k + 'Film', 0]])) }

// Sampled at 10 Hz from the currently animated bones, in world coordinates.
// Pose and locomotion are read-only; stored dirt never depends on the pose.
export function evolveScottSoil(load, samples, wheels, state, config, rain, humidity, dt) {
  if (!config.enabled || !config.scottEnabled || dt <= 0) return
  const gains = { boots: 1.35, legs: .95, arms: .5, torso: .32 }
  for (const region of scottSoilRegions) {
    let rate = 0
    for (const side of ['front', 'rear']) {
      const wheel = wheels[side]
      if (!wheel.grounded || wheel.surface !== 'dirt') continue
      const a = wheelActivity(state, side, wheel.radius)
      let exposure = 0
      for (const sample of samples[region] || []) {
        const p = sample.position, dx = p.x - wheel.position.x, dz = p.z - wheel.position.z, dy = Math.max(0, p.y - wheel.position.y)
        const behind = -dx * wheel.forward.x - dz * wheel.forward.z
        exposure += Math.exp(-dy * .8) * (.65 + .35 * Math.max(0, Math.min(1, behind + .5))) / (1 + (dx * dx + dz * dz) * 1.3)
      }
      exposure /= Math.max(1, samples[region]?.length || 0)
      rate += a.moving * (.013 + Math.min(40, a.speed) * .001) * (1 + a.slip * .55 + a.force * .35) * exposure * gains[region] * config.scottBuildup
    }
    const wet = Math.max(0, Math.min(1, humidity)), water = Math.max(0, Math.min(1, rain))
    load[region + 'Mud'] = equipmentSoil(load[region + 'Mud'] * Math.exp(-water * config.cleaning * .0014 * dt) + rate * wet * .65 * dt, config.maximum)
    load[region + 'Film'] = equipmentSoil(load[region + 'Film'] * Math.exp(-water * config.cleaning * .017 * dt) + rate * (1 - wet * .3) * dt, config.maximum)
  }
}
