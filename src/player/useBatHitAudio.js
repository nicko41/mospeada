import { useEffect } from 'react'
import {assetUrl} from '../loading/resources.js'
import { subscribeBatImpact } from './batAttackState'

const HIT_URLS = [
  'sounds/bat/bat-hit01.mp3',
  'sounds/bat/bat-hit02.mp3',
  'sounds/bat/bat-hit03.mp3',
  'sounds/bat/bat-hit04.mp3',
  'sounds/bat/bat-hit05.mp3',
  'sounds/bat/bat-hit06.mp3',
]

export default function useBatHitAudio() {
  useEffect(() => {
    const sounds = HIT_URLS.map(path => {
      const sound = new Audio(assetUrl('/'+path))
      sound.preload = 'auto'
      sound.load()
      return sound
    })
    const unsubscribe = subscribeBatImpact(() => {
      const sound = sounds[Math.floor(Math.random() * sounds.length)]
      sound.currentTime = 0
      sound.play().catch(error => {
        if (error.name !== 'AbortError') console.warn('[audio] Bat hit could not play:', error)
      })
    })

    return () => {
      unsubscribe()
      sounds.forEach(sound => {
        sound.pause()
        sound.removeAttribute('src')
        sound.load()
      })
    }
  }, [])
}
