const dirt=Object.freeze({humidity:.30,dustEmission:1.70,dustSize:1.25,dustLife:1,dustLaunch:1,mudEmission:1,mudSize:1,mudLife:1,mudLaunch:1,grassEmission:0,grassSize:1,grassLife:.45,grassLaunch:.65,grassGravity:10})
const grass=Object.freeze({humidity:.30,dustEmission:.35,dustSize:.65,dustLife:.7,dustLaunch:.8,mudEmission:1.45,mudSize:1.8,mudLife:1.05,mudLaunch:1.1,grassEmission:1,grassSize:1,grassLife:.45,grassLaunch:.65,grassGravity:10})
const desertDust=Object.freeze({low:'#ca9869',high:'#efce9b',lowOpacity:.50,highOpacity:.70})
export const DESERT_WHEEL_FX=Object.freeze({humidity:.08,emission:2.8,size:1.4,life:1.65,gravity:.22,drag:1.8,wind:.55,turbulence:.32,continuousTrail:true,dustPalette:desertDust,mudEnabled:false,grassEnabled:false,surfaceName:'dirt'})
export const FOREST_WHEEL_FX_DEFAULTS=Object.freeze({transitionSeconds:.22,grassEnabled:true,dirt,grass})
const presetKeys=Object.keys(dirt)
let value={...FOREST_WHEEL_FX_DEFAULTS},listeners=new Set()
export const forestWheelFXState={defaults:FOREST_WHEEL_FX_DEFAULTS,snapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},setPreset(name,values){if(!['dirt','grass'].includes(name))return;const next={...value[name]};for(const [key,v]of Object.entries(values))if(key in next)next[key]=Math.max(0,Math.min(key==='humidity'?1:key==='grassGravity'?25:4,Number(v)||0));value={...value,[name]:next};listeners.forEach(fn=>fn())},set(values){value={...value,...values};listeners.forEach(fn=>fn())},reset(){value={...FOREST_WHEEL_FX_DEFAULTS};listeners.forEach(fn=>fn())}}

// Reused per-wheel views/configs. The suspension and accumulation contacts keep
// their original surface/friction tags; this layer changes visual FX only.
export class ForestWheelFX{
  constructor(){this.wheels={front:{},rear:{}};this.configs={front:{},rear:{}};this.blend={front:0,rear:0};this.initialized={};this.position={front:{x:Infinity,z:Infinity},rear:{x:Infinity,z:Infinity}};this.wasEnabled=true}
  update(dt,contacts,base,enabled=true,settings=forestWheelFXState.snapshot()){
    for(const side of ['front','rear']){
      const contact=contacts[side],forest=contact.biome==='forest',target=forest?1-contact.earthWeight:0
      const last=this.position[side],teleport=Math.hypot(contact.position.x-last.x,contact.position.z-last.z)>12
      if(!this.initialized[side]||teleport){this.blend[side]=target;this.initialized[side]=true}
      else this.blend[side]+=(target-this.blend[side])*(1-Math.exp(-Math.min(dt,.25)/Math.max(.03,settings.transitionSeconds)))
      last.x=contact.position.x;last.z=contact.position.z
      if(Math.abs(target-this.blend[side])<.001)this.blend[side]=target
      const t=Math.max(0,Math.min(1,this.blend[side])),config=this.configs[side],view=this.wheels[side]
      Object.assign(view,contact,{grounded:contact.grounded&&enabled})
      Object.assign(config,base,{forestWheelFX:forest,grassWeight:forest?t:0,grassEnabled:forest&&settings.grassEnabled,surfaceName:contact.surface,dustPalette:null,continuousTrail:false})
      if(forest){for(const key of presetKeys)config[key]=t===0?settings.dirt[key]:t===1?settings.grass[key]:settings.dirt[key]+(settings.grass[key]-settings.dirt[key])*t;config.emission=config.dustEmission;config.size=config.dustSize;config.life=config.dustLife;config.surfaceName=t>.5?'grass':'dirt'}
      else if(contact.biome==='desert')Object.assign(config,DESERT_WHEEL_FX)
    }
    this.clearRequested=this.wasEnabled&&!enabled;this.wasEnabled=enabled
    return this
  }
}
