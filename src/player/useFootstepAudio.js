import { useEffect, useRef } from 'react'
import {assetUrl} from '../loading/resources.js'
import { HIGHWAY_LENGTH, HIGHWAY_TOP_HALF_WIDTH, HIGHWAY_Z } from '../world/sectors/highwayProfile'

const FOOTSTEP_PATHS = {
  dirt: 'sounds/character/footsteps-dirt.mp3',
  concrete: 'sounds/character/footstepos-concrete.mp3',
}
const WALK_PLAYBACK_RATE = 1.5
const RUN_PLAYBACK_RATE = WALK_PLAYBACK_RATE * (2.35 / 1.65)

export default function useFootstepAudio() {
  const audio = useRef(null)

  useEffect(() => {
    const sounds = Object.fromEntries(Object.entries(FOOTSTEP_PATHS).map(([surface, path]) => {
      const sound = new Audio(assetUrl('/'+path))
      sound.preload = 'auto'
      sound.loop = true
      sound.preservesPitch = true
      sound.load()
      return [surface, sound]
    }))
    const state = { sounds, active: null }
    audio.current = state
    const stop = () => {
      state.active?.pause()
      state.active = null
    }
    const lockChanged = () => { if (!document.pointerLockElement) stop() }
    window.addEventListener('blur', stop)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      audio.current = null
      window.removeEventListener('blur', stop)
      document.removeEventListener('pointerlockchange', lockChanged)
      stop()
      Object.values(sounds).forEach(sound => {
        sound.removeAttribute('src')
        sound.load()
      })
    }
  }, [])

  return (speed, running, position) => {
    const state = audio.current
    if (!state) return
    if (speed < 0.1 || !document.hasFocus()) {
      state.active?.pause()
      state.active = null
      return
    }
    // The highway extends indefinitely toward negative X.
    const onHighway = position.x <= HIGHWAY_LENGTH * 0.5
      && Math.abs(position.z - HIGHWAY_Z) <= HIGHWAY_TOP_HALF_WIDTH
    const sound = state.sounds[onHighway ? 'concrete' : 'dirt']
    sound.playbackRate = WALK_PLAYBACK_RATE + (RUN_PLAYBACK_RATE - WALK_PLAYBACK_RATE) * running
    if (state.active === sound) return
    state.active?.pause()
    state.active = sound
    sound.play().catch(error => {
      if (error.name !== 'AbortError') console.warn('[audio] Footsteps could not play:', error)
    })
  }
}
