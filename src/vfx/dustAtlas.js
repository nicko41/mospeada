import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three'

const fract = x => x - Math.floor(x)
const hash = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 73.4) * 43758.5453)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy)
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed)
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}

// Four static, padded density sprites in one texture. Generated once, no image
// downloads, animation sheets or per-frame texture uploads.
export function createDustAtlas(tileSize = 128) {
  const side = tileSize * 2, data = new Uint8Array(side * side * 4)
  for (let tile = 0; tile < 4; tile++) for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
    const u = x / (tileSize - 1), v = y / (tileSize - 1), seed = 19 + tile * 13
    const nx = (u - .5) * 2, ny = (v - .5) * 2
    const warpX = nx + (noise(u * 4, v * 4, seed) - .5) * .4
    const warpY = ny + (noise(u * 4, v * 4, seed + 7) - .5) * .4
    // Offset, overlapping lobes plus low-frequency density break the outline.
    let lobes = 0
    for (let l = 0; l < 5; l++) {
      const cx = (hash(l, 1, seed) - .5) * .75, cy = (hash(l, 3, seed) - .5) * .65
      const rx = .28 + hash(l, 4, seed) * .34, ry = .25 + hash(l, 7, seed) * .3
      lobes += Math.exp(-((warpX - cx) ** 2 / (rx * rx) + (warpY - cy) ** 2 / (ry * ry)) * 2)
    }
    const detail = noise(u * 8, v * 8, seed) * .65 + noise(u * 17, v * 17, seed + 9) * .35
    const edge = smooth(0, .12, Math.min(u, v, 1 - u, 1 - v))
    const density = Math.min(.76, lobes * .53) * (.4 + detail * .6) * edge
    const i = ((y + Math.floor(tile / 2) * tileSize) * side + x + tile % 2 * tileSize) * 4
    data[i] = data[i + 1] = data[i + 2] = Math.round(215 + detail * 40)
    data[i + 3] = Math.round(density * 255)
  }
  const texture = new DataTexture(data, side, side, RGBAFormat, UnsignedByteType)
  texture.name = 'MOSPEADA procedural dust density atlas'
  texture.magFilter = texture.minFilter = LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true
  return texture
}
