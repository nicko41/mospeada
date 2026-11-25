const limits={blurIntensity:[0,1],clearRadius:[.25,.85],peripheralIntensity:[0,1],blurPixels:[.5,64],maxFov:[0,20],enterRate:[1,16],exitRate:[1,10],shakeIntensity:[0,1]}
// Deliberately exaggerated audition, requested in-game; tune downward next.
const defaults=Object.freeze({blurEnabled:true,fovEnabled:true,shakeEnabled:false,blurIntensity:.85,clearRadius:.35,peripheralIntensity:1,blurPixels:48,maxFov:14,enterRate:12,exitRate:1.8,shakeIntensity:1})
let value={...defaults}
const listeners=new Set()
export const boostCameraState={
 defaults,snapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 set(patch){
  const next={...value}
  for(const key of ['blurEnabled','fovEnabled','shakeEnabled'])if(typeof patch[key]==='boolean')next[key]=patch[key]
  for(const [key,[min,max]]of Object.entries(limits))if(Number.isFinite(patch[key]))next[key]=Math.max(min,Math.min(max,patch[key]))
  value=next;listeners.forEach(fn=>fn())
 },
 reset(){this.set(defaults)},
}
