import { Color, Euler, MeshBasicMaterial, PlaneGeometry, Quaternion, UniformsLib, UniformsUtils, Vector3 } from 'three'
import { ApplyForce, Bezier, ColorOverLife, ColorRange, ConeEmitter, ConstantValue, Gradient, IntervalValue, LimitSpeedOverLife, ParticleSystem, PiecewiseBezier, RenderMode, RotationOverLife, SizeOverLife, TurbulenceField, Vector3 as QVec3, Vector4 as QVec4 } from 'three.quarks'
import { createSmokeAtlas } from './smokeAtlas.js'
import { measureEngineSockets } from './engineSockets.js'
import { EXHAUST_TRAIL_SPEED, RidingExhaust } from './RidingExhaust.js'

const axis = new Vector3(0, 0, 1)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
function color(hex, alpha) { const c = new Color(hex); return new QVec4(c.r, c.g, c.b, alpha) }

class SmokeBirth {
  type = 'MOSPEADA_EngineSmokeBirth'
  constructor(record, owner) { this.record = record; this.owner = owner }
  initialize(p) {
    p.velocity.add(this.record.inertia)
    p.startSize.x *= .7 + Math.random() * .7; p.startSize.y *= .75 + Math.random() * .55; p.size.copy(p.startSize)
    this.owner.emitted[this.record.kind === 'exhaust' ? 'exhaust' : 'boost']++
    this.owner.emitted[this.record.id]++
  }
  update(p) {
    const r = this.record, t = p.age / p.life
    p.color.w *= r.opacity
    p.size.multiplyScalar(r.kind === 'exhaust' ? r.sizeFactor : 1 + (r.sizeFactor - 1) * clamp(t * 8, 0, 1))
  }
  frameUpdate() {}
  reset() {}
  clone() { return new SmokeBirth(this.record, this.owner) }
  toJSON() { return { type: this.type } }
}

class SmokeTurbulence {
  type = 'MOSPEADA_EngineSmokeTurbulence'
  constructor(record) {
    this.record = record
    this.field = new TurbulenceField(new QVec3(2.5, 2, 2.5), 1, new QVec3(.5, .3, .5), new QVec3(.25, .2, .3))
  }
  initialize() {}
  update(p, dt) {
    const t = p.age / p.life, exhaust = this.record.kind === 'exhaust'
    this.field.update(p, dt * (exhaust ? 1 : .15 + .85 * clamp(t * 7, 0, 1)))
  }
  frameUpdate(dt) { this.field.frameUpdate(dt) }
  reset() {}
  clone() { return new SmokeTurbulence(this.record) }
  toJSON() { return { type: this.type } }
}

