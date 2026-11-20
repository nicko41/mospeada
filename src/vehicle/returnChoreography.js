export const RETURN_BOOST_TIME=.24, RETURN_ASSEMBLY_TIME=1, RETURN_POSE_TIME=.18
export const RETURN_TOTAL_TIME=RETURN_BOOST_TIME+RETURN_ASSEMBLY_TIME+RETURN_POSE_TIME
const clamp=n=>Math.max(0,Math.min(1,n))
const ramp=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x)}

// One score, shared by parts and body, including the existing boost/handoff.
export function returnProgress(entry){
  if(entry.phase==='returnboost')return clamp(entry.time/RETURN_TOTAL_TIME)
  if(entry.phase==='reversing')return clamp((RETURN_BOOST_TIME+RETURN_ASSEMBLY_TIME*(1-entry.store.snapshot().progress))/RETURN_TOTAL_TIME)
  if(entry.phase==='returnpose')return clamp((RETURN_BOOST_TIME+RETURN_ASSEMBLY_TIME+entry.time)/RETURN_TOTAL_TIME)
  return 1
}
export function sampleReturnPhases(progress){
  const t=clamp(progress)*RETURN_TOTAL_TIME,assembly=clamp((t-RETURN_BOOST_TIME)/RETURN_ASSEMBLY_TIME)
  return{progress:clamp(progress),seconds:t,boost:clamp(t/RETURN_BOOST_TIME),assembly,mechanical:1-assembly,settle:clamp((t-RETURN_BOOST_TIME-RETURN_ASSEMBLY_TIME)/RETURN_POSE_TIME),
    chestCross:ramp(.58,.68,assembly)*(1-ramp(.90,1,assembly))}
}
