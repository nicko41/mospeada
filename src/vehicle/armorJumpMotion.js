const clamp=n=>Math.max(0,Math.min(1,n))
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)}
export const jumpTiming={compress:.04,pushOff:.04}
export const isJumpCharging=a=>a.jump?.launched===false
// Once horizontal boost replaces the jump pose, keep Hover's normal pose
// pipeline for the rest of this flight, including after releasing boost.
export const jumpUsesStrafePose=a=>!!a.jump&&!isJumpCharging(a)&&(!!a.boosting||!!a.jump.poseCancelled)

export function sampleArmorJump(a){
  const j=a.jump
  if(!j)return null
  if(j.phase==='compress'){
    const t=smooth(j.phaseTime/jumpTiming.compress)
    return{supported:true,bend:.10+.56*t,lean:.22*t,back:.85*t}
  }
  if(j.phase==='pushOff'){
    const t=smooth(j.phaseTime/jumpTiming.pushOff)
    return{supported:true,bend:.66*(1-t)+.06*t,lean:.22*(1-t),back:.85}
  }
  return{supported:false,bend:0,lean:0,back:.85}
}
