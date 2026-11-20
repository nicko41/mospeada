import { Color, MeshBasicMaterial, PlaneGeometry, Vector3, UniformsLib, UniformsUtils } from 'three'
import { ApplyForce, Bezier, ColorOverLife, ColorRange, ConeEmitter, ConstantValue, Gradient, IntervalValue, LimitSpeedOverLife, ParticleSystem, PiecewiseBezier, RenderMode, RotationOverLife, SizeOverLife, TurbulenceField, Vector3 as QVec3, Vector4 as QVec4 } from 'three.quarks'
import { createDustAtlas } from './dustAtlas.js'
import { dustResponse } from './dustResponse.js'

// Quarks behavior: initialize inherited velocity and a local contact plane.
// Quarks owns motion, age, allocation, emission, integration and recycling.
class DustContact {
  type = 'MOSPEADA_DustContact'
  constructor(effect) { this.effect = effect }
  initialize(p) {
    const e = this.effect, n = e.normal
    p.velocity.add(e.inertia)
    p.velocity.y = Math.max(.35, p.velocity.y)
    p.startSize.x *= .75 + Math.random() * .65; p.startSize.y *= .8 + Math.random() * .4
    p.size.copy(p.startSize)
    p.dustFloor = p.position.y; p.dustX = p.position.x; p.dustZ = p.position.z
    p.dustSlopeX = -n.x / Math.max(.3, n.y); p.dustSlopeZ = -n.z / Math.max(.3, n.y)
    e.emitted++
  }
  update(p) {
    const floor = p.dustFloor + (p.position.x - p.dustX) * p.dustSlopeX + (p.position.z - p.dustZ) * p.dustSlopeZ
    const minimum = floor + p.size.y * .26
    if (p.position.y < minimum) { p.position.y = minimum; p.velocity.y = Math.max(0, p.velocity.y) }
  }
  frameUpdate() {}
  reset() {}
  toJSON() { return { type: this.type } }
  clone() { return new DustContact(this.effect) }
}

function colorVector(hex, alpha) { const c = new Color(hex); return new QVec4(c.r, c.g, c.b, alpha) }

