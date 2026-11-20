import { Color, Quaternion, UniformsLib, UniformsUtils, Vector3 } from 'three'
import { ColorOverLife, ColorRange, ConeEmitter, ConstantValue, Gradient, IntervalValue, LimitSpeedOverLife, ParticleSystem, Quaternion as QQuaternion, RenderMode, TurbulenceField, Vector3 as QVec3, Vector4 as QVec4 } from 'three.quarks'
import { ExhaustBurstCycle } from './ExhaustBurstCycle.js'
import { createSteamBrush } from './steamBrush.js'
const axis = new Vector3(0, 0, 1), localAxis = new QVec3(0, 0, 1)
export const EXHAUST_TRAIL_SPEED = 50 / 3.6
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
function color(hex, alpha) { const c = new Color(hex); return new QVec4(c.r, c.g, c.b, alpha) }

class SteamAppearance {
  type = 'MOSPEADA_RidingSteam'
  constructor(record, owner) { this.record = record; this.owner = owner; this.roll = new QQuaternion() }
  initialize(p) {
    const r = this.record
    p.velocity.add(r.inertia)
    const power = r.cycle.power
    p.startSize.set(.08 + Math.random() * .05 + power * .025, .08 + Math.random() * .05 + power * .025, .13 + Math.random() * .09 + power * .07)
    p.size.copy(p.startSize)
    this.roll.setFromAxisAngle(localAxis, Math.random() * Math.PI * 2); p.rotation.multiply(this.roll)
    this.owner.emitted.exhaust++; this.owner.emitted[r.id]++; this.owner.movingEmitted++
  }
  update(p) {
    const r = this.record, t = p.age / p.life, grow = 1 - (1 - clamp(t * 3, 0, 1)) ** 2
    p.size.copy(p.startSize)
    p.size.x *= (.7 + t * 2.8) * r.size; p.size.y *= (.7 + t * 2.8) * r.size
    p.size.z *= (1.2 + grow * 3.5) * r.size
    p.color.w *= r.opacity
  }
  frameUpdate() {}
  reset() {}
  clone() { return new SteamAppearance(this.record, this.owner) }
  toJSON() { return { type: this.type } }
}

