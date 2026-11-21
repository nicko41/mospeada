import { Color, MeshBasicMaterial, PlaneGeometry, Vector3, UniformsLib, UniformsUtils,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter } from 'three'
import { ApplyForce, ColorOverLife, ColorRange, ConeEmitter, ConstantValue, Gradient, IntervalValue, LimitSpeedOverLife, ParticleSystem, RenderMode, RotationOverLife, Vector3 as QVec3, Vector4 as QVec4 } from 'three.quarks'
import { createEjectaAtlas } from './ejectaAtlas.js'
import { ejectaResponse } from './ejectaResponse.js'

const axis = new Vector3(0, 0, 1)
function color(hex, alpha) { const c = new Color(hex); return new QVec4(c.r, c.g, c.b, alpha) }

// Quarks retains ownership of integration, lifecycle, pooled particles and GPU
// buffers. This behavior adds inherited wheel velocity and a local collision
// plane; no scene raycasts or individual meshes are created per particle.
class WheelContactBehavior {
  type = 'MOSPEADA_WheelContact'
  constructor(record, owner) { this.record = record; this.owner = owner }
  initialize(p) {
    const r = this.record
    p.velocity.add(r.inertia)
    p.floorX = p.position.x; p.floorY = p.position.y - .025; p.floorZ = p.position.z
    p.slopeX = -r.normal.x / Math.max(.3, r.normal.y); p.slopeZ = -r.normal.z / Math.max(.3, r.normal.y)
    p.bounces = 0
    p.gravityScatter=r.type==='grass'?(Math.random()-.5)*4:r.type==='mud'&&r.config?.forestWheelFX?(Math.random()-.5)*4*r.config.grassWeight:0
    if (r.type !== 'water') { p.startSize.x *= .7 + Math.random() * .6; p.startSize.y *= .6 + Math.random() * .6; p.size.copy(p.startSize) }
    this.owner.emitted[r.type]++; this.owner.emitted[r.side]++
  }
  update(p,dt) {
    p.velocity.y-=(p.gravityScatter||0)*dt
    const floor = p.floorY + (p.position.x - p.floorX) * p.slopeX + (p.position.z - p.floorZ) * p.slopeZ
    if (p.position.y < floor + .008 && p.velocity.y < 0) {
      p.position.y = floor + .008
      if (this.record.type === 'earth' && p.bounces === 0) {
        p.velocity.y *= -.22; p.velocity.x *= .5; p.velocity.z *= .5; p.bounces++
        this.owner.bounces++
      } else { p.age = p.life }
    }
  }
  frameUpdate() {}
  reset() {}
  clone() { return new WheelContactBehavior(this.record, this.owner) }
  toJSON() { return { type: this.type } }
}

