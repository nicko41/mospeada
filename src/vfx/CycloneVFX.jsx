import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { VFXRuntime } from './VFXRuntime.js'
import { DustTrail } from './DustTrail.js'
import { WheelEjecta } from './WheelEjecta.js'
import { EngineSmoke } from './EngineSmoke.js'
import { ArmorBoost } from './ArmorBoost.js'
import { engineVFXState } from './engineVFXState.js'
import { vfxState } from './vfxState.js'
import { timeOfDayState } from '../world/TimeOfDay.jsx'
import { weatherState } from '../world/weatherState.js'
import {Vector3,SRGBColorSpace,LinearFilter} from 'three'
import {useTexture} from '@react-three/drei'
import {activeEnvironment} from '../world/environmentConfig.js'
import {ForestWheelFX} from '../world/forest/forestWheelFX.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {WheelTracks} from './WheelTracks.js'
import {sampleRideHeight} from '../vehicle/rideSurface.js'
import groundExplosionUrl from '../../assets/texturas/explosion-piso.png'
import airExplosionUrl from '../../assets/texturas/explosion-aire.png'
import terrainImpactUrl from '../../assets/texturas/impascto-invid-suelo.png'

const forest=activeEnvironment==='forest',grassUrl='/foliage/forest/wheel-fragments.png'
if(forest)useTexture.preload([grassUrl,groundExplosionUrl,airExplosionUrl,terrainImpactUrl])
export default function CycloneVFX(props){return forest?<ForestCycloneVFX {...props}/>:<CycloneVFXInstance {...props}/>}
function ForestCycloneVFX(props){const [atlas,ground,air,terrain]=useTexture([grassUrl,groundExplosionUrl,airExplosionUrl,terrainImpactUrl]);return <CycloneVFXInstance {...props} grassAtlas={atlas} groundExplosionAtlas={ground} airExplosionAtlas={air} terrainImpactAtlas={terrain}/>}
function CycloneVFXInstance({ rig, runtime,grassAtlas=null,groundExplosionAtlas=null,airExplosionAtlas=null,terrainImpactAtlas=null }) {
  const { scene } = useThree(), current = useRef(null)
  useLayoutEffect(() => {
    const vfx = new VFXRuntime(), dust = vfx.register('cyclone.dust', new DustTrail())
    const randDust=forest?vfx.register('rand.dust',new DustTrail({shared:dust})):null
    if(randDust)randDust.system.emitter.name='Rand_rear_dust_emitter'
    const ejecta = vfx.register('cyclone.wheel-ejecta', new WheelEjecta({grassAtlas}))
    const engine = vfx.register('cyclone.engine-smoke', new EngineSmoke(rig))
    const armorBoost = vfx.register('cyclone.armor-boost',new ArmorBoost())
    for(const texture of [groundExplosionAtlas,airExplosionAtlas,terrainImpactAtlas])if(texture){texture.colorSpace=SRGBColorSpace;texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true}
    const combat=vfx.register('gallant.combat',new Plano3CombatVFX({explosionAtlases:{ground:groundExplosionAtlas,air:airExplosionAtlas,terrain:terrainImpactAtlas},sampleGround:sampleRideHeight}))
    const tracks=vfx.register('cyclone.wheel-tracks',new WheelTracks(sampleRideHeight))
    runtime.combatVFX=combat
    const wash={front:{position:new Vector3(),normal:new Vector3(0,1,0),forward:new Vector3(),radius:.2},rear:{position:new Vector3(),normal:new Vector3(0,1,0),forward:new Vector3(),radius:.2}}
    const surfaceFX=forest?new ForestWheelFX():null
    scene.add(vfx.root); current.current = { vfx, dust,randDust, ejecta, engine, armorBoost, tracks, wash,surfaceFX,randSurfaceFX:forest?new ForestWheelFX():null,randTracks:{enabled:false},randDustConfig:{},sharedDustConfig:{},publish: 0 }
    if (import.meta.env.DEV) window.__MOSPEADA_VFX__ = { vfx, dust,randDust, ejecta, engine, armorBoost,tracks,surfaceFX, store: vfxState, engineStore: engineVFXState }
    return () => { if(runtime.combatVFX===combat)delete runtime.combatVFX;vfx.dispose(); current.current = null; if (import.meta.env.DEV) delete window.__MOSPEADA_VFX__ }
  }, [scene, rig,grassAtlas,groundExplosionAtlas,airExplosionAtlas,terrainImpactAtlas])
  useFrame(({ camera }, delta) => {
    const effect = current.current, state = runtime.state, wheel = runtime.weathering?.contacts.wheels.rear
    if (!effect || !state || !wheel) return
    if(effect.state!==state){effect.state=state;effect.tracks.clear()}
    const recovery=runtime.levelProgress?.recoveries||0
    if(effect.recovery!==recovery){effect.recovery=recovery;effect.dust.clear();effect.randDust?.clear();effect.ejecta.clear()}
    const dt = runtime.paused ? 0 : Math.min(delta, .25)
    const armor=runtime.armorController,a=armor?.active?armor.state:null
    let contacts=runtime.weathering.contacts.wheels,vfxMotion=state,dustWheel=wheel
    if(a&&!effect.surfaceFX){
      for(const [i,w]of Object.values(effect.wash).entries()){
        w.position.set(a.x+(i?1:-1)*.3*Math.cos(a.yaw),a.ground,a.z-(i?1:-1)*.3*Math.sin(a.yaw));w.forward.set(Math.sin(a.yaw),0,Math.cos(a.yaw));w.surface=a.surface;w.grounded=a.height<1.5&&a.lift>.05
      }
      contacts=effect.wash;dustWheel=contacts.rear
      vfxMotion={...state,speed:Math.max(a.speed,a.lift*5),acceleration:Math.max(0,a.ay),rearLateralVelocity:a.localSide,frontAngularSpeed:0,rearAngularSpeed:0,slip:0,handbrake:0}
    }
    let wheelConfigs=null,dustConfig=vfxState.snapshot()
    if(effect.surfaceFX){
      const phase=runtime.transformEntry?.phase||'idle',enabled=!a&&state.riderMode==='mounted'&&phase==='idle'
      const surface=effect.surfaceFX.update(dt,contacts,dustConfig,enabled)
      if(surface.clearRequested){effect.dust.clear();effect.ejecta.clear()}
      contacts=surface.wheels;dustWheel=contacts.rear;wheelConfigs=surface.configs;dustConfig=wheelConfigs.rear
      if(dustWheel.biome==='desert')dustConfig.emission*=1+Math.min(1.5,(state.landingImpact||0)/10)*.7
    }
    const trackEnabled=!a&&state.riderMode==='mounted'&&(runtime.transformEntry?.phase||'idle')==='idle'
    const trackCenter=a||((state.dismountBlend>.8&&state.pedestrian)||state)
    const rand=runtime.randWeathering,randActive=!!rand?.escape.active,randState=randActive?rand.escape.state:null
    if(effect.randState!==randState){effect.randState=randState;effect.randDust?.clear();effect.tracks.breakTrail(effect.tracks.otherHistory)}
    effect.randTracks.enabled=false
    if(effect.randDust){
      const randLimit=Math.min(192,Math.floor(vfxState.snapshot().maximum*.3))
      if(randActive){
        const surface=effect.randSurfaceFX.update(dt,rand.contacts.wheels,vfxState.snapshot(),randState.riderMode==='mounted')
        Object.assign(effect.randTracks,{state:randState,wheels:rand.contacts.wheels,configs:surface.configs,enabled:randState.riderMode==='mounted'})
        Object.assign(effect.randDustConfig,surface.configs.rear,{maximum:randLimit})
        if(surface.wheels.rear.biome==='desert')effect.randDustConfig.emission*=1+Math.min(1.5,(randState.landingImpact||0)/10)*.7
        effect.randDust.prepare(surface.wheels.rear,randState,effect.randDustConfig,camera.position.distanceTo(rand.rig.root.position),timeOfDayState.value,delta)
      }else{
        effect.randDust.stopEmission();effect.randDust.response.budget=Math.min(effect.randDust.response.budget,randLimit)
      }
    }
    effect.tracks.update(dt,runtime.weathering.contacts.wheels,state,wheelConfigs||dustConfig,trackEnabled,timeOfDayState.value,trackCenter,effect.randTracks.enabled?effect.randTracks:null)
    effect.ejecta.prepare(dt,contacts,vfxMotion,vfxState.snapshot(),a?Math.max(weatherState.rainIntensity,vfxState.snapshot().humidity*.5):weatherState.rainIntensity,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta,wheelConfigs)
    const engineConfig=engineVFXState.snapshot()
    effect.engine.prepare(dt,state,runtime.input,a?{...engineConfig,exhaustEnabled:false,boostEnabled:false}:engineConfig,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta)
    effect.armorBoost.prepare(dt,runtime.transformEntry,runtime.rearTransformation,camera.position.distanceTo(rig.root.position),engineConfig.boostEnabled,armor,runtime.wheelTransformation)
    // Both emitters share the original particle budget, atlas and Quarks draw.
    // Configure Rand first; only Scott's update integrates the shared runtime.
    const reserved=effect.randDust?(effect.randDust.response.rate>0?effect.randDust.response.budget:Math.min(effect.randDust.response.budget,effect.randDust.system.particleNum)):0
    Object.assign(effect.sharedDustConfig,dustConfig,{maximum:Math.max(0,dustConfig.maximum-reserved)})
    effect.dust.update(dt,dustWheel,vfxMotion,effect.sharedDustConfig,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta,effect.vfx,effect.randDust)
    effect.publish += delta
    if (effect.publish > .2) {
      effect.publish = 0
      vfxState.set({ active: effect.dust.system.particleNum+(effect.randDust?.system.particleNum||0), budget: effect.dust.response.budget+reserved, rate: effect.dust.response.rate+(effect.randDust?.response.rate||0), rearSurface: dustConfig.surfaceName||wheel.surface, grounded: dustWheel.grounded,grassActive:effect.ejecta.records.filter(r=>r.type==='grass').reduce((n,r)=>n+r.system.particleNum,0), ejectaActive: effect.ejecta.systems.reduce((n, ps) => n + ps.particleNum, 0), ejectaBudget: effect.ejecta.budget })
      engineVFXState.set({ exhaustActive: effect.engine.records.filter(r => r.kind === 'exhaust').reduce((n, r) => n + r.system.particleNum, 0) + effect.engine.riding.systems.reduce((n, ps) => n + ps.particleNum, 0), boostActive: effect.engine.records.filter(r => r.kind !== 'exhaust').reduce((n, r) => n + r.system.particleNum, 0)+effect.armorBoost.systems.reduce((n,ps)=>n+ps.particleNum,0), boosting: a?a.boostBlend>.1:effect.engine.boosting })
    }
  }, -.4)
  return null
}
