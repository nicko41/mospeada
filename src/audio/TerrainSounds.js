const clamp=value=>Math.max(0,Math.min(1,value))
const passes=['terrainDirtPass','terrainGrassPass']

// Use the same ground tags and forest earth/pasture blend as wheel VFX.
export function terrainSoundMix(wheels){
  let dirt=0,grass=0
  for(const wheel of [wheels?.front,wheels?.rear]){
    if(!wheel?.grounded)continue
    if(wheel.biome==='desert'||['sand','desert'].includes(wheel.surface))dirt+=.5
    else if(wheel.surface==='grass'||wheel.biome==='grass')grass+=.5
    else if(['dirt','mud'].includes(wheel.surface)){
      const pasture=wheel.biome==='forest'?1-clamp(wheel.earthWeight??1):0
      grass+=pasture*.5;dirt+=(1-pasture)*.5
    }
  }
  return {terrainDirtPass:dirt,terrainGrassPass:grass}
}

export class TerrainSounds{
  constructor(audio){this.audio=audio;this.loops={};this.actor=null;this.drift=null;this.driftPlayed=false;this.gains={}}
  update({state,wheels,input={},enabled=true,paused=false}){
    if(this.actor!==state){this.actor=state;this.driftPlayed=false;if(this.drift)this.audio.stop(this.drift,.05);this.drift=null}
    const held=!!input.handbrake,active=!!state&&enabled&&!paused&&!state.airborne
    if(!held)this.driftPlayed=false
    if(!active&&held)this.driftPlayed=true
    const mix=terrainSoundMix(wheels),speed=Math.abs(state?.speed||0),moving=clamp((speed-.15)/1.5)
    for(const name of passes){
      const gain=active?mix[name]*moving:0
      this.gains[name]=gain
      if(gain>0&&!this.loops[name])this.loops[name]=this.audio.play(name,{loop:true,gain:0})
      if(this.loops[name])this.audio.modulate(this.loops[name],{gain,timeConstant:paused?.015:.07})
    }
    // A handbrake gesture emits one finite skid, never a repeating loop or a
    // per-frame restart. Standstill burnout has no rolling/handbrake audio.
    const ground=mix.terrainDirtPass+mix.terrainGrassPass
    const skidding=active&&held&&speed>.5&&state.handbrake>.1&&ground>0
    if(this.drift&&!skidding){this.audio.stop(this.drift,.06);this.drift=null}
    if(skidding&&!this.driftPlayed){
      this.drift=this.audio.play('terrainDirtDrift',{gain:ground,fadeIn:.015})
      if(this.drift)this.driftPlayed=true
    }
  }
  dispose(){for(const source of Object.values(this.loops))this.audio.stop(source,0);if(this.drift)this.audio.stop(this.drift,0);this.loops={};this.drift=null}
}