export class RidingExhaust {
  constructor(sockets, owner) {
    Object.assign(this, createSteamBrush())
    this.sockets = sockets; this.owner = owner; this.records = []; this.systems = []; this.day = { value: 1 }
    this.frame = 1 / 60; this.duration = 0; this.elapsed = 0
    for (const [i, id] of ['left', 'right'].entries()) {
      const r = { id, cycle: new ExhaustBurstCycle(173 + i * 871), current: new Vector3(), previous: new Vector3(), direction: new Vector3(), inertia: new Vector3(), currentQ: new Quaternion(), previousQ: new Quaternion(), rate: new ConstantValue(0), speed: new IntervalValue(6, 10), life: new IntervalValue(.16, .28), initialized: false, opacity: 0, size: 1, quota: 0 }
      r.turbulence = new TurbulenceField(new QVec3(.7, .5, .7), 1, new QVec3(1, .6, 1), new QVec3(.4, .3, .5))
      const ps = new ParticleSystem({
        duration: 60, looping: true, prewarm: false, autoDestroy: false, worldSpace: true,
        shape: new ConeEmitter({ radius: .012, angle: .045 }),
        startLife: r.life, startSpeed: r.speed, startSize: new ConstantValue(1), startRotation: new ConstantValue(0),
        startColor: new ColorRange(color('#73838f', .33), color('#a4b1bb', .5)), startTileIndex: new IntervalValue(0, 4),
        emissionOverTime: r.rate, emissionOverDistance: new ConstantValue(0), emissionBursts: [],
        material: this.material, instancingGeometry: this.geometry, renderMode: RenderMode.Mesh,
        uTileCount: 2, vTileCount: 2, blendTiles: false, renderOrder: 4,
        behaviors: [new LimitSpeedOverLife(new ConstantValue(0), .8 / 20), r.turbulence,
          new ColorOverLife(new Gradient([[new QVec3(1, 1, 1), 0], [new QVec3(.85, .92, 1), 1]], [[.5,0], [1,.06], [.55,.35], [.1,.75], [0,1]])), new SteamAppearance(r, owner)],
      })
      ps.emitter.name = `Quarks_riding_exhaust_${id}`; r.system = ps; this.records.push(r); this.systems.push(ps)
    }
  }
  configureBatches(renderer) {
    this.batch = renderer.batches[renderer.systemToBatchIndex.get(this.systems[0])]
    const m = this.batch.material
    m.name = 'Quarks slate-blue exhaust bursts'; m.fog = true
    Object.assign(m.uniforms, UniformsUtils.clone(UniformsLib.fog), { uSteamDay: this.day })
    m.onBeforeCompile = shader => {
      shader.vertexShader = '#include <fog_pars_vertex>\n' + shader.vertexShader.replace('#include <logdepthbuf_vertex>', '#include <logdepthbuf_vertex>\n#include <fog_vertex>')
      shader.fragmentShader = 'uniform float uSteamDay;\n#include <fog_pars_fragment>\n' + shader.fragmentShader.replace('outgoingLight = diffuseColor.rgb;', 'outgoingLight = diffuseColor.rgb * mix(.35, 1.0, uSteamDay);').replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>')
    }
    m.customProgramCacheKey = () => 'mospeada-riding-steam-v1'; m.needsUpdate = true
    this.batch.name = 'Quarks_riding_exhaust_batch'; this.batch.userData.vfx = 'engine'
  }
  prepare(dt, state, input, config, distance, day, frameSeconds) {
    this.config = config; this.elapsed = 0; this.duration = Math.min(dt, .25); this.day.value = day
    this.moving = config.exhaustEnabled && state.speed > EXHAUST_TRAIL_SPEED
    this.throttle = state.riderMode === 'mounted' ? input.throttle || 0 : 0; this.acceleration = state.acceleration || 0
    this.frame += (Math.min(frameSeconds, .3) - this.frame) * .05
    const gain = (distance > 85 ? 0 : distance > 45 ? .22 : distance > 24 ? .55 : 1) * (this.frame > .085 ? .55 : this.frame > .045 ? .75 : 1)
    this.gain = gain
    for (let i=0;i<this.records.length;i++) {
      const r=this.records[i], socket=this.sockets.exhausts[i]
      r.previous.copy(r.current); r.previousQ.copy(r.currentQ)
      socket.mesh.updateWorldMatrix(true,false); r.current.copy(socket.localPosition).applyMatrix4(socket.mesh.matrixWorld)
      // Keep the real mouth position, but send riding steam parallel to the
      // ground instead of following the silencer's upward rake or bike pitch.
      r.direction.copy(socket.localDirection).transformDirection(socket.mesh.matrixWorld)
      r.direction.y=0; r.direction.normalize(); r.currentQ.setFromUnitVectors(axis,r.direction)
      if (!r.initialized || r.previous.distanceToSquared(r.current)>225) { r.previous.copy(r.current); r.previousQ.copy(r.currentQ) }
      r.initialized=true
      // Match actual rendered nozzle motion. The driving simulation caps long
      // frames separately; using speed*wall-time can push exhaust into the bike.
      r.inertia.copy(r.current).sub(r.previous).multiplyScalar(this.duration>0?1/this.duration:0)
      r.inertia.y=0
      r.quota=Math.floor(48*gain); r.opacity=config.exhaustOpacity; r.size=config.exhaustSize
      const t=config.exhaustTurbulence*2.5; r.turbulence.velocityMultiplier.set(t,t*.6,t)
      r.system.emitter.visible=config.exhaustEnabled
      if(r.system.particleNum>r.quota){r.system.particleNum=r.quota;if(dt===0)this.batch.update()}
    }
  }
  beforeStep(dt) {
    if (!this.config) return
    this.elapsed+=dt
    const fraction=this.duration>0?clamp(this.elapsed/this.duration,0,1):1
    for(const r of this.records){
      const envelope=r.cycle.update(dt,this.moving,this.throttle,this.acceleration), ps=r.system, remaining=Math.max(0,r.quota-ps.particleNum)
      const desired=envelope*(75+r.cycle.power*110)*this.config.exhaustIntensity*this.gain
      r.desired=desired
      r.speed.a=6+r.cycle.power*5; r.speed.b=9+r.cycle.power*8
      r.life.a=.16+r.cycle.power*.04; r.life.b=.24+r.cycle.power*.1
      ps.emitter.position.lerpVectors(r.previous,r.current,fraction);ps.emitter.quaternion.slerpQuaternions(r.previousQ,r.currentQ,fraction);ps.emitter.updateWorldMatrix(true,false)
      ps.emissionState.waitEmiting=desired>0?Math.min(ps.emissionState.waitEmiting,remaining):0
      r.rate.value=dt>0?Math.min(desired,Math.max(0,remaining-Math.ceil(ps.emissionState.waitEmiting))/dt):0
    }
  }
  dispose(){this.material.dispose();this.geometry.dispose();this.atlas.dispose()}
}
