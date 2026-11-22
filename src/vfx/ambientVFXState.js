const defaults=Object.freeze({enabled:true,forestEnabled:true,desertEnabled:false,pollenEnabled:true,leavesEnabled:true,skyBirdsEnabled:true,canyonBirdsEnabled:true,sandEnabled:false,gustsEnabled:false,forestDensity:.6,desertDensity:.75,quality:'auto'})
let value={...defaults};const listeners=new Set()
export const ambientVFXState={
 defaults,snapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 set(changes){
  const next={...value}
  for(const key of Object.keys(defaults))if(key in changes){
   if(key==='quality'){if(['auto','low','medium','high'].includes(changes[key]))next[key]=changes[key]}
   else if(key.endsWith('Density')){const n=Number(changes[key]);if(Number.isFinite(n))next[key]=Math.max(0,Math.min(1.5,n))}
   else next[key]=!!changes[key]
  }
  value=next;listeners.forEach(fn=>fn())
 },reset(){this.set(defaults)},
}
