import { useEffect } from 'react'
import {assetUrl} from '../loading/resources.js'
import { subscribeBatSwing } from './batAttackState'

const SWOOSH_URLS = [
  'sounds/bat/bat-swoosh01.mp3',
  'sounds/bat/bat-swoosh02.mp3',
  'sounds/bat/bat-swoosh03.mp3',
]

export default function useBatSwingAudio() {
  useEffect(() => {
    const sounds = SWOOSH_URLS.map(path => {
      const sound = new Audio(assetUrl('/'+path))
      sound.preload = 'auto'
      sound.volume = 0.5
      sound.load()
      return sound
    })
    const unsubscribe = subscribeBatSwing(() => {
      const sound = sounds[Math.floor(Math.random() * sounds.length)]
      sound.currentTime = 0
      sound.play().catch(error => {
        if (error.name !== 'AbortError') console.warn('[audio] Bat swoosh could not play:', error)
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
