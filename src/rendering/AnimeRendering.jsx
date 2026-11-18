import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AnimeRenderer } from './AnimeRenderer.js'
import { animeState } from './animeState.js'
import { timeOfDayState } from '../world/TimeOfDay.jsx'
import { rideMotion } from '../vehicle/rideMotion.js'

export default function AnimeRendering() {
  const { gl, scene, camera } = useThree(), controller = useRef(null)
  useLayoutEffect(() => {
    animeState.set({ ready: false, error: '' })
    const effect = new AnimeRenderer(gl, scene, camera); controller.current = effect
    const previous = gl.debug.onShaderError
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      const message = [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].filter(Boolean).join('\n')
      console.error('MOSPEADA render shader:', message)
      effect.error = message; animeState.set({ mode: 'PBR', error: 'No se pudo compilar Anime. PBR sigue disponible.' })
      previous?.(context, program, vertex, fragment)
    }
    if (import.meta.env.DEV) window.__ANIME__ = { effect, state: animeState, renderer: gl, scene, camera }
    return () => {
      controller.current = null; effect.dispose(); gl.debug.onShaderError = previous
      if (import.meta.env.DEV) delete window.__ANIME__
    }
  }, [gl, scene, camera])
  // Positive priority takes over only the final render. All simulation, camera,
  // weather and headlamp callbacks still run first at their original priorities.
  useFrame((_, delta) => {
    const effect = controller.current
    if (!effect) return
    const config = animeState.snapshot()
    effect.brush.tick(delta, config.mode === 'ANIME', timeOfDayState.value, rideMotion.speed, rideMotion.paused)
    effect.render(config, timeOfDayState.value)
    if (effect.error && !animeState.snapshot().error) animeState.set({ mode: 'PBR', error: 'No se pudo preparar Anime. PBR sigue disponible.' })
    if (effect.ready !== animeState.snapshot().ready) animeState.set({ ready: effect.ready })
  }, 1)
  return null
}
