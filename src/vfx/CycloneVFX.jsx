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
import {Vector3} from 'three'
import {useTexture} from '@react-three/drei'
import {activeEnvironment} from '../world/environmentConfig.js'
import {ForestWheelFX} from '../world/forest/forestWheelFX.js'

const forest=activeEnvironment==='forest',grassUrl='/foliage/forest/wheel-fragments.png'
if(forest)useTexture.preload(grassUrl)
export default function CycloneVFX(props){return forest?<ForestCycloneVFX {...props}/>:<CycloneVFXInstance {...props}/>}
function ForestCycloneVFX(props){const atlas=useTexture(grassUrl);return <CycloneVFXInstance {...props} grassAtlas={atlas}/>}
function CycloneVFXInstance({ rig, runtime,grassAtlas=null }) {
  const { scene } = useThree(), current = useRef(null)
  useLayoutEffect(() => {
    const vfx = new VFXRuntime(), dust = vfx.register('cyclone.dust', new DustTrail())
    const ejecta = vfx.register('cyclone.wheel-ejecta', new WheelEjecta({grassAtlas}))
    const engine = vfx.register('cyclone.engine-smoke', new EngineSmoke(rig))
    const armorBoost = vfx.register('cyclone.armor-boost',new ArmorBoost())
    const wash={front:{position:new Vector3(),normal:new Vector3(0,1,0),forward:new Vector3(),radius:.2},rear:{position:new Vector3(),normal:new Vector3(0,1,0),forward:new Vector3(),radius:.2}}
    const surfaceFX=forest?new ForestWheelFX():null
    scene.add(vfx.root); current.current = { vfx, dust, ejecta, engine, armorBoost, wash,surfaceFX,publish: 0 }
    if (import.meta.env.DEV) window.__MOSPEADA_VFX__ = { vfx, dust, ejecta, engine, armorBoost,surfaceFX, store: vfxState, engineStore: engineVFXState }
    return () => { vfx.dispose(); current.current = null; if (import.meta.env.DEV) delete window.__MOSPEADA_VFX__ }
  }, [scene, rig,grassAtlas])
  useFrame(({ camera }, delta) => {
    const effect = current.current, state = runtime.state, wheel = runtime.weathering?.contacts.wheels.rear
    if (!effect || !state || !wheel) return
    const recovery=runtime.levelProgress?.recoveries||0
    if(effect.recovery!==recovery){effect.recovery=recovery;effect.dust.clear();effect.ejecta.clear()}
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
    }
    effect.ejecta.prepare(dt,contacts,vfxMotion,vfxState.snapshot(),a?Math.max(weatherState.rainIntensity,vfxState.snapshot().humidity*.5):weatherState.rainIntensity,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta,wheelConfigs)
    const engineConfig=engineVFXState.snapshot()
    effect.engine.prepare(dt,state,runtime.input,a?{...engineConfig,exhaustEnabled:false,boostEnabled:false}:engineConfig,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta)
    effect.armorBoost.prepare(dt,runtime.transformEntry,runtime.rearTransformation,camera.position.distanceTo(rig.root.position),engineConfig.boostEnabled,armor,runtime.wheelTransformation)
    effect.dust.update(dt,dustWheel,vfxMotion,dustConfig,camera.position.distanceTo(rig.root.position),timeOfDayState.value,delta,effect.vfx)
    effect.publish += delta
    if (effect.publish > .2) {
      effect.publish = 0
      vfxState.set({ active: effect.dust.system.particleNum, budget: effect.dust.response.budget, rate: effect.dust.response.rate, rearSurface: dustConfig.surfaceName||wheel.surface, grounded: dustWheel.grounded,grassActive:effect.ejecta.records.filter(r=>r.type==='grass').reduce((n,r)=>n+r.system.particleNum,0), ejectaActive: effect.ejecta.systems.reduce((n, ps) => n + ps.particleNum, 0), ejectaBudget: effect.ejecta.budget })
      engineVFXState.set({ exhaustActive: effect.engine.records.filter(r => r.kind === 'exhaust').reduce((n, r) => n + r.system.particleNum, 0) + effect.engine.riding.systems.reduce((n, ps) => n + ps.particleNum, 0), boostActive: effect.engine.records.filter(r => r.kind !== 'exhaust').reduce((n, r) => n + r.system.particleNum, 0)+effect.armorBoost.systems.reduce((n,ps)=>n+ps.particleNum,0), boosting: a?a.boostBlend>.1:effect.engine.boosting })
    }
  }, -.4)
  return null
}
