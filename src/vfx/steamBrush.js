import { BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, MeshBasicMaterial } from 'three'
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

export function createSteamBrush() {
  // Two crossed, instanced alpha ribbons retain volume from any camera. They
  // are particle geometry only; nothing is added to the Cyclone model.
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-.5,0,0, .5,0,0, .5,0,1, -.5,0,1, 0,-.5,0, 0,.5,0, 0,.5,1, 0,-.5,1], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0,0, 0,1, 1,1, 1,0, 0,0, 0,1, 1,1, 1,0], 2))
  geometry.setIndex([0,1,2, 0,2,3, 4,5,6, 4,6,7]); geometry.computeVertexNormals()
  const tw = 128, th = 64, width = tw * 2, height = th * 2, data = new Uint8Array(width * height * 4)
  for (let tile = 0; tile < 4; tile++) for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const u = x / (tw - 1), v = y / (th - 1) * 2 - 1, phase = tile * 1.73
    const center = .12 * Math.sin(u * (5 + tile) + phase) + .09 * Math.sin(u * 13 - phase) * u
    const taper = Math.sin(Math.PI * u) ** .65
    const radius = (.12 + .3 * u + .09 * Math.sin(u * 18 + phase)) * taper
    const d = Math.abs(v - center)
    const body = 1 - smooth(Math.max(0, radius - .11), radius + .12, d)
    const wisp = Math.exp(-((v - center - .26 * u) ** 2) / .012) * u * .32
    const feather = .65 + .22 * Math.sin(u * 27 + v * 8 + phase) + .1 * Math.cos(u * 41 - v * 13)
    const alpha = clamp((body * feather + wisp) * taper * .72, 0, .72) * (1 - smooth(.86, 1, Math.abs(v)))
    const i = ((y + Math.floor(tile / 2) * th) * width + x + tile % 2 * tw) * 4
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(alpha * 255)
  }
  const atlas = new DataTexture(data, width, height); atlas.name = 'MOSPEADA tapered steam strokes'
  atlas.minFilter = atlas.magFilter = LinearFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true
  const material = new MeshBasicMaterial({ name: 'Riding exhaust steam', map: atlas, side: DoubleSide, transparent: true, depthWrite: false, alphaTest: .002 })
  return { geometry, atlas, material }
}
