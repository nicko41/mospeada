const clamp=n=>Math.max(0,Math.min(1,n))
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)}
export const jumpTiming={compress:.18,pushOff:.12}
export const isJumpCharging=a=>a.jump?.launched===false

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
  const gather=smooth((j.elapsed||0)/.22)
  const reach=a.vy<0?smooth((a.height-.05)/.9):1
  return{supported:false,bend:(.06+.54*gather)*reach,lean:0,back:.85}
}
