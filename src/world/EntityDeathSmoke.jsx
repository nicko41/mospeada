import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ENTITY_STATE, SMOKE_COUNT, SMOKE_DURATION } from '../player/meleeConfig'

// Metres in the scene, independent of the FBX/aura bounds and terrain.
const CLOUD_RADIUS = 0.16
const CLOUD_DRIFT = 0.12
const CLOUD_RISE = 0.45
const PUFF_GROWTH = 0.25

export default function EntityDeathSmoke({ combat, mode = 'death', effect = null }) {
  const smoke = useMemo(() => {
    // One small alpha texture per death, shared by every puff. Irregular lobes
    // and soft noise break up the circular silhouette without a custom shader.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    const pixels = ctx.createImageData(64, 64)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5
        const angle = Math.atan2(v, u)
        const edge = 0.76 + 0.1 * Math.sin(angle * 3 + 0.7) + 0.07 * Math.cos(angle * 5)
        const density = 0.86 + 0.08 * Math.sin(u * 13 + Math.sin(v * 7))
          + 0.06 * Math.cos(v * 17 - u * 6)
        const alpha = (1 - THREE.MathUtils.smoothstep(Math.hypot(u, v), edge * 0.65, edge)) * density
        const index = (y * 64 + x) * 4
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255
        pixels.data[index + 3] = Math.round(255 * alpha)
      }
    }
    ctx.putImageData(pixels, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    const group = new THREE.Group()
    group.visible = false
    const heights = [0.45, 0.6, 0.78, 0.9, 1, 1.08, 1.15, 1.22, 1.32, 1.42, 1.55, 1.65]
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture, color: i % 3 === 0 ? '#111111' : '#000000',
        transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        fog: false, toneMapped: false, rotation: i * 1.73,
      })
      const sprite = new THREE.Sprite(material)
      sprite.userData = { angle: i * 2.39996, size: 0.45 + (i % 4) * 0.05,
        height: heights[i % heights.length], start: new THREE.Vector3() }
      group.add(sprite)
    }
    return { group, texture, initialized: false, serial: -1 }
  }, [])
  useEffect(() => () => {
    smoke.group.children.forEach(sprite => sprite.material.dispose())
    smoke.texture.dispose()
  }, [smoke])
  useFrame(() => {
    const teleport = mode === 'teleport'
    if (teleport && smoke.serial !== effect.serial) {
      smoke.serial = effect.serial; smoke.initialized = false
    }
    const duration = teleport ? effect.duration : SMOKE_DURATION
    const origin = teleport ? effect.position : combat.smokePosition
    let elapsed = teleport ? effect.elapsed : combat.elapsed - (smoke.initialized ? combat.smokeStartedAt : combat.smokeStart)
    smoke.group.visible = (teleport ? effect.active : combat.state === ENTITY_STATE.DEAD)
      && elapsed >= 0 && elapsed < duration
    if (!smoke.group.visible) return
    if (!smoke.initialized) {
      // Fixed human-sized volume at this entity's death position. Never derive
      // emission bounds from the skinned aura shells, ground or road geometry.
      smoke.group.position.copy(origin)
      smoke.group.parent?.worldToLocal(smoke.group.position)
      smoke.group.updateWorldMatrix(true, false)
      for (const sprite of smoke.group.children) {
        const { angle, height, start } = sprite.userData
        start.copy(origin)
        start.x += Math.cos(angle) * CLOUD_RADIUS
        start.y += height
        start.z += Math.sin(angle) * CLOUD_RADIUS
        smoke.group.worldToLocal(start)
      }
      smoke.initialized = true
      if (!teleport) {
        combat.smokeReady = true
        combat.smokeStartedAt = combat.elapsed
        elapsed = 0
      }
    }
    const t = elapsed / duration
    for (const sprite of smoke.group.children) {
      const { angle, size, start } = sprite.userData
      sprite.position.copy(start)
      sprite.position.x += Math.cos(angle) * t * CLOUD_DRIFT
      sprite.position.z += Math.sin(angle) * t * CLOUD_DRIFT
      sprite.position.y += t * CLOUD_RISE
      sprite.scale.setScalar(size + THREE.MathUtils.smoothstep(t, 0, 0.6) * PUFF_GROWTH)
      sprite.material.opacity = 0.92 * THREE.MathUtils.smoothstep(t, 0, 0.07)
        * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1))
    }
  })
  return <primitive object={smoke.group} dispose={null} />
}
