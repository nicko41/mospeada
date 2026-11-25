import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { animeState } from '../../rendering/animeState.js'
import { FOREST } from './forestConfig.js'
import {forestOpeningState} from './forestOpeningState.js'

// Integrated GPUs can be fill-rate limited by the existing hero + Anime MRT.
// Adjust only pixel density after shader preparation; preserve camera framing,
// terrain contacts, instance density and the character's full shadow map.
export default function ForestPerformance() {
  const { setDpr, viewport } = useThree()
  const samples = useRef({ seconds: 0, frames: 0 })
  useFrame((_, delta) => {
    const config = FOREST.performance, stats = samples.current, render = animeState.snapshot()
    // Reallocating the full Anime MRT/MSAA buffers visibly stalls a moving
    // shot. Keep its resolution stable; resume normal adaptation afterward.
    if(forestOpeningState.snapshot().phase==='playing'){stats.seconds=0;stats.frames=0;return}
    if (!config.adaptiveResolution || !render.ready || !render.openingReady || delta > .2) return
    stats.seconds += delta; stats.frames++
    if (stats.seconds < 3) return
    const average = stats.seconds * 1000 / stats.frames, native = Math.min(globalThis.devicePixelRatio || 1, 1.5)
    const current = viewport.dpr
    if (average > config.targetFrameMs * 1.12 && current > config.minPixelRatio + .01) {
      setDpr(Math.max(config.minPixelRatio, Math.round(current * .87 * 100) / 100))
    } else if (average < config.targetFrameMs * .65 && current < native) {
      setDpr(Math.min(native, Math.round((current + .05) * 100) / 100))
    }
    stats.seconds = 0; stats.frames = 0
  })
  return null
}
