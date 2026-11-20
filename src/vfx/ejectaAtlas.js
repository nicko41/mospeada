import { DataTexture, LinearFilter } from 'three'

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export function createEjectaAtlas(water = false, tileSize = 64) {
  const width = tileSize * 2, data = new Uint8Array(width * width * 4)
  for (let tile = 0; tile < 4; tile++) for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
    const u = x / (tileSize - 1) * 2 - 1, v = y / (tileSize - 1) * 2 - 1, angle = Math.atan2(v, u)
    let alpha
    if (water) {
      // Several tapered filaments per sprite, with fully transparent padding.
      const taper = Math.max(0, 1 - Math.abs(u) ** 1.7)
      const curve = .08 * Math.sin(u * 5 + tile)
      const a = Math.exp(-(((v - curve) / (.045 + .08 * taper)) ** 2))
      const b = Math.exp(-(((v + .29 + u * .12) / .045) ** 2)) * .32
      alpha = (a + b) * taper * .82
    } else {
      const radius = Math.hypot(u * (tile % 2 ? 1.15 : .85), v)
      const edge = .55 + .09 * Math.sin(angle * (3 + tile) + tile) + .07 * Math.cos(angle * 7 + tile * 3)
      alpha = 1 - smooth(edge - .09, edge + .035, radius)
    }
    const i = ((y + Math.floor(tile / 2) * tileSize) * width + x + tile % 2 * tileSize) * 4
    const shade = water ? 255 : Math.round(205 + 35 * Math.sin(u * 7 + v * 4 + tile))
    data[i] = data[i + 1] = data[i + 2] = shade
    data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
  }
  const texture = new DataTexture(data, width, width)
  texture.name = water ? 'Quarks fine water filaments' : 'Quarks irregular earth and wet clods'
  texture.magFilter = texture.minFilter = LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true
  return texture
}
