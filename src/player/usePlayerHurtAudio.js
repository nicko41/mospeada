import { useEffect, useRef } from 'react'
import {assetUrl} from '../loading/resources.js'
import { playerCombat, subscribePlayerHealth } from './playerCombat'

const HURT_URLS = ['hurt01.mp3', 'hurt02.mp3', 'hurt03.mp3']

export default function usePlayerHurtAudio() {
  const deathAudioFinished = useRef(true)
  useEffect(() => {
    const createSound = name => {
      const sound = new Audio(assetUrl(`/sounds/character/${name}`))
      sound.preload = 'auto'
      sound.volume = 0.7
      sound.load()
      return sound
    }
    const sounds = HURT_URLS.map(createSound)
    const deathSound = createSound('done.mp3')
    const finishDeathAudio = () => { deathAudioFinished.current = true }
    deathSound.addEventListener('ended', finishDeathAudio)
    deathSound.addEventListener('error', finishDeathAudio)
    let deathPlayed = playerCombat.dead
    let hitVersion = playerCombat.hitVersion
    let health = playerCombat.playerHealth
    let lastIndex = -1
    const stop = () => sounds.forEach(sound => {
      sound.pause()
      sound.currentTime = 0
    })
    const stopAll = () => {
      stop()
      deathSound.pause()
      finishDeathAudio()
    }
    const unsubscribe = subscribePlayerHealth(() => {
      const hurt = playerCombat.hitVersion !== hitVersion && playerCombat.playerHealth < health
      hitVersion = playerCombat.hitVersion
      health = playerCombat.playerHealth
      if (!hurt) return
      stop()
      if (playerCombat.dead) {
        if (deathPlayed) return
        deathPlayed = true
        deathAudioFinished.current = false
        deathSound.play().catch(error => {
          finishDeathAudio()
          if (error.name !== 'AbortError') console.warn('[audio] Player death could not play:', error)
        })
        return
      }
      // Random choice without immediately repeating the previous voice.
      let index = Math.floor(Math.random() * (lastIndex < 0 ? sounds.length : sounds.length - 1))
      if (lastIndex >= 0 && index >= lastIndex) index += 1
      lastIndex = index
      sounds[index].play().catch(error => {
        if (error.name !== 'AbortError') console.warn('[audio] Player hurt could not play:', error)
      })
    })
    window.addEventListener('blur', stopAll)
    return () => {
      unsubscribe()
      window.removeEventListener('blur', stopAll)
      deathSound.removeEventListener('ended', finishDeathAudio)
      deathSound.removeEventListener('error', finishDeathAudio)
      finishDeathAudio()
      sounds.concat(deathSound).forEach(sound => {
        sound.pause()
        sound.removeAttribute('src')
        sound.load()
      })
    }
  }, [])
  return deathAudioFinished
}
