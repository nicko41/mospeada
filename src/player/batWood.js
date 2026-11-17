import * as THREE from 'three'

const WOOD_DESATURATION = 0.3

export function createBatWood() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  let seed = 417
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  ctx.fillStyle = '#907658'
  ctx.fillRect(0, 0, 128, 512)
  for (let i = 0; i < 210; i++) {
    const x = random() * 128, y = random() * 512
    const length = 30 + random() * 400
    const drift = (random() - 0.5) * 7
    ctx.strokeStyle = i % 3 ? 'rgba(42,27,16,0.28)' : 'rgba(208,181,139,0.3)'
    ctx.lineWidth = 0.3 + random() * 1.6
    // Wrap strokes across the cylindrical seam.
    for (const shift of [-128, 0, 128]) {
      ctx.beginPath()
      ctx.moveTo(x + shift, y)
      ctx.bezierCurveTo(x + shift + drift, y + length * 0.3,
        x + shift - drift, y + length * 0.7, x + shift, y + length)
      ctx.stroke()
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(32,22,13,0.15)' : 'rgba(212,185,143,0.15)'
    ctx.fillRect(random() * 128, random() * 512, 0.5 + random(), 1 + random() * 4)
  }
  // Bake the muted colour once, with no shader or per-frame processing.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722
    for (let channel = 0; channel < 3; channel++) {
      pixels.data[i + channel] += (gray - pixels.data[i + channel]) * WOOD_DESATURATION
    }
  }
  ctx.putImageData(pixels, 0, 0)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.anisotropy = 2
  return map
}

// The GLB has no UVs. Add cylindrical UVs to an owned copy, without editing the asset.
export function batWoodGeometry(source) {
  const geometry = source.index ? source.toNonIndexed() : source.clone()
  const positions = geometry.attributes.position
  const uv = new Float32Array(positions.count * 2)
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = Math.atan2(positions.getZ(i), positions.getX(i)) / (Math.PI * 2) + 0.5
    uv[i * 2 + 1] = (positions.getY(i) - 0.041741) / 14.832463
  }
  for (let i = 0; i < positions.count; i += 3) {
    const a = uv[i * 2], b = uv[(i + 1) * 2], c = uv[(i + 2) * 2]
    if (Math.max(a, b, c) - Math.min(a, b, c) > 0.5) {
      for (let j = i; j < i + 3; j++) if (uv[j * 2] < 0.5) uv[j * 2] += 1
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}
