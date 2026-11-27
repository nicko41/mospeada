import {clamp,damp} from './physicsMath.js'

export const createBurnoutState=()=>({phase:'idle',blend:0,spinSpeed:0,yawRate:0,chordSeen:false,pivot:0})
export function resetBurnout(s){Object.assign(s.burnout||=createBurnoutState(),createBurnoutState())}

// Dedicated low-speed driving state; the ordinary integrator still owns
// braking, collisions, suspension, wheel animation and the eventual launch.
export function updateBurnout(s,input,dt,c){
  const b=s.burnout||=createBurnoutState(),chord=!!(input.throttle&&input.brake)
  const supported=s.frontGrounded&&s.rearGrounded&&!s.airborne&&s.frontHasSurface!==false&&s.rearHasSurface!==false
  const allowed=c.burnoutEnabled&&supported&&s.riderMode==='mounted'&&!input.handbrake&&!input.reverse&&!input.boost&&!input.wheelie&&!(s.boostTime>0)&&!(s.wheelieAngle>.02)
  if(!allowed){resetBurnout(s);b.chordSeen=chord;return b}
  // A chord begun at speed or in mid-air cannot arm itself as the bike stops
  // or lands. Release either control before starting a deliberate burnout.
  if(chord&&!b.chordSeen&&Math.abs(s.speed)<=c.burnoutEntrySpeed&&s.speed>=0)b.phase='holding'
  b.chordSeen=chord
  if(b.phase==='idle')return b
  if(!chord)b.phase='recovering'
  const holding=b.phase==='holding'
  b.blend=damp(b.blend,holding?1:0,holding?6:c.burnoutReleaseRate,dt)
  b.spinSpeed=damp(b.spinSpeed,holding?c.burnoutWheelSpeed:Math.abs(s.speed),holding?8:c.burnoutReleaseRate,dt)
  b.yawRate=damp(b.yawRate,holding?clamp(input.steer||0,-1,1)*c.burnoutYawRate*b.blend:0,holding?c.burnoutYawResponse:c.burnoutReleaseRate,dt)
  b.pivot=holding?1:b.blend
  if(!holding&&b.blend<.003&&Math.abs(b.yawRate)<.003){const seen=b.chordSeen;resetBurnout(s);b.chordSeen=seen}
  return b
}
