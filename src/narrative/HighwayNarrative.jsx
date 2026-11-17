import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { highwaySequence as sequence, stepHighwaySequence, smooth } from './highwaySequence'
import { completeHighwayLoop } from './casetaScene'
import { highwayFogState } from '../world/sectors/highwayFogState'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { vehicleState } from '../player/vehicleState'

// Future rain/wind/road audio buses can consume these gains without changing base weather.
export const highwayAudioMix = { rain: 1, wind: 1, road: 1, tension: 0 }

export default function HighwaySequence() {
  const { camera, scene } = useThree()
  const direction = useMemo(() => new THREE.Vector3(), [])
  const veil = useRef(null)
  const audio = useRef(null)
  useEffect(() => {
    const element = document.createElement('div')
    element.setAttribute('aria-hidden', 'true')
    element.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9999'
    document.body.appendChild(element)
    veil.current = element
    const prepare = () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      if (!audio.current) {
        const context = new AudioContextClass()
        const gain = context.createGain()
        gain.gain.value = 0
        gain.connect(context.destination)
        const tone = context.createOscillator()
        tone.type = 'sine'; tone.frequency.value = 43
        tone.connect(gain); tone.start()
        audio.current = { context, gain, tone }
      }
      audio.current.context.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', prepare)
    window.addEventListener('keydown', prepare)
    window.addEventListener('game-ready', prepare)
    return () => {
      element.remove()
      window.removeEventListener('pointerdown', prepare)
      window.removeEventListener('keydown', prepare)
      window.removeEventListener('game-ready', prepare)
      if (audio.current) { audio.current.tone.stop(); audio.current.context.close(); audio.current = null }
    }
  }, [])

  useFrame((_, delta) => {
    // This on-foot sequence can relocate the FPS camera; defer it while driving.
    if (vehicleState.active) return
    camera.getWorldDirection(direction)
    stepHighwaySequence(sequence, { x: camera.position.x, z: camera.position.z, lookX: direction.x, lookZ: direction.z }, delta)
    if (sequence.resetRequested) {
      camera.position.set(-12, getWalkableHeightAt(-12, -78) + 1.7, -78)
      camera.rotation.set(-0.16, -0.24, 0, 'YXZ')
    }
    if (sequence.completed) completeHighwayLoop()
    const restored = sequence.phase === 'recover' || sequence.completed
    const end = restored ? 0 : smooth(sequence.endProgress)
    const haze = restored ? 0 : sequence.hazeProgress
    highwayFogState.darkness = haze + (1 - haze) * end
    highwayFogState.absorption = haze * 0.32 + (1 - haze * 0.32) * end
    if (scene.fog) scene.fog.density = restored ? 0.068
      : THREE.MathUtils.damp(scene.fog.density, 0.068 + haze * 0.152 + end * 1.5, 0.8, delta)
    const silent = sequence.phase === 'blackout'
    const ambient = silent ? 0 : restored ? smooth(sequence.timer / 0.2) : 1 - smooth((sequence.endProgress - 0.35) / 0.55)
    highwayAudioMix.rain = highwayAudioMix.wind = highwayAudioMix.road = sequence.completed ? 1 : ambient
    highwayAudioMix.tension = silent || restored ? 0 : smooth((sequence.endProgress - 0.55) / 0.45)
    if (audio.current) audio.current.gain.gain.setTargetAtTime(highwayAudioMix.tension * 0.022, audio.current.context.currentTime, 0.08)
    if (veil.current) veil.current.style.opacity = sequence.blackout ? '1' : String(haze * 0.2 + (0.985 - haze * 0.2) * end)
  }, -2)
  return null
}
