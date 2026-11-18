import { Color, Float32BufferAttribute, Matrix3, Matrix4, Vector2, Vector3 } from 'three'
import { buildBrushGeometry, isBrushTarget } from './surfaceBrushGeometry.js'
import { surfaceBrushState, BRUSH_TOTAL_SECONDS } from './surfaceBrushState.js'

export class SurfaceBrush {
  constructor(store = surfaceBrushState, random = Math.random) {
    this.store = store; this.random = random; this.attachments = new Set(); this.byObject = new WeakMap()
    this.progress = 0; this.playing = false; this.held = false; this.wait = 1; this.pauseVariation = 0.85 + random() * 0.3; this.manual = false
    this.lastPlay = 0; this.lastScrub = 0; this.publishTime = 0; this.lastAutomatic = true
    this.uniforms = { uBrushEnabled: { value: 0 }, uBrushProgress: { value: -1 }, uBrushSize: { value: 1 }, uBrushIntensity: { value: 0.85 }, uBrushIrregularity: { value: 0.8 }, uBrushSensitivity: { value: 1 }, uBrushDirection: { value: 1 }, uBrushColor: { value: new Color('#dbf6ff') }, uBrushDay: { value: 1 } }
    this.modelView = new Matrix4()
    this.uniforms.uBrushBikeRange = { value: new Vector2(Infinity, -Infinity) }
    this.uniforms.uBrushDelayStrength = { value: 1 }
  }
  attach(object, material) {
    if (!isBrushTarget(object, material)) return null
    if (this.byObject.has(object)) return this.byObject.get(object)
    const { geometry, report } = buildBrushGeometry(object.geometry)
    let owner = object
    while (owner.name !== 'Cyclone_riding_vehicle') owner = owner.parent
    owner.updateWorldMatrix(true, true)
    const toBike = owner.matrixWorld.clone().invert().multiply(object.matrixWorld), point = new Vector3(), centre = new Vector3()
    let minZ = Infinity, maxZ = -Infinity
    const positions = geometry.attributes.position, bikeZ = new Float32Array(positions.count)
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toBike)
      bikeZ[i] = point.z
      centre.add(point)
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z)
    }
    geometry.setAttribute('aBrushBikeZ', new Float32BufferAttribute(bikeZ, 1))
    centre.divideScalar(positions.count)
    let seed = 0
    // Include bind-space position: mirrored and repeated parts must not flash
    // together just because the exporter gave them the same piece name.
    const identity = `${object.userData.sourcePiece || object.name}|${centre.toArray().map(n => Math.round(n * 1000)).join(',')}`
    for (const char of identity) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
    let delaySeed = 0
    const pairedIdentity = `${object.userData.sourcePiece || object.name}|${[Math.abs(centre.x), centre.y, centre.z].map(n => Math.round(n * 1000)).join(',')}`
    for (const char of pairedIdentity) delaySeed = (delaySeed * 31 + char.charCodeAt(0)) >>> 0
    const range = this.uniforms.uBrushBikeRange.value
    range.x = Math.min(range.x, minZ); range.y = Math.max(range.y, maxZ)
    const attachment = { object, sourceGeometry: object.geometry, geometry, report, uniforms: { ...this.uniforms,
      uBrushPanel: { value: new Vector3(minZ, maxZ, seed % 997 / 997 * 6.28) },
      uBrushPanelDelay: { value: 0.02 + (delaySeed % 991 / 991) * 0.10 + (centre.x < -0.03 ? 0.12 : 0) },
      uBrushViewToLocalNormal: { value: new Matrix3() } } }
    this.byObject.set(object, attachment); this.attachments.add(attachment)
    return attachment
  }
  tick(delta, active, day = 1, speed = 0, paused = false) {
    const c = this.store.snapshot(), u = this.uniforms
    const started = c.playRequest !== this.lastPlay
    u.uBrushEnabled.value = c.enabled && active ? 1 : 0
    u.uBrushSize.value = c.size; u.uBrushIntensity.value = c.intensity; u.uBrushIrregularity.value = c.irregularity
    u.uBrushSensitivity.value = c.sensitivity; u.uBrushDirection.value = c.direction; u.uBrushColor.value.set(c.color); u.uBrushDay.value = day
    u.uBrushDelayStrength.value = c.stagger
    if (c.playRequest !== this.lastPlay) { this.lastPlay = c.playRequest; this.progress = 0; this.playing = true; this.held = false; this.manual = true }
    if (c.scrubRequest !== this.lastScrub) { this.lastScrub = c.scrubRequest; this.progress = c.scrubValue; this.playing = false; this.held = true }
    if (c.automatic && !this.lastAutomatic) { this.held = false; this.wait = 1 }
    this.lastAutomatic = c.automatic
    const moving = Math.abs(speed) > 0.3
    const velocity = Math.min(1, Math.max(0, (Math.abs(speed) - 0.3) / 64.7))
    this.pauseSeconds = (0.045 + 6 * (1 - velocity) ** 2.2) * this.pauseVariation
    if (!moving && !this.manual && !this.held) { this.playing = false; this.progress = 0; this.wait = 1 }
    if (c.enabled && active && !paused) {
      if (this.playing) {
        this.progress = Math.min(1, this.progress + (started ? 0 : Math.max(0, delta)) * c.speed * (c.slow ? 0.25 : 1) / BRUSH_TOTAL_SECONDS)
        if (this.progress >= 1 - 1e-9) { this.progress = 1; this.playing = false; this.manual = false; this.wait = 1; this.pauseVariation = 0.85 + this.random() * 0.3 }
      } else if (c.automatic && !this.held && moving) {
        // Integrate a cycle fraction, so accelerating/decelerating changes the
        // current pause immediately instead of waiting out an old slow timer.
        this.wait -= Math.max(0, delta) / this.pauseSeconds
        if (this.wait <= 0) { this.playing = true; this.progress = 0; this.manual = false }
      }
    }
    u.uBrushProgress.value = this.playing || this.held ? this.progress : -1
    this.publishTime += Math.max(0, delta)
    if (this.publishTime > 0.08 && c.progress !== this.progress || c.playing !== this.playing || this.held && c.progress !== this.progress) {
      this.publishTime = 0; this.store.publish({ progress: this.progress, playing: this.playing })
    }
  }
  sync(camera) {
    camera.updateMatrixWorld()
    for (const attachment of this.attachments) {
      attachment.object.updateWorldMatrix(true, false)
      this.modelView.multiplyMatrices(camera.matrixWorldInverse, attachment.object.matrixWorld)
      attachment.uniforms.uBrushViewToLocalNormal.value.getNormalMatrix(this.modelView).invert()
    }
  }
  dispose() {
    for (const a of this.attachments) { if (a.object.geometry === a.geometry) a.object.geometry = a.sourceGeometry; a.geometry.dispose() }
    this.attachments.clear()
  }
}
