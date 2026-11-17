import * as THREE from 'three'

function randomSource(seed) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

export function createAgedPoleWood(horizontal = false) {
  const canvas = document.createElement('canvas')
  canvas.width = horizontal ? 1024 : 512
  canvas.height = horizontal ? 256 : 1024
  const context = canvas.getContext('2d')
  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = canvas.width
  bumpCanvas.height = canvas.height
  const bump = bumpCanvas.getContext('2d')
  const random = randomSource(horizontal ? 15421 : 7549)
  const long = horizontal ? canvas.width : canvas.height
  const short = horizontal ? canvas.height : canvas.width

  context.fillStyle = '#67645b'
  context.fillRect(0, 0, canvas.width, canvas.height)
  bump.fillStyle = '#888888'
  bump.fillRect(0, 0, canvas.width, canvas.height)

  const line = (target, cross, start, end, drift, width) => {
    target.lineWidth = width
    target.beginPath()
    if (horizontal) {
      target.moveTo(start, cross)
      target.bezierCurveTo(start + long * 0.34, cross + drift,
        start + long * 0.72, cross - drift * 0.5, end, cross + drift * 0.25)
    } else {
      target.moveTo(cross, start)
      target.bezierCurveTo(cross + drift, start + long * 0.34,
        cross - drift * 0.5, start + long * 0.72, cross + drift * 0.25, end)
    }
    target.stroke()
  }

  for (let index = 0; index < 250; index += 1) {
    const cross = random() * short
    const start = -random() * long * 0.25
    const end = long * (0.5 + random() * 0.75)
    const drift = (random() - 0.5) * 13
    const width = 0.4 + random() * 2.1
    context.strokeStyle = random() < 0.58
      ? `rgba(23, 27, 25, ${0.025 + random() * 0.1})`
      : `rgba(185, 180, 159, ${0.025 + random() * 0.09})`
    bump.strokeStyle = random() < 0.5 ? '#626262' : '#aaaaaa'
    line(context, cross, start, end, drift, width)
    line(bump, cross, start, end, drift, width)
  }

  for (let index = 0; index < 42; index += 1) {
    const cross = random() * short
    const start = -random() * long * 0.12
    const end = long * (0.55 + random() * 0.58)
    const drift = (random() - 0.5) * 18
    const width = 3 + random() * 6
    context.strokeStyle = random() < 0.72
      ? `rgba(27, 31, 28, ${0.11 + random() * 0.16})`
      : `rgba(169, 162, 140, ${0.09 + random() * 0.11})`
    bump.strokeStyle = '#666666'
    line(context, cross, start, end, drift, width)
    line(bump, cross, start, end, drift, width * 0.7)
  }

  for (let index = 0; index < 26; index += 1) {
    const cross = random() * short
    const start = random() * long * 0.72
    const end = Math.min(long, start + 30 + random() * long * 0.19)
    const drift = (random() - 0.5) * 7
    context.strokeStyle = `rgba(18, 20, 18, ${0.3 + random() * 0.25})`
    bump.strokeStyle = '#393939'
    line(context, cross, start, end, drift, 1.4 + random() * 2.5)
    line(bump, cross, start, end, drift, 2.2)
  }

  for (let index = 0; index < 30; index += 1) {
    const cross = random() * short
    const start = random() * long * 0.85
    const length = 14 + random() * 105
    context.strokeStyle = `rgba(32, 39, 36, ${0.025 + random() * 0.11})`
    line(context, cross, start, Math.min(long, start + length), 2, 1 + random() * 5)
  }

  if (!horizontal) {
    const damp = context.createLinearGradient(0, 0, 0, long)
    damp.addColorStop(0, 'rgba(24, 28, 25, 0.01)')
    damp.addColorStop(0.7, 'rgba(24, 28, 25, 0.04)')
    damp.addColorStop(1, 'rgba(20, 26, 23, 0.48)')
    context.fillStyle = damp
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const bumpMap = new THREE.CanvasTexture(bumpCanvas)
  bumpMap.anisotropy = 4
  return { map, bumpMap }
}
