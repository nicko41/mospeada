import { DataTexture, LinearFilter } from 'three'
const fract = n => n - Math.floor(n)
const hash = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 73.4) * 43758.5453)
const smooth = x => x * x * (3 - 2 * x)
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy)
  return (hash(ix, iy, seed) * (1 - fx) + hash(ix + 1, iy, seed) * fx) * (1 - fy) + (hash(ix, iy + 1, seed) * (1 - fx) + hash(ix + 1, iy + 1, seed) * fx) * fy
}
export function createSmokeAtlas(tileSize = 128) {
  const side = tileSize * 2, data = new Uint8Array(side * side * 4)
  for (let tile = 0; tile < 4; tile++) for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
    const u = x / (tileSize - 1), v = y / (tileSize - 1), seed = 53 + tile * 17
    const wx = (u - .5) * 2 + (noise(u * 5, v * 5, seed) - .5) * .35
    const wy = (v - .5) * 2 + (noise(u * 5, v * 5, seed + 9) - .5) * .35
    let density = 0
    for (let k = 0; k < 6; k++) {
      const cx = (hash(k, 2, seed) - .5) * .9, cy = (hash(k, 3, seed) - .5) * .7
      const rx = .2 + hash(k, 5, seed) * .35, ry = .18 + hash(k, 7, seed) * .32
      density += Math.exp(-2 * (((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2))
    }
    const detail = .65 * noise(u * 9, v * 9, seed + 4) + .35 * noise(u * 21, v * 21, seed + 1)
    const edge = Math.min(1, Math.min(u, v, 1 - u, 1 - v) / .12)
    const alpha = Math.min(.72, density * .48) * (.4 + detail * .6) * smooth(edge)
    const i = ((y + Math.floor(tile / 2) * tileSize) * side + x + tile % 2 * tileSize) * 4
    data[i] = data[i + 1] = data[i + 2] = Math.round(235 + detail * 20); data[i + 3] = Math.round(alpha * 255)
  }
  const texture = new DataTexture(data, side, side)
  texture.name = 'Quarks wispy engine smoke atlas'; texture.minFilter = texture.magFilter = LinearFilter
  texture.generateMipmaps = false; texture.needsUpdate = true
  return texture
}
