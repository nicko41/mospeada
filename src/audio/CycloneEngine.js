import {engineAudioState} from './engineAudioState.js'

const clamp=value=>Math.max(0,Math.min(1,value))
const damp=(from,to,dt,time)=>from+(to-from)*(1-Math.exp(-dt/Math.max(.01,time)))
const mix=(min,max,value)=>min+(max-min)*value

// Audio-only model: no writes to the physical vehicle state.
export class EngineRPM{
  constructor(){this.reset()}
  reset(){this.rpm=0;this.airborneBlend=0}
  update(dt,{state,input={},speedReference=60},config){
    const speed=Math.abs(state.speed||0),speedLoad=clamp(speed/Math.max(1,speedReference))
    const braking=!!(input.brake||input.handbrake||input.brakeReverse&&state.speed>.025||state.brakeBlend>.1)
    const throttle=braking?0:clamp(input.throttle||0)
    const boost=state.boostTime>0?1:0
    const acceleration=clamp(Math.max(0,state.acceleration||0)/6)
    const demand=throttle*config.throttleSensitivity
    let target=clamp(speedLoad*config.speedSensitivity+demand*(.45-.15*speedLoad)+boost*.23)
    if(braking)target*=.4
    const time=target>this.rpm?config.riseTime:config.fallTime*(braking?.25:1)
    const step=Math.max(0,Math.min(.1,dt))
    this.rpm=damp(this.rpm,target,step,time)
    // A small pitch dip follows actual airtime, with a smooth landing recovery.
    this.airborneBlend=damp(this.airborneBlend,state.airborne?1:0,step,state.airborne?.16:.25)
    // Load responds immediately; rotational speed retains its own inertia.
    // Physical acceleration adds presence, then settles at constant speed.
    const pitch=clamp(this.rpm+demand*.06+boost*.04)*(1-.12*this.airborneBlend)
    const intensity=clamp(this.rpm*.45+throttle*(.3+.15*acceleration)+boost*.3)
    const openness=clamp(this.rpm*.6+throttle*.3+throttle*acceleration*.1+boost*.25)
    return this.output={rpm:900+this.rpm*8100,normalizedRpm:this.rpm,targetRpm:target,throttle,braking,boost,
      playbackRate:mix(config.pitchMin,config.pitchMax,pitch),gain:mix(config.volumeMin,config.volumeMax,intensity),
      frequency:18000*Math.pow(800/18000,(1-openness)*config.filterIntensity)}
  }
}

export class CycloneEngine{
  constructor(audio,{settings=()=>engineAudioState.snapshot()}={}){this.audio=audio;this.settings=settings;this.model=new EngineRPM();this.loop=null;this.actor=null}
  update(dt,{state,input={},speedReference=60,enabled=true,paused=false}={}){
    if(state!==this.actor){this.actor=state;this.model.reset()}
    const active=enabled&&!!state
    // Pause, transformation, Armor and checkpoints retain the running source.
    // Only scene disposal stops it; resuming never starts a second loop.
    if(!active||paused){if(this.loop)this.audio.modulate(this.loop,{gain:0,timeConstant:paused?.025:.12});return}
    const output=this.model.update(dt,{state,input,speedReference},this.settings())
    if(!this.loop)this.loop=this.audio.play('cycloneEngineLoop',{loop:true,fadeIn:.12,playbackRate:output.playbackRate,filter:{type:'lowpass',frequency:output.frequency}})
    if(this.loop)this.audio.modulate(this.loop,{playbackRate:output.playbackRate,gain:output.gain,frequency:output.frequency,timeConstant:.025})
  }
  dispose(){if(this.loop)this.audio.stop(this.loop,0);this.loop=null;this.actor=null;this.model.reset()}
}
