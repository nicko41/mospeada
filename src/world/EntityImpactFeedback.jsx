import { isGameInputActive } from '../player/touchInput'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { subscribeEntityImpact } from './entityImpactState'
import { timeOfDayState } from './TimeOfDay'
import { playerActionState } from '../player/FirstPersonRig'

const BURSTS = 3
const PARTICLES = 7
const DURATION = 0.55
const FLASH_DURATION = 0.16
const NIGHT = new THREE.Color('#020303')
const DAY = new THREE.Color('#737d7d')

export default function EntityImpactFeedback() {
  const fx = useMemo(() => {
    // One texture and a fixed pool for all enemies; no lights or per-hit assets.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.16, 'rgba(255,255,255,.85)')
    gradient.addColorStop(0.48, 'rgba(255,255,255,.28)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64)
    const texture = new THREE.CanvasTexture(canvas)
    const group = new THREE.Group()
    const pool = Array.from({ length: BURSTS }, () => {
      const cloud = new THREE.Group()
      cloud.visible = false; group.add(cloud)
      const glowMaterial = new THREE.SpriteMaterial({ map: texture, color: '#b5eaff',
        transparent: true, depthWrite: false, depthTest: true, fog: true,
        blending: THREE.AdditiveBlending, toneMapped: false })
      const glow = new THREE.Sprite(glowMaterial)
      glow.renderOrder = 7
      cloud.add(glow)
      const dustMaterial = new THREE.SpriteMaterial({ map: texture,
        transparent: true, depthWrite: false, depthTest: true, fog: true, toneMapped: false })
      const dust = Array.from({ length: PARTICLES }, (_, index) => {
        const sprite = new THREE.Sprite(dustMaterial)
        sprite.renderOrder = 8
        cloud.add(sprite)
        return { sprite, velocity: new THREE.Vector3(), seed: index * 2.39996,
          size: 0.075 + (index % 3) * 0.025 }
      })
      return { cloud, glow, glowMaterial, dustMaterial, dust, age: DURATION,
        origin: new THREE.Vector3(), offset: new THREE.Vector3(), target: null }
    })
    return { group, texture, pool, next: 0, marker: null, markerAge: FLASH_DURATION }
  }, [])
  useEffect(() => {
    const marker = document.createElement('div')
    marker.className = 'entity-hit-confirm'
    marker.setAttribute('aria-hidden', 'true')
    document.body.appendChild(marker)
    fx.marker = marker
    const unsubscribe = subscribeEntityImpact((position, normal, target) => {
      fx.markerAge = 0
      marker.style.opacity = '1'
      const burst = fx.pool[fx.next]
      fx.next = (fx.next + 1) % BURSTS
      burst.age = 0; burst.target = target
      burst.origin.copy(position)
      burst.offset.copy(position).sub(target.position)
      burst.cloud.visible = true
      burst.glow.position.copy(position)
      burst.glow.scale.setScalar(0.32)
      burst.glowMaterial.opacity = 1
      burst.glow.visible = true
      for (const particle of burst.dust) {
        const angle = particle.seed
        particle.velocity.set(Math.cos(angle) * 0.55, 0.25 + Math.sin(angle * 1.3) * 0.45,
          Math.sin(angle) * 0.55).addScaledVector(normal, 0.65)
        particle.sprite.position.copy(position)
        particle.sprite.scale.setScalar(particle.size)
      }
    })
    return () => {
      unsubscribe()
      marker.remove(); fx.marker = null
      fx.texture.dispose()
      for (const burst of fx.pool) {
        burst.glowMaterial.dispose(); burst.dustMaterial.dispose()
      }
    }
  }, [fx])
  useFrame((_, delta) => {
    if (!isGameInputActive() || playerActionState.locked) return
    const dt = Math.min(delta, 0.05), day = timeOfDayState.value
    if (fx.markerAge < FLASH_DURATION) {
      fx.markerAge = Math.min(FLASH_DURATION, fx.markerAge + dt)
      if (fx.marker) fx.marker.style.opacity = String(1 - fx.markerAge / FLASH_DURATION)
    }
    for (const burst of fx.pool) {
      if (!burst.cloud.visible) continue
      burst.age += dt
      if (burst.age >= DURATION) { burst.cloud.visible = false; burst.target = null; continue }
      const progress = burst.age / DURATION
      if (burst.age < FLASH_DURATION) {
        // The flash follows the struck body; expelled dust stays in world space.
        burst.target.syncPosition()
        burst.glow.position.copy(burst.target.position).add(burst.offset)
        burst.glow.scale.setScalar(0.32 + burst.age / FLASH_DURATION * 0.24)
        burst.glowMaterial.opacity = (1 - burst.age / FLASH_DURATION) ** 2
      } else burst.glow.visible = false
      burst.dustMaterial.color.copy(NIGHT).lerp(DAY, day)
      burst.dustMaterial.opacity = THREE.MathUtils.lerp(0.85, 0.45, day) * (1 - progress) ** 1.4
      const travel = (1 - Math.exp(-burst.age * 3)) / 3
      for (const particle of burst.dust) {
        particle.sprite.position.copy(burst.origin).addScaledVector(particle.velocity, travel)
        particle.sprite.position.y += 0.12 * burst.age
        particle.sprite.scale.setScalar(particle.size * (1 + progress * 1.8))
      }
    }
  })
  return <primitive object={fx.group} dispose={null} />
}
