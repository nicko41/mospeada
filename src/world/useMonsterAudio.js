import { isGameInputActive } from '../player/touchInput'
import {assetUrl} from '../loading/resources.js'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ENTITY_STATE as S, ENTITY_ATTACK_RANGE } from '../player/meleeConfig'
import { playerCombat } from '../player/playerCombat'
import { playerActionState } from '../player/FirstPersonRig'

const AUDIBLE_DISTANCE = 35
const ATTACK_VOICE_DISTANCE = 5
const randomPause = () => 4 + Math.random() * 7

export default function useMonsterAudio(combat, root, camera, teleportSmoke) {
  const audio = useRef(null)
  useEffect(() => {
    const createSound = (name, loop = false) => {
      const sound = new Audio(assetUrl(`/sounds/monsters/${name}.mp3`))
      sound.preload = 'auto'
      sound.loop = loop
      sound.load()
      return sound
    }
    const growls = [1, 2, 3].map(index => createSound(`monsters-growl0${index}`))
    const attack = createSound('monsters-attack1')
    const bite = createSound('monsters-bite01', true)
    const hits = ['monster-hit', 'monster-hit02', 'monster-hit03', 'monster-hit04'].map(name => createSound(name))
    const teleport = createSound('teleport01')
    const die = createSound('monster-die')
    const voices = [...growls, attack, bite]
    const sounds = [...voices, ...hits, teleport, die]
    const stopSound = sound => {
      sound.pause()
      if (sound.currentTime !== 0) sound.currentTime = 0
    }
    const stop = () => sounds.forEach(stopSound)
    const play = sound => {
      sound.currentTime = 0
      sound.play().catch(error => {
        if (error.name !== 'AbortError') console.warn('[audio] Monster sound could not play:', error)
      })
    }
    audio.current = { growls, attack, bite, hits, teleport, die, voices, stop, stopSound, play,
      hitVersion: combat.hitVersion, teleportSerial: teleportSmoke.serial, deathPlayed: false,
      growlWait: Math.random() * 8, attackWait: 0, biting: false }
    const lockChanged = () => { if (!isGameInputActive()) stop() }
    window.addEventListener('blur', stop)
    document.addEventListener('pointerlockchange', lockChanged)
    return () => {
      audio.current = null
      window.removeEventListener('blur', stop)
      document.removeEventListener('pointerlockchange', lockChanged)
      const release = sound => {
        sound.pause()
        sound.removeAttribute('src')
        sound.load()
      }
      sounds.filter(sound => sound !== die).forEach(release)
      // The body/cloud can disappear before the death recording finishes.
      if (!die.paused && !die.ended) {
        const finish = () => {
          clearTimeout(timeout)
          die.removeEventListener('ended', finish)
          die.removeEventListener('error', finish)
          window.removeEventListener('blur', finish)
          document.removeEventListener('pointerlockchange', finish)
          release(die)
        }
        const timeout = setTimeout(finish, 15000)
        die.addEventListener('ended', finish)
        die.addEventListener('error', finish)
        window.addEventListener('blur', finish)
        document.addEventListener('pointerlockchange', finish)
      } else release(die)
    }
  }, [])

  useFrame((_, delta) => {
    const a = audio.current
    if (!a || !root.current) return
    const distance = root.current.position.distanceTo(camera.position)
    const enabled = !playerCombat.dead && !playerActionState.locked && isGameInputActive()
      && document.hasFocus() && distance < AUDIBLE_DISTANCE
    if (!enabled) {
      a.stop()
      a.biting = false
      a.hitVersion = combat.hitVersion
      a.teleportSerial = teleportSmoke.serial
      if (combat.smokeReady) a.deathPlayed = true
      return
    }
    // Smooth attenuation, quiet at a distance and strongest beside the player.
    const gain = (1 - distance / AUDIBLE_DISTANCE) ** 2 / (1 + distance / 6)
    a.hits.forEach(sound => { sound.volume = 0.7 * gain })
    a.teleport.volume = 0.7 * gain
    a.die.volume = 0.8 * gain
    if (combat.hitVersion !== a.hitVersion) {
      a.hitVersion = combat.hitVersion
      a.play(a.hits[Math.floor(Math.random() * a.hits.length)])
    }
    if (teleportSmoke.serial !== a.teleportSerial) {
      a.teleportSerial = teleportSmoke.serial
      a.play(a.teleport)
    }
    if (combat.state === S.DEAD && combat.smokeReady && !a.deathPlayed) {
      a.deathPlayed = true
      a.play(a.die)
    }
    // Let the final hit finish while the dead enemy's other voices stop.
    if (combat.health <= 0 || combat.state === S.DEAD || !root.current.visible
      || combat.state === S.TELEPORT_OUT || combat.state === S.TELEPORT_IN) {
      a.voices.forEach(a.stopSound)
      a.biting = false
      return
    }
    a.growls.forEach(sound => { sound.volume = 0.3 * gain })
    a.attack.volume = 0.65 * gain
    a.bite.volume = 0.7 * gain
    const dt = Math.min(delta, 0.05)
    a.growlWait -= dt
    a.attackWait = Math.max(0, a.attackWait - dt)
    if ((combat.state === S.IDLE || combat.state === S.CHASE) && a.growlWait <= 0) {
      a.play(a.growls[Math.floor(Math.random() * a.growls.length)])
      a.growlWait = randomPause()
    }
    if ((combat.state === S.CHASE || combat.state === S.ATTACK)
      && distance <= ATTACK_VOICE_DISTANCE && a.attackWait === 0) {
      a.play(a.attack)
      a.attackWait = 6 + Math.random() * 3
    }
    const horizontalDistance = Math.hypot(root.current.position.x - camera.position.x,
      root.current.position.z - camera.position.z)
    const height = camera.position.y - root.current.position.y
    if (horizontalDistance > ENTITY_ATTACK_RANGE || height <= 0 || height >= 2.2) combat.biting = false
    const biting = combat.state === S.ATTACK && combat.biting
    if (biting && !a.biting) a.play(a.bite)
    if (!biting && a.biting) a.stopSound(a.bite)
    a.biting = biting
    if (combat.state === S.STAGGER || combat.state === S.LIGHT_STUN) {
      a.growls.forEach(a.stopSound)
      a.stopSound(a.attack)
    }
  })
}
