import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, DynamicDrawUsage, LinearFilter, Mesh, MeshBasicMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2 } from 'three'
import { wheelTrackResponse } from './wheelTrackResponse.js'

export const WHEEL_TRACK_DEFAULTS = Object.freeze({ capacity: 4096, spacing: .4, minDistance: .12, lifetime: 180, radius: 120, maxSteps: 16 })
const palette = Object.fromEntries(Object.entries({ dirt: '#998067', mud: '#6b503c', sand: '#d4ae7b', grass: '#634029' }).map(([k, v]) => [k, new Color(v)]))

// Small authored alpha atlas: a dark bed, broken raised shoulders and repeated
// chevron tread. The second half exposes dense soil under compressed grass.
export function createWheelTrackTexture() {
  const width = 128, height = 128, data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const grass = x >= 64, u = ((x % 64) + .5) / 64, v = (y + .5) / height, side = Math.abs(u * 2 - 1)
    const noise = .5 + .5 * Math.sin(y * .91 + Math.floor(x / 3) * 4.7)
    const outline = .91 + .055 * Math.sin(v * Math.PI * 18 + (u < .5 ? 1 : 3))
    const edge = Math.max(0, Math.min(1, (outline - side) / .16))
    const tread = ((v * 5 + side * .7) % 1) < .24
    const shoulder = side > .64 + .06 * Math.sin(v * Math.PI * 12) && side < outline
    const tone = shoulder ? (grass ? .72 : .83) : tread ? .43 : .6
    const alpha = edge * (shoulder ? (noise > .3 ? .3 + noise * .4 : .08) : grass ? .9 : .75)
    const i = (y * width + x) * 4
    data[i] = data[i + 1] = data[i + 2] = Math.round(tone * 255); data[i + 3] = Math.round(alpha * 255)
  }
  const texture = new DataTexture(data, width, height, RGBAFormat)
  texture.colorSpace = SRGBColorSpace; texture.wrapT = RepeatWrapping
  texture.minFilter = texture.magFilter = LinearFilter; texture.needsUpdate = true
  return texture
}