export class EngineSmoke {
  constructor(rig) {
    this.rig = rig; this.sockets = measureEngineSockets(rig)
    this.geometry = new PlaneGeometry(1, 1); this.atlas = createSmokeAtlas()
    this.material = new MeshBasicMaterial({ name: 'Engine smoke source', map: this.atlas, transparent: true, depthWrite: false, alphaTest: .001 })
    this.day = { value: 1 }; this.records = []; this.systems = []; this.batches = new Set()
    this.clock = 0; this.activity = 0; this.boostLevel = 0; this.frame = 1 / 60; this.elapsed = 0
    this.emitted = { exhaust: 0, boost: 0, left: 0, right: 0, core: 0, plume: 0 }
    this.offset = new Vector3(); this.rotation = new Quaternion(); this.euler = new Euler(0, 0, 0, 'YXZ')
    for (const [id, kind] of [['left', 'exhaust'], ['right', 'exhaust'], ['core', 'core'], ['plume', 'plume']]) {
      const exhaust = kind === 'exhaust', core = kind === 'core'
      const r = { id, kind, rate: new ConstantValue(0), speed: new IntervalValue(1, 2), life: new IntervalValue(.5, 1), current: new Vector3(), previous: new Vector3(), direction: new Vector3(), currentQ: new Quaternion(), previousQ: new Quaternion(), inertia: new Vector3(), opacity: 1, sizeFactor: 1, desired: 0, quota: 0, initialized: false }
      r.turbulence = new SmokeTurbulence(r)
      const ps = new ParticleSystem({
        duration: 60, looping: true, prewarm: false, autoDestroy: false, worldSpace: true,
        shape: new ConeEmitter({ radius: exhaust ? .015 : core ? .012 : .02, angle: exhaust ? .18 : core ? .045 : .12 }),
        startLife: r.life, startSpeed: r.speed,
        startSize: new IntervalValue(exhaust ? .16 : core ? .06 : .22, exhaust ? .24 : core ? .09 : .4),
        startRotation: new IntervalValue(-Math.PI, Math.PI), startTileIndex: new IntervalValue(0, 4),
        startColor: new ColorRange(color(exhaust ? '#c5cbcd' : '#e4e8ea', exhaust ? .32 : core ? .55 : .45), color(exhaust ? '#e0e4e5' : '#ffffff', exhaust ? .5 : core ? .8 : .6)),
        emissionOverTime: r.rate, emissionOverDistance: new ConstantValue(0), emissionBursts: [],
        material: this.material, instancingGeometry: this.geometry, renderMode: core ? RenderMode.StretchedBillBoard : RenderMode.BillBoard,
        rendererEmitterSettings: core ? { speedFactor: .2, lengthFactor: .4 } : {},
        uTileCount: 2, vTileCount: 2, blendTiles: false, renderOrder: 4,
        behaviors: [new ApplyForce(new QVec3(0, 1, 0), new ConstantValue(exhaust ? .38 : core ? .04 : .15)),
          new LimitSpeedOverLife(new ConstantValue(0), (exhaust ? 1.4 : core ? .35 : 1.1) / 20), r.turbulence,
          new SizeOverLife(new PiecewiseBezier([[new Bezier(exhaust ? .7 : core ? .7 : .5, exhaust ? 1.5 : core ? .85 : 4.5, exhaust ? 3.3 : core ? 1.15 : 8, exhaust ? 5 : core ? 1.4 : 15), 0]])),
          new ColorOverLife(new Gradient([[new QVec3(1, 1, 1), 0], [new QVec3(.88, .91, .93), 1]], [[exhaust ? .35 : 0, 0], [1, core ? .04 : .025], [.8, .28], [.3, .65], [0, 1]])),
          new RotationOverLife(new IntervalValue(-.4, .4)), new SmokeBirth(r, this)],
      })
      ps.emitter.name = `Quarks_engine_${id}`; r.system = ps
      this.records.push(r); this.systems.push(ps)
    }
    this.movingEmitted = 0
    this.riding = new RidingExhaust(this.sockets, this)
    this.systems.push(...this.riding.systems)
  }
  configureBatches(renderer) {
    for (const r of this.records) {
      const batch = renderer.batches[renderer.systemToBatchIndex.get(r.system)]; r.batch = batch
      if (this.batches.has(batch)) continue
      this.batches.add(batch)
      const material = batch.material, core = r.kind === 'core'
      material.name = core ? 'Quarks turbine concentrated core' : 'Quarks exhaust and turbine plume'; material.fog = true
      Object.assign(material.uniforms, UniformsUtils.clone(UniformsLib.fog), { uEngineDay: this.day })
      material.onBeforeCompile = shader => {
        shader.vertexShader = '#include <fog_pars_vertex>\n' + shader.vertexShader.replace('#include <logdepthbuf_vertex>', '#include <logdepthbuf_vertex>\n#include <fog_vertex>')
        shader.fragmentShader = 'uniform float uEngineDay;\n#include <fog_pars_fragment>\n' + shader.fragmentShader.replace('outgoingLight = diffuseColor.rgb;', `outgoingLight = diffuseColor.rgb * mix(${core ? '.55' : '.3'}, 1.0, uEngineDay);`).replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>')
      }
      material.customProgramCacheKey = () => 'mospeada-engine-smoke-v1-' + (core ? 'core' : 'plume')
      material.needsUpdate = true; batch.name = core ? 'Quarks_boost_core_batch' : 'Quarks_engine_smoke_batch'; batch.userData.vfx = 'engine'
    }
    this.riding.configureBatches(renderer); this.batches.add(this.riding.batch)
  }
  prepare(dt, state, input, config, distance, day, frameSeconds) {
    this.config = config; this.elapsed = 0; this.duration = Math.min(dt, .25); this.clock += this.duration; this.day.value = day
    this.frame += (Math.min(frameSeconds, .3) - this.frame) * .05
    const speed = Math.abs(state.speed || 0), throttle = state.riderMode === 'mounted' ? input.throttle || 0 : 0
    const target = clamp(throttle * .7 + Math.max(0, state.acceleration || 0) / 18, 0, 1)
    this.activity += (target - this.activity) * (1 - Math.exp(-dt * (target > this.activity ? 9 : 4)))
    const softActivity = state.speed < 0 || speed >= .3 ? 0 : this.activity
    this.boosting = config.boostEnabled && state.boostTime > 0
    this.boostLevel += ((this.boosting ? 1 : 0) - this.boostLevel) * (1 - Math.exp(-dt * 60))
    const lod = distance > 85 ? 0 : distance > 45 ? .22 : distance > 24 ? .55 : 1
    const performance = this.frame > .085 ? .55 : this.frame > .045 ? .75 : 1, gain = lod * performance
    this.rig.body.updateWorldMatrix(true, false)
    this.euler.set(config.boostPitch * Math.PI / 180, config.boostYaw * Math.PI / 180, 0); this.rotation.setFromEuler(this.euler)
    this.offset.copy(this.sockets.provisional); this.offset.x += config.boostX; this.offset.y += config.boostY; this.offset.z += config.boostZ
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i], exhaust = r.kind === 'exhaust', core = r.kind === 'core'
      r.previous.copy(r.current); r.previousQ.copy(r.currentQ)
      if (exhaust) {
        const socket = this.sockets.exhausts[i]
        socket.mesh.updateWorldMatrix(true, false)
        r.current.copy(socket.localPosition).applyMatrix4(socket.mesh.matrixWorld)
        r.direction.copy(socket.localDirection).transformDirection(socket.mesh.matrixWorld)
      } else {
        r.current.copy(this.offset).applyMatrix4(this.rig.body.matrixWorld)
        r.direction.set(0, 0, -1).applyQuaternion(this.rotation).transformDirection(this.rig.body.matrixWorld)
      }
      r.currentQ.setFromUnitVectors(axis, r.direction)
      if (!r.initialized || r.previous.distanceToSquared(r.current) > 225) { r.previous.copy(r.current); r.previousQ.copy(r.currentQ) }
      r.initialized = true
      r.inertia.set(Math.sin(state.travelYaw ?? state.yaw) * state.speed, state.airborne ? state.verticalVelocity || 0 : 0, Math.cos(state.travelYaw ?? state.yaw) * state.speed).multiplyScalar(exhaust ? 1 : core ? .2 : .8)
      const pulse = .72 + .28 * Math.sin(this.clock * 14 + i * 2.7) ** 2
      const idle = Math.sin(this.clock * 2.7 + i * 2.3) > .65 ? .3 : 0
      r.desired = exhaust ? config.exhaustEnabled ? (softActivity < .05 ? idle : (.45 + Math.min(speed, 35) * .03 + softActivity * 7) * pulse) * config.exhaustIntensity * gain : 0 : this.boosting ? (core ? 190 : 280) * this.boostLevel * config.boostIntensity * pulse * gain : 0
      // The approved soft smoke stays exactly as authored at rest. Moving
      // exhaust starts only above 50 km/h forward; reverse keeps idle smoke.
      if (exhaust && state.speed > EXHAUST_TRAIL_SPEED) r.desired = 0
      r.quota = Math.floor((exhaust ? 24 : core ? 128 : 320) * gain)
      r.speed.a = exhaust ? .7 + softActivity * .4 : config.boostSpeed * (core ? .9 : .7)
      r.speed.b = exhaust ? 1.3 + softActivity * .7 : config.boostSpeed * (core ? 1.2 : 1.05)
      r.life.a = exhaust ? .7 : core ? .055 : .9 * config.boostLength
      r.life.b = exhaust ? 1.3 : core ? .09 : 2.1 * config.boostLength
      r.opacity = exhaust ? config.exhaustOpacity : config.boostOpacity
      r.sizeFactor = exhaust ? config.exhaustSize : core ? 1 : config.boostExpansion
      const turbulence = exhaust ? config.exhaustTurbulence * .55 : core ? config.boostTurbulence * .3 : config.boostTurbulence * 4.5
      r.turbulence.field.velocityMultiplier.set(turbulence, turbulence * .65, turbulence)
      const enabled = exhaust ? config.exhaustEnabled : config.boostEnabled
      r.system.emitter.visible = enabled
      if (r.system.particleNum > r.quota) { r.system.particleNum = r.quota; if (dt === 0) r.batch.update() }
    }
    this.riding.prepare(dt, state, input, config, distance, day, frameSeconds)
  }
  beforeStep(dt) {
    if (!this.config) return
    this.elapsed += dt
    const t = this.duration > 0 ? clamp(this.elapsed / this.duration, 0, 1) : 1
    for (const r of this.records) {
      const ps = r.system, remaining = Math.max(0, r.quota - ps.particleNum)
      ps.emitter.position.lerpVectors(r.previous, r.current, t); ps.emitter.quaternion.slerpQuaternions(r.previousQ, r.currentQ, t); ps.emitter.updateWorldMatrix(true, false)
      ps.emissionState.waitEmiting = r.desired > 0 ? Math.min(ps.emissionState.waitEmiting, remaining) : 0
      r.rate.value = dt > 0 ? Math.min(r.desired, Math.max(0, remaining - Math.ceil(ps.emissionState.waitEmiting)) / dt) : 0
    }
    this.riding.beforeStep(dt)
  }
  dispose() { this.material.dispose(); this.geometry.dispose(); this.atlas.dispose(); this.riding.dispose() }
}
