import { useEffect, useRef } from 'react'
import {assetUrl} from '../loading/resources.js'
import { useFrame } from '@react-three/fiber'
import { lightningState } from './Lightning'
import { desktopInput } from '../player/touchInput'
import { weatherState } from './weatherState.js'

const RAIN_VOLUME = 0.18
const THUNDER_VOLUME = 0.55

export default function AmbienceAudio() {
  const audio = useRef(null)

  useEffect(() => {
    const createSound = (name, volume, loop = false) => {
      const sound = new Audio(assetUrl(`/sounds/ambience/${name}.mp3`))
      sound.preload = 'metadata'
      sound.volume = volume
      sound.loop = loop
      sound.load()
      return sound
    }
    const rain = createSound('ambience-rain', RAIN_VOLUME, true)
    const thunders = ['trueno01', 'trueno02'].map(name => createSound(name, THUNDER_VOLUME))
    const sounds = [rain, ...thunders]
    const play = sound => sound.play().catch(error => {
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
        console.warn('[audio] Ambience could not play:', error)
      }
    })
    const state = { rain, thunders, play, started: false, eventId: lightningState.eventId }
    audio.current = state
    const resume = () => {
      if (!state.started || document.hidden || !document.hasFocus() || weatherState.rainIntensity <= 0) return
      if (rain.paused) play(rain)
    }
    // Start in a user gesture so the browser can authorize audio playback.
    const start = () => {
      if (!desktopInput.ready) return
      state.started = true
      resume()
    }
    const pause = () => sounds.forEach(sound => sound.pause())
    const unsubscribeWeather = weatherState.subscribe(() => {
      state.eventId = lightningState.eventId
      if (weatherState.rainIntensity <= 0) {
        pause()
        thunders.forEach(sound => { sound.currentTime = 0 })
      } else resume()
    })
    const visibilityChanged = () => { if (document.hidden) pause(); else resume() }
    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    window.addEventListener('game-ready', start)
    window.addEventListener('blur', pause)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', visibilityChanged)
    if (desktopInput.ready) start()

    return () => {
      audio.current = null
      unsubscribeWeather()
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('game-ready', start)
      window.removeEventListener('blur', pause)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', visibilityChanged)
      pause()
      sounds.forEach(sound => {
        sound.removeAttribute('src')
        sound.load()
      })
    }
  }, [])

  useFrame(() => {
    const a = audio.current
    if (!a || a.eventId === lightningState.eventId) return
    a.eventId = lightningState.eventId
    if (!a.started || document.hidden || !document.hasFocus() || weatherState.rainIntensity <= 0) return
    // One thunder per lightning event, even when that event has several flashes.
    const thunder = a.thunders[Math.floor(Math.random() * a.thunders.length)]
    thunder.currentTime = 0
    a.play(thunder)
  })

  return null
}
