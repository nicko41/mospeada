import {Color,FogExp2,MathUtils} from 'three'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'

export const DESERT_HAZE=Object.freeze({
  enabled:true,color:'#e0cbb0',start:950,falloff:2850,density:1,
  skyBlend:.12,horizonStrength:.48,horizonHeight:.085,blur:2.5,transition:340,
})

// Keep the world's FOG_EXP2 program signature. The Anime shader's shared
// uniforms select smooth distance haze without recompiling on zone entry.
// Density scales the falloff in metres, leaving the foreground untouched.
export class DesertClimaxAtmosphere{
  constructor(settings={}){
    this.settings={...DESERT_HAZE,...settings};this.fog=new FogExp2(DESERT_HAZE.color,.0006)
    this.fog.near=850;this.fog.far=3500
    this.fog.desertHaze={blur:0}
    this.color=new Color();this.previous=null
    this.horizon={color:new Color(),strength:0,height:DESERT_HAZE.horizonHeight}
  }
  restore(scene){if(this.previous){if(scene.fog===this.fog)scene.fog=this.previous;this.previous=null}this.horizon.strength=0}
  update(scene,world,distance,day,sky){
    const s=this.settings
    if(!s.enabled||s.density<=0||!world?.bound||!world.climaxPlain||distance<C.start)return
    const blend=MathUtils.smoothstep(distance,C.start,C.start+Math.max(1,s.transition))
    this.previous=scene.fog
    this.color.set(s.color).lerp(sky,MathUtils.clamp(s.skyBlend,0,1))
    this.fog.color.copy(scene.fog.color).lerp(this.color,blend*MathUtils.clamp(day,0,1))
    // Approximate the preceding .0006 exponential fog at the entrance, then
    // reveal a clean foreground gradually over the existing desert descent.
    this.fog.near=MathUtils.lerp(0,Math.max(0,s.start),blend)
    this.fog.far=MathUtils.lerp(3000,Math.max(0,s.start)+Math.max(1,s.falloff)/s.density,blend)
    this.fog.far=Math.max(this.fog.near+1,this.fog.far)
    this.fog.desertHaze.blur=Math.max(0,s.blur)*blend
    scene.fog=this.fog
    this.horizon.color.copy(this.fog.color);this.horizon.strength=MathUtils.clamp(s.horizonStrength,0,1)*blend
    this.horizon.height=Math.max(.001,s.horizonHeight)
  }
}
