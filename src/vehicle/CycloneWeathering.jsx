import { useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CycloneSoilLayer } from './CycloneSoilLayer.js'
import { WheelContacts } from './WheelContacts.js'
import { createSoilLoad, evolveSoil } from './weatheringModel.js'
import { weatheringState as store } from './weatheringState.js'
import { sampleRideHeight } from './rideSurface.js'
import { weatherState } from '../world/weatherState.js'
import { ScottSoilLayer } from './ScottSoilLayer.js'
import { createScottSoilLoad, evolveScottSoil, scottSoilRegions } from './scottSoilModel.js'
import { vfxState } from '../vfx/vfxState.js'

export default function CycloneWeathering({ rig, runtime }) {
  const effect = useMemo(() => ({ layer: new CycloneSoilLayer(rig), contacts: new WheelContacts(rig, sampleRideHeight), load: createSoilLoad(), accumulationTime: 0, publishTime: 0, cleanRequest: store.snapshot().cleanRequest, soilRequest: store.snapshot().soilRequest }), [rig])
  useLayoutEffect(() => {
    effect.layer.install(); runtime.weathering = effect
    effect.scottLayer = runtime.scottInstance ? new ScottSoilLayer(runtime.scottInstance) : null
    effect.scottLoad ||= createScottSoilLoad()
    effect.bothCleanRequest = store.snapshot().bothCleanRequest; effect.bothSoilRequest = store.snapshot().bothSoilRequest
    effect.scottLayer?.install()
    if (import.meta.env.DEV) window.__CYCLONE_WEATHERING__ = { effect, store, weather: weatherState }
    return () => { effect.layer.dispose(); effect.scottLayer?.dispose(); delete runtime.weathering; if (import.meta.env.DEV) delete window.__CYCLONE_WEATHERING__ }
  }, [effect, runtime])
  useFrame((_, delta) => {
    const state = runtime.state
    if (!state) return
    const config = store.snapshot(), dt = runtime.paused ? 0 : Math.min(delta, .25)
    const wheels = effect.contacts.update(state)
    if (config.bothCleanRequest !== effect.bothCleanRequest) { effect.bothCleanRequest = config.bothCleanRequest; Object.assign(effect.scottLoad, createScottSoilLoad()) }
    if (config.bothSoilRequest !== effect.bothSoilRequest) {
      effect.bothSoilRequest = config.bothSoilRequest
      const gains = { boots: 1, legs: .85, arms: .5, torso: .3 }
      for (const key of scottSoilRegions) { effect.scottLoad[key + 'Mud'] = config.maximum * gains[key]; effect.scottLoad[key + 'Film'] = config.maximum * gains[key] * .65 }
    }
    if (config.cleanRequest !== effect.cleanRequest) { effect.cleanRequest = config.cleanRequest; Object.assign(effect.load, createSoilLoad()) }
    if (config.soilRequest !== effect.soilRequest) {
      effect.soilRequest = config.soilRequest
      Object.assign(effect.load, { frontMud: config.maximum, rearMud: config.maximum, frontFilm: config.maximum * .7, rearFilm: config.maximum * .7 })
    }
    effect.accumulationTime += dt
    if (effect.accumulationTime >= .1) {
      const humidity = vfxState.snapshot().humidity
      evolveSoil(effect.load, wheels, state, config, weatherState.rainIntensity, effect.accumulationTime, rig.metrics, humidity)
      if (effect.scottLayer) evolveScottSoil(effect.scottLoad, effect.scottLayer.sampleBody(), wheels, state, config, weatherState.rainIntensity, humidity, effect.accumulationTime)
      effect.accumulationTime = 0
    }
    effect.layer.update(effect.load, config)
    effect.scottLayer?.update(effect.scottLoad, config)
    effect.publishTime += delta
    if (effect.publishTime > .15) {
      effect.publishTime = 0
      store.set({ front: wheels.front.surface, rear: wheels.rear.surface, frontGrounded: wheels.front.grounded, rearGrounded: wheels.rear.grounded, dirt: Math.max(...Object.values(effect.load)), scottDirt: Math.max(...Object.values(effect.scottLoad)) })
    }
  }, -.5)
  return null
}