export class WheelEjecta {
  constructor({grassAtlas=null}={}) {
    this.geometry = new PlaneGeometry(1, 1)
    this.waterAtlas = createEjectaAtlas(true); this.soilAtlas = createEjectaAtlas(false)
    this.waterMaterial = new MeshBasicMaterial({ map: this.waterAtlas, transparent: true, depthWrite: false, alphaTest: .002 })
    this.soilMaterial = new MeshBasicMaterial({ map: this.soilAtlas, transparent: true, depthWrite: false, alphaTest: .01 })
    if(grassAtlas){grassAtlas.colorSpace=SRGBColorSpace;grassAtlas.minFilter=LinearMipmapLinearFilter;grassAtlas.magFilter=LinearFilter;grassAtlas.generateMipmaps=true;grassAtlas.needsUpdate=true;this.grassMaterial=new MeshBasicMaterial({map:grassAtlas,transparent:true,depthWrite:false,alphaTest:.03})}
    this.day = { value: 1 }; this.records = []; this.systems = []; this.batches = new Set()
    this.emitted = { water: 0, earth: 0, mud: 0,grass:0, front: 0, rear: 0 }; this.bounces = 0; this.elapsed = 0; this.frame = 1 / 60
    for (const type of ['water', 'earth', 'mud',...(grassAtlas?['grass']:[])]) for (const side of ['front', 'rear']) {
      const r = { type, side, normal: new Vector3(0, 1, 0), inertia: new Vector3(), direction: new Vector3(), previous: new Vector3(), current: new Vector3(), rate: new ConstantValue(0), speed: new IntervalValue(1, 2), initialized: false }
      const water = type === 'water', earth = type === 'earth'
      const grass=type==='grass'
      r.life=new IntervalValue(grass?.22:water?.28:.3,grass?.45:water?.5:earth?.8:.6);r.size=new IntervalValue(grass?.04:water?.022:earth?.022:.026,grass?.11:water?.038:earth?.05:.065)
      r.baseSize=[r.size.a,r.size.b];r.baseLife=[r.life.a,r.life.b];r.gravity=new ApplyForce(new QVec3(0,-1,0),new ConstantValue(grass?10:water?13:earth?11:18))
      const ps = new ParticleSystem({
        duration: 30, looping: true, prewarm: false, autoDestroy: false, worldSpace: true,
        shape: new ConeEmitter({ radius: .035, angle: water ? .6 : .45 }),
        startLife:r.life,startSpeed:r.speed,startSize:r.size,
        startRotation: new IntervalValue(-Math.PI, Math.PI), startTileIndex: new IntervalValue(0, 4),
        startColor: new ColorRange(color(grass?'#dddddd':water ? '#b5d5df' : earth ? '#89765b' : '#493923', water ? .3 : .72), color(grass?'#ffffff':water ? '#d2e4e9' : earth ? '#b3a080' : '#796044', water ? .6 : .94)),
        emissionOverTime: r.rate, emissionOverDistance: new ConstantValue(0), emissionBursts: [],
        material:grass?this.grassMaterial:water ? this.waterMaterial : this.soilMaterial, instancingGeometry: this.geometry,
        renderMode: water ? RenderMode.StretchedBillBoard : RenderMode.BillBoard,
        rendererEmitterSettings: water ? { speedFactor: .3, lengthFactor: .5 } : {},
        uTileCount: 2, vTileCount: 2, blendTiles: false, renderOrder: 2,
        behaviors: [r.gravity,
          new LimitSpeedOverLife(new ConstantValue(0), (water ? 1.7 : .65) / 20),
          new ColorOverLife(new Gradient([[new QVec3(1, 1, 1), 0], [new QVec3(1, 1, 1), 1]], [[0, 0], [1, .035], [.8, .5], [0, 1]])),
          new RotationOverLife(new IntervalValue(-2, 2)), new WheelContactBehavior(r, this)],
      })
      ps.emitter.name = `Quarks_${type}_${side}_wheel`; r.system = ps
      this.records.push(r); this.systems.push(ps)
    }
  }
  configureBatches(renderer) {
    for (const r of this.records) {
      const batch = renderer.batches[renderer.systemToBatchIndex.get(r.system)]
      r.batch = batch
      if (this.batches.has(batch)) continue
      this.batches.add(batch)
      const material = batch.material
      material.name = r.type==='grass'?'Quarks original anime leaf fragments':r.type === 'water' ? 'Quarks water spray' : 'Quarks earth and mud'
      material.fog = true
      Object.assign(material.uniforms, UniformsUtils.clone(UniformsLib.fog), { uEjectaDay: this.day })
      material.onBeforeCompile = shader => {
        shader.vertexShader = '#include <fog_pars_vertex>\n' + shader.vertexShader.replace('#include <logdepthbuf_vertex>', '#include <logdepthbuf_vertex>\n#include <fog_vertex>')
        shader.fragmentShader = 'uniform float uEjectaDay;\n#include <fog_pars_fragment>\n' + shader.fragmentShader.replace('outgoingLight = diffuseColor.rgb;', 'outgoingLight = diffuseColor.rgb * mix(.24, 1.0, uEjectaDay);').replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>')
      }
      material.customProgramCacheKey = () => 'mospeada-quarks-ejecta-v1'
      material.needsUpdate = true; batch.name = r.type==='grass'?'Quarks_grass_fragments_batch':r.type === 'water' ? 'Quarks_water_batch' : 'Quarks_earth_mud_batch'; batch.userData.vfx = 'ejecta';batch.castShadow=false
    }
  }
  prepare(dt, wheels, state, config, rain, distance, day, frameSeconds,wheelConfigs=null) {
    this.day.value = day; this.elapsed = 0; this.duration = Math.min(dt, .25)
    this.frame += (Math.min(frameSeconds, .3) - this.frame) * .05
    const responses={front:ejectaResponse(wheels.front,state,'front',wheelConfigs?.front||config,rain,distance,this.frame),rear:ejectaResponse(wheels.rear,state,'rear',wheelConfigs?.rear||config,rain,distance,this.frame)}
    for (const r of this.records) {
      const w = wheels[r.side], response = responses[r.side],settings=wheelConfigs?.[r.side]||config
      r.config=settings
      r.previous.copy(r.current); r.current.copy(w.position).addScaledVector(w.normal, .025); r.normal.copy(w.normal)
      if (!r.initialized || r.surface !== w.surface || r.previous.distanceToSquared(r.current) > 144) r.previous.copy(r.current)
      r.initialized = true; r.surface = w.surface; r.response = response; r.desired = response[r.type]
      const lateral = r.side === 'rear' ? state.rearLateralVelocity || 0 : Math.sin(state.slip || 0) * state.speed * .4
      r.direction.copy(w.forward).multiplyScalar(state.speed < 0 ? 1 : -1)
      r.direction.x -= Math.cos(state.yaw) * lateral * .12; r.direction.z += Math.sin(state.yaw) * lateral * .12
      r.direction.y = r.type==='grass'?.45:r.type === 'water' ? .3 : r.type === 'earth' ? .8 : .65; r.direction.normalize()
      r.inertia.copy(w.forward).multiplyScalar(state.speed * (r.type==='grass'?.035:r.type==='mud'&&settings.forestWheelFX?.08-.02*settings.grassWeight:.08))
      r.inertia.x -= Math.cos(state.yaw) * lateral * .2; r.inertia.z += Math.sin(state.yaw) * lateral * .2
      const size=settings.forestWheelFX?(r.type==='mud'?settings.mudSize:r.type==='grass'?settings.grassSize:1):1,life=settings.forestWheelFX?(r.type==='mud'?settings.mudLife:r.type==='grass'?settings.grassLife/.45:1):1,launch=settings.forestWheelFX?(r.type==='mud'?settings.mudLaunch:r.type==='grass'?settings.grassLaunch:1):1
      r.size.a=r.baseSize[0]*size;r.size.b=r.baseSize[1]*size;r.life.a=r.baseLife[0]*life;r.life.b=r.baseLife[1]*life
      if(r.type==='grass')r.gravity.magnitude.value=settings.grassGravity||10
      r.speed.a = response.launch * .7*launch; r.speed.b = response.launch * 1.3*launch
      r.system.emitterShape.angle = (r.type === 'water' ? .6 : .42) + response.slide * .12
      const trimmed = r.system.particleNum > response.quota
      if (trimmed) { r.system.particleNum = response.quota; if (dt === 0) r.batch.update() }
      r.system.emitter.visible = settings[r.type + 'Enabled']
    }
    this.active = this.systems.reduce((n, ps) => n + ps.particleNum, 0)
    this.budget = this.records.reduce((n,r)=>n+r.response.quota,0)
  }
  beforeStep(dt) {
    this.elapsed += dt
    const t = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1
    for (const r of this.records) {
      if (!r.response) continue
      const ps = r.system, remaining = Math.max(0, r.response.quota - ps.particleNum)
      ps.emitter.position.lerpVectors(r.previous, r.current, t)
      ps.emitter.quaternion.setFromUnitVectors(axis, r.direction); ps.emitter.updateWorldMatrix(true, false)
      ps.emissionState.waitEmiting = r.desired > 0 ? Math.min(ps.emissionState.waitEmiting, remaining) : 0
      r.rate.value = dt > 0 ? Math.min(r.desired, Math.max(0, remaining - Math.ceil(ps.emissionState.waitEmiting)) / dt) : 0
    }
  }
  clear(){for(const r of this.records){r.system.particleNum=0;r.system.emissionState.waitEmiting=0;r.rate.value=r.desired=0}for(const batch of this.batches)batch.update()}
  dispose() { this.geometry.dispose(); this.waterAtlas.dispose(); this.soilAtlas.dispose(); this.waterMaterial.dispose(); this.soilMaterial.dispose();this.grassMaterial?.dispose() }
}