export class DustTrail {
  constructor() {
    this.atlas = createDustAtlas(); this.geometry = new PlaneGeometry(1, 1)
    this.material = new MeshBasicMaterial({ name: 'Cyclone dust source', map: this.atlas, transparent: true, depthWrite: false, alphaTest: .001 })
    this.normal = new Vector3(0, 1, 0); this.inertia = new Vector3(); this.direction = new Vector3(); this.previous = new Vector3(); this.current = new Vector3()
    this.axis = new Vector3(0, 0, 1); this.initialized = false; this.emitted = 0; this.frame = 1 / 60
    this.day = { value: 1 }; this.rate = new ConstantValue(0)
    this.speed = new IntervalValue(1, 2); this.life = new IntervalValue(1.8, 2.8); this.size = new IntervalValue(.22, .48)
    this.gravity = new ApplyForce(new QVec3(0, -1, 0), new ConstantValue(.65))
    this.drag = new LimitSpeedOverLife(new ConstantValue(0), 1.35 / 20)
    this.turbulence = new TurbulenceField(new QVec3(2.8, 2.1, 2.8), 1, new QVec3(.55, .16, .55), new QVec3(.15, .12, .17))
    this.wind = new ApplyForce(new QVec3(-.95, 0, .3).normalize(), new ConstantValue(.35))
    this.shape = new ConeEmitter({ radius: .065, angle: .48, thickness: 1 })
    this.system = new ParticleSystem({
      duration: 30, looping: true, prewarm: false, autoDestroy: false, worldSpace: true,
      startLife: this.life, startSpeed: this.speed, startSize: this.size,
      startRotation: new IntervalValue(-Math.PI, Math.PI), startTileIndex: new IntervalValue(0, 4),
      startColor: new ColorRange(colorVector('#b2a087', .24), colorVector('#d1bfa2', .42)),
      emissionOverTime: this.rate, emissionOverDistance: new ConstantValue(0), emissionBursts: [], shape: this.shape,
      material: this.material, instancingGeometry: this.geometry, renderMode: RenderMode.BillBoard,
      uTileCount: 2, vTileCount: 2, blendTiles: false, renderOrder: 3,
      behaviors: [new DustContact(this), this.gravity, this.drag, this.turbulence, this.wind,
        new SizeOverLife(new PiecewiseBezier([[new Bezier(.55, 1.8, 3.2, 4.2), 0]])),
        new ColorOverLife(new Gradient([[new QVec3(1, 1, 1), 0], [new QVec3(.87, .9, .94), 1]], [[0, 0], [.85, .015], [1, .08], [.75, .4], [.25, .75], [0, 1]])),
        new RotationOverLife(new IntervalValue(-.24, .24))],
    })
    this.system.emitter.name = 'Cyclone_rear_dust_emitter'
    this.systems = [this.system]; this.response = { rate: 0, budget: 640 }
  }
  configureBatches(renderer) {
    // Keep Quarks' instanced shader, add the world's fog and output transform.
    // Anime sees an unlit transparent surface and adds no black contour to it.
    const batch = renderer.batches[renderer.systemToBatchIndex.get(this.system)]
    const material = batch.material
    material.name = 'Quarks organic dust'; material.fog = true
    Object.assign(material.uniforms, UniformsUtils.clone(UniformsLib.fog), { uDustDay: this.day })
    material.onBeforeCompile = shader => {
      shader.vertexShader = '#include <fog_pars_vertex>\n' + shader.vertexShader.replace('#include <logdepthbuf_vertex>', '#include <logdepthbuf_vertex>\n#include <fog_vertex>')
      shader.fragmentShader = 'uniform float uDustDay;\n#include <fog_pars_fragment>\n' + shader.fragmentShader.replace('outgoingLight = diffuseColor.rgb;', 'outgoingLight = diffuseColor.rgb * mix(.18, 1.0, uDustDay);').replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>')
    }
    material.customProgramCacheKey = () => 'mospeada-quarks-dust-v1'
    material.needsUpdate = true
    batch.name = 'Quarks_dust_batch'; batch.userData.vfx = 'dust'
    this.batch = batch
  }
  update(dt, wheel, state, config, distance, day, frameSeconds, runtime) {
    const ps = this.system
    this.day.value = day
    this.frame += (Math.min(frameSeconds, .3) - this.frame) * .05
    this.response = dustResponse(wheel, state, config, distance, this.frame)
    const { rate, budget, launch, persistence } = this.response
    this.normal.copy(wheel.normal)
    this.current.copy(wheel.position).addScaledVector(wheel.normal, .055)
    const sameSurface = this.surface === wheel.surface
    if (!this.initialized || !sameSurface || this.previous.distanceToSquared(this.current) > 144) this.previous.copy(this.current)
    this.initialized = true; this.surface = wheel.surface
    const reverse = state.speed < 0 ? -1 : 1, sideSpeed = state.rearLateralVelocity || 0
    this.direction.copy(wheel.forward).multiplyScalar(-reverse).multiplyScalar(launch)
    this.direction.x -= Math.cos(state.yaw) * sideSpeed * .38
    this.direction.z += Math.sin(state.yaw) * sideSpeed * .38
    this.direction.y = .75 + this.response.acceleration * .35
    this.direction.normalize()
    this.inertia.copy(wheel.forward).multiplyScalar(state.speed * .12)
    this.inertia.x += Math.cos(state.yaw) * sideSpeed * .25
    this.inertia.z -= Math.sin(state.yaw) * sideSpeed * .25
    this.shape.angle = .32 + config.spread * .2; this.shape.radius = .045 + config.spread * .025
    this.speed.a = launch * .65; this.speed.b = launch * 1.2
    this.life.a = 1.5 * config.life * persistence; this.life.b = 2.5 * config.life * persistence
    this.size.a = .4 * config.size; this.size.b = .9 * config.size
    this.gravity.magnitude.value = config.gravity; this.drag.dampen = config.drag / 20
    this.wind.magnitude.value = config.wind * .35
    this.turbulence.velocityMultiplier.set(config.turbulence, config.turbulence * .28, config.turbulence)
    const steps = Math.max(1, Math.ceil(Math.min(dt, .25) / (1 / 30))), step = Math.min(dt, .25) / steps
    for (let i = 0; i < steps; i++) {
      ps.emitter.position.lerpVectors(this.previous, this.current, (i + 1) / steps)
      ps.emitter.quaternion.setFromUnitVectors(this.axis, this.direction); ps.emitter.updateWorldMatrix(true, false)
      // Quarks 0.18 pools particles but doesn't expose a maxParticle option.
      // Bound both pending emissions and the next credit before its own update.
      const trimmed = ps.particleNum > budget
      if (trimmed) ps.particleNum = budget
      const remaining = Math.max(0, budget - ps.particleNum)
      // Quarks uses ceil(credit), retaining a negative fractional debt after
      // spawning. Preserve that debt: zeroing it creates 30 particles/s even
      // when wet-ground emission is below one particle/s.
      ps.emissionState.waitEmiting = rate > 0 ? Math.min(ps.emissionState.waitEmiting, remaining) : 0
      this.rate.value = step > 0 ? Math.min(rate, Math.max(0, remaining - Math.ceil(ps.emissionState.waitEmiting)) / step) : 0
      if (step > 0) runtime.update(step)
      else if (trimmed) this.batch.update()
    }
    this.previous.copy(this.current)
    this.batch.visible = config.enabled && ps.particleNum > 0
  }
  dispose() { this.material.dispose(); this.geometry.dispose(); this.atlas.dispose() }
}
