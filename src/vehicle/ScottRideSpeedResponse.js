import {scottV3Config} from './scottV3Config.js'

// Speed-driven posture, independent of input edges and render frame rate.
export class ScottRideSpeedResponse{
 constructor(){this.blend=0;this.roll=0}
 reset(){this.blend=0;this.roll=0}
 sample(state,delta,paused=false){
  const config=scottV3Config.riding.speedMotion,speed=Math.max(0,state.speed||0),t=Math.max(0,Math.min(1,(speed-config.startSpeed)/(config.fullSpeed-config.startSpeed))),target=state.airborne?0:t*t*(3-2*t)
  // An omitted delta samples a settled inspection pose. Gameplay supplies dt.
  if(delta===undefined)this.blend=target
  else if(!paused)this.blend+=(target-this.blend)*(-Math.expm1(-config.response*Math.max(0,Math.min(.1,delta))))
  // Follow the actual chassis lean, including its return to centre. Bank from
  // road camber is already inherited through the bike; it adds no body input.
  const turn=scottV3Config.riding.turnMotion,moving=Math.max(0,Math.min(1,(speed-turn.startSpeed)/(turn.fullSpeed-turn.startSpeed))),turnTarget=state.airborne||moving===0?0:Math.max(-turn.maxTorsoRoll,Math.min(turn.maxTorsoRoll,(state.lean||0)*turn.leanGain))*moving*moving*(3-2*moving)
  if(delta===undefined)this.roll=turnTarget
  else if(!paused)this.roll+=(turnTarget-this.roll)*(-Math.expm1(-turn.response*Math.max(0,Math.min(.1,delta))))
  const weight=state.airborne?0:this.blend
  return{speed,blend:weight,torsoLean:weight*config.maxTorsoLean,torsoRoll:state.airborne?0:this.roll,elbowOpening:weight*config.maxElbowOpening,elbowBend:weight*config.maxElbowBend}
 }
}
