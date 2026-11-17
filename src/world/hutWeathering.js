import * as THREE from 'three'

function randomSource(seed) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

const palettes = {
  concrete: { base: '#73736e', dirt: '#262923', rust: '#665743' },
  metal: { base: '#515b58', dirt: '#222a29', rust: '#75513b' },
  panel: { base: '#777c73', dirt: '#303b35', rust: '#76634d' },
  roof: { base: '#6c7472', dirt: '#343d3a', rust: '#685645' },
  glass: { base: '#d2d5d0', dirt: '#59605b', rust: '#90968e' },
}

export function createWeatheredTexture(kind, variant = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  const random = randomSource(7919 + kind.length * 131 + variant * 1789)
  const palette = palettes[kind]
  context.fillStyle = palette.base
  context.fillRect(0, 0, 256, 256)

  const damp = context.createLinearGradient(0, 30, 0, 256)
  damp.addColorStop(0, 'rgba(30, 35, 31, 0.02)')
  damp.addColorStop(0.58, 'rgba(30, 35, 31, 0.09)')
  damp.addColorStop(1, kind === 'panel'
    ? 'rgba(24, 29, 25, 0.62)' : 'rgba(24, 29, 25, 0.35)')
  context.fillStyle = damp
  context.fillRect(0, 0, 256, 256)

  for (let index = 0; index < 470; index += 1) {
    const x = random() * 256
    const y = random() * 256
    const radius = 0.5 + random() * (kind === 'concrete' ? 5 : 3)
    context.globalAlpha = 0.025 + random() * (kind === 'glass' ? 0.11 : 0.16)
    context.fillStyle = random() < (kind === 'metal' ? 0.32 : 0.12)
      ? palette.rust : palette.dirt
    context.beginPath()
    context.ellipse(x, y, radius * (0.5 + random()), radius, random(), 0, Math.PI * 2)
    context.fill()
  }

  if (kind === 'panel' || kind === 'roof' || kind === 'concrete') {
    for (let index = 0; index < 20; index += 1) {
      const x = random() * 256
      const y = kind === 'panel' ? 100 + random() * 156 : random() * 256
      const radius = 8 + random() * 27
      const stain = context.createRadialGradient(x, y, 1, x, y, radius)
      stain.addColorStop(0, 'rgba(28, 37, 31, 0.28)')
      stain.addColorStop(0.65, 'rgba(35, 43, 36, 0.12)')
      stain.addColorStop(1, 'rgba(35, 43, 36, 0)')
      context.globalAlpha = 1
      context.fillStyle = stain
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  }

  if (kind === 'metal') {
    for (let index = 0; index < 34; index += 1) {
      const x = random() < 0.65 ? (random() < 0.5 ? random() * 30 : 226 + random() * 30) : random() * 256
      const y = random() * 256
      const width = 4 + random() * 19
      const height = 8 + random() * 39
      context.globalAlpha = 0.2 + random() * 0.27
      context.fillStyle = palette.rust
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + width, y + random() * 6)
      context.lineTo(x + width * 0.7, y + height)
      context.lineTo(x - width * 0.3, y + height * 0.72)
      context.closePath()
      context.fill()
    }
  }

  for (let index = 0; index < (kind === 'panel' ? 50 : 30); index += 1) {
    const x = random() * 256
    const y = random() < 0.65 ? random() * 40 : random() * 256
    context.globalAlpha = 0.09 + random() * 0.2
    context.strokeStyle = random() < 0.22 ? palette.rust : palette.dirt
    context.lineWidth = 0.8 + random() * 4
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (random() - 0.5) * 6, Math.min(256, y + 18 + random() * 95))
    context.stroke()
  }

  context.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createInteriorGrimeTexture(kind) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')
  const random = randomSource(kind === 'floor' ? 31671 : 92831)
  context.fillStyle = kind === 'floor' ? '#30332d' : '#383a33'
  context.fillRect(0, 0, 512, 512)

  for (let index = 0; index < (kind === 'floor' ? 95 : 42); index += 1) {
    const x = random() * 512
    const y = random() * 512
    const radius = 14 + random() * (kind === 'floor' ? 100 : 54)
    const stain = context.createRadialGradient(x, y, 0, x, y, radius)
    stain.addColorStop(0, random() < 0.28 ? 'rgba(62,49,32,0.65)' : 'rgba(10,14,11,0.78)')
    stain.addColorStop(0.65, 'rgba(26,29,22,0.22)')
    stain.addColorStop(1, 'rgba(26,29,22,0)')
    context.fillStyle = stain
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  for (let index = 0; index < 2700; index += 1) {
    const x = random() * 512
    const y = random() * 512
    const size = 0.4 + random() * 3.3
    context.fillStyle = random() < 0.2 ? 'rgba(82,70,48,0.24)' : 'rgba(8,12,9,0.55)'
    context.fillRect(x, y, size, size * (0.4 + random()))
  }

  const edge = context.createRadialGradient(256, 256, 100, 256, 256, 370)
  edge.addColorStop(0, 'rgba(12,17,13,0)')
  edge.addColorStop(1, 'rgba(12,17,13,0.78)')
  context.fillStyle = edge
  context.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
