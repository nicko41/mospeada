import { bikeSoil } from './equipmentSoilLimit.js'
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Visual state only. Neither wheel contacts nor any vehicle state are written.
export function createSoilLoad() { return { frontMud: 0, rearMud: 0, frontFilm: 0, rearFilm: 0 } }

export function wheelActivity(state, side, radius) {
  const speed = Math.abs(state.speed || 0)
  const rotation = Math.abs(state[side + 'AngularSpeed'] || 0) * radius
  const slip = Math.min(2, Math.abs(state.slip || 0) * 1.5 + (side === 'rear' ? Math.abs(state.rearLateralVelocity || 0) / 12 : Math.abs(state.steer || 0)))
  const force = Math.min(1.5, Math.abs(state.acceleration || 0) / 18 + (state.brakeBlend || 0) * .6 + (state.handbrake || 0) * .8)
  return { speed, moving: clamp((speed - .2) / 2, 0, 1), slip, force, pumping: Math.min(45, Math.max(rotation, speed * .45)) }
}

export function evolveSoil(load, wheels, state, config, rain, dt, metrics, humidity = rain) {
  if (!config.enabled || !config.accumulation || dt <= 0) return
  for (const side of ['front', 'rear']) {
    const activity = wheelActivity(state, side, metrics[side + 'Radius'])
    const dirtyContact = wheels[side].grounded && wheels[side].surface === 'dirt'
    const wet = clamp(humidity, 0, 1), water = clamp(rain, 0, 1)
    const rate = dirtyContact ? activity.moving * (.012 + Math.min(activity.speed, 40) * .0011) * (1 + activity.slip * .55 + activity.force * .35) * config.buildup : 0
    // Surface film washes away over minutes; adhered mud takes much longer.
    load[side + 'Film'] *= Math.exp(-water * config.cleaning * .017 * dt)
    load[side + 'Mud'] *= Math.exp(-water * config.cleaning * .0014 * dt)
    load[side + 'Film'] = bikeSoil(load[side + 'Film'] + rate * (1 - .3 * wet) * dt, config.maximum)
    load[side + 'Mud'] = bikeSoil(load[side + 'Mud'] + rate * wet * .55 * dt, config.maximum)
  }
}