// Bounded world-space ribbon pool: both bikes' wheel histories share one draw.
// The sampler is injected so a future splat-map backend can consume the same
// wheel response and contact stream without changing the vehicle controller.
export class WheelTracks {
  constructor(sample, settings = {}) {
    this.sample = sample; this.config = { ...WHEEL_TRACK_DEFAULTS, ...settings }; this.systems = []
    this.clock = this.maintenance = this.cursor = this.highWater = 0
    this.stats = { active: 0, emitted: 0, recycled: 0 }
    this.history = { front: null, rear: null }; this.otherHistory={front:null,rear:null};this.probe = {}; this.edgeProbe = {}
    const n = this.config.capacity
    this.alive = new Uint8Array(n); this.born = new Float64Array(n); this.centers = new Float32Array(n * 2)
    this.geometry = new BufferGeometry()
    for (const [name, size] of [['position', 3], ['uv', 2], ['color', 3], ['aTrack', 2]]) {
      this.geometry.setAttribute(name, new BufferAttribute(new Float32Array(n * 4 * size), size).setUsage(DynamicDrawUsage))
    }
    const index = new Uint16Array(n * 6)
    for (let i = 0; i < n; i++) index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 2, i * 4 + 3, i * 4 + 1], i * 6)
    this.geometry.setIndex(new BufferAttribute(index, 1)); this.geometry.setDrawRange(0, 0)
    this.texture = createWheelTrackTexture()
    this.uniforms = { uTrackTime: { value: 0 }, uTrackLife: { value: this.config.lifetime }, uTrackRadius: { value: this.config.radius }, uTrackCenter: { value: new Vector2() },uTrackOtherCenter:{value:new Vector2()}, uTrackDay: { value: 1 } }
    this.material = new MeshBasicMaterial({ map: this.texture, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, alphaTest: .008, fog: true })
    this.material.name = 'Cyclone cel soil impressions'
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = 'attribute vec2 aTrack; varying vec2 vTrack; varying vec2 vTrackWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrack=aTrack;vTrackWorld=(modelMatrix*vec4(transformed,1.0)).xz;')
      shader.fragmentShader = 'uniform float uTrackTime,uTrackLife,uTrackRadius,uTrackDay;uniform vec2 uTrackCenter,uTrackOtherCenter;varying vec2 vTrack,vTrackWorld;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        diffuseColor.a *= vTrack.y * (1.0-smoothstep(uTrackLife*.8,uTrackLife,uTrackTime-vTrack.x))
          * (1.0-smoothstep(uTrackRadius*.75,uTrackRadius,min(distance(vTrackWorld,uTrackCenter),distance(vTrackWorld,uTrackOtherCenter))));
        #include <alphatest_fragment>`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight*=mix(.22,1.0,uTrackDay);\n#include <opaque_fragment>')
    }
    this.material.customProgramCacheKey = () => 'cyclone-wheel-impressions-v2'
    this.root = new Mesh(this.geometry, this.material); this.root.name = 'Cyclone_persistent_wheel_tracks'
    this.root.frustumCulled = false; this.root.renderOrder = 1
  }

  breakTrail(history=this.history) { history.front = history.rear = null }
  clear() {
    this.breakTrail();this.breakTrail(this.otherHistory); this.alive.fill(0); this.cursor = this.highWater = this.stats.active = 0
    this.geometry.setDrawRange(0, 0)
  }
  ground(x, z, fallback, probe) {
    const y = this.sample ? this.sample(x, z, probe) : fallback
    return Number.isFinite(y) ? y : null
  }
  edge(x, y, z, dx, dz, width, response) {
    const points = []
    for (const sign of [-1, 1]) {
      const px = x + dz * width * .5 * sign, pz = z - dx * width * .5 * sign
      const h = this.ground(px, pz, y, this.edgeProbe)
      if (h === null || Math.abs(h - y) > .35) return null
      if (this.sample && (!wheelTrackResponse({ ...this.edgeProbe, grounded: true }, {}, 0).allowed)) return null
      points.push([px, h + .018 + (response.kind === 'grass' ? .005 : 0), pz])
    }
    return points
  }
  emit(previous, next, response, distance) {
    const slot = this.cursor, a = this.geometry.attributes, color = palette[response.kind]
    if (this.alive[slot]) this.stats.recycled++; else this.stats.active++
    this.alive[slot] = 1; this.born[slot] = this.clock
    this.centers[slot * 2] = next.x; this.centers[slot * 2 + 1] = next.z
    const atlas = response.kind === 'grass' ? .5 : 0
    const points = [...previous.edges, ...next.edges], start = previous.phase, end = start + distance / .9
    for (let v = 0; v < 4; v++) {
      const i = slot * 4 + v
      a.position.setXYZ(i, ...points[v]); a.color.setXYZ(i, color.r, color.g, color.b)
      a.uv.setXY(i, atlas + ((v % 2) ? .496 : .004), v < 2 ? start : end)
      a.aTrack.setXY(i, this.clock, response.strength)
    }
    // Only changed slices are uploaded; Three merges adjacent update ranges.
    for (const attribute of Object.values(a)) { attribute.addUpdateRange(slot * 4 * attribute.itemSize, 4 * attribute.itemSize); attribute.needsUpdate = true }
    next.phase = end % 1
    this.cursor = (slot + 1) % this.config.capacity; this.highWater = Math.max(this.highWater, slot + 1)
    this.geometry.setDrawRange(0, this.highWater * 6); this.stats.emitted++
  }
  update(dt, wheels, state, configs = {}, enabled = true, day = 1, center = state,other=null) {
    this.uniforms.uTrackDay.value = day
    this.uniforms.uTrackCenter.value.set(center.x, center.z)
    const second=other?.enabled?other.state:center
    this.uniforms.uTrackOtherCenter.value.set(second.x,second.z)
    if (dt <= 0) return
    this.clock += Math.min(dt, .25); this.uniforms.uTrackTime.value = this.clock
    this.maintenance += dt
    if (this.maintenance > .5) {
      this.maintenance = 0
      for (let i = 0; i < this.highWater; i++) if (this.alive[i] && (this.clock - this.born[i] > this.config.lifetime || Math.min(Math.hypot(this.centers[i * 2] - center.x, this.centers[i * 2 + 1] - center.z),Math.hypot(this.centers[i*2]-second.x,this.centers[i*2+1]-second.z)) > this.config.radius + 8)) {
        this.alive[i] = 0; this.stats.active--
        for (let v = 0; v < 4; v++) this.geometry.attributes.aTrack.setY(i * 4 + v, 0)
        this.geometry.attributes.aTrack.addUpdateRange(i * 8, 8); this.geometry.attributes.aTrack.needsUpdate = true
      }
    }
    this.write(dt,wheels,state,configs,enabled,this.history)
    if(other)this.write(dt,other.wheels,other.state,other.configs,other.enabled,this.otherHistory)
    else this.breakTrail(this.otherHistory)
  }
  write(dt,wheels,state,configs,enabled,history){
    if (!enabled) { this.breakTrail(history); return }
    for (const side of ['front', 'rear']) {
      const wheel = wheels[side], humidity = configs[side]?.humidity ?? configs.humidity ?? .3
      const response = wheelTrackResponse(wheel, state, humidity), p = wheel.position
      let previous = history[side]
      if (!response.allowed) { history[side] = null; continue }
      const distance = previous ? Math.hypot(p.x - previous.x, p.z - previous.z) : 0
      // Discontinuities never connect across jumps, resets or recycled worlds.
      if (!previous || previous.kind !== response.kind || distance > Math.min(16, Math.max(3, Math.abs(state.speed || 0) * dt * 2 + 1))) {
        const len = (Math.hypot(wheel.forward.x, wheel.forward.z) || 1) * (state.speed < 0 ? -1 : 1)
        const dx = wheel.forward.x / len, dz = wheel.forward.z / len
        const edges = this.edge(p.x, p.y, p.z, dx, dz, response.width, response)
        history[side] = edges ? { x: p.x, y: p.y, z: p.z, edges, dx, dz, phase: 0, kind: response.kind } : null
        continue
      }
      if (distance < this.config.minDistance) continue
      const steps = Math.min(this.config.maxSteps, Math.ceil(distance / this.config.spacing))
      const from = previous, dx = (p.x - from.x) / distance, dz = (p.z - from.z) / distance
      if (from.dx * dx + from.dz * dz < -.2) { history[side] = null; continue }
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, x = from.x + (p.x - from.x) * t, z = from.z + (p.z - from.z) * t
        const y = this.ground(x, z, from.y + (p.y - from.y) * t, this.probe)
        const local = this.sample ? wheelTrackResponse({ ...this.probe, grounded: true }, state, humidity) : response
        if (y === null || !local.allowed || local.kind !== response.kind) { previous = null; break }
        const edges = this.edge(x, y, z, dx, dz, local.width, local)
        if (!edges) { previous = null; break }
        const next = { x, y, z, edges, dx, dz, phase: 0, kind: local.kind }
        this.emit(previous, next, local, distance / steps); previous = next
      }
      history[side] = previous
    }
  }
  dispose() { this.root.removeFromParent(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose() }
}
