const limits={intensity:[0,1],duration:[.06,.7],range:[4,140],damping:[2,40],maxConcurrent:[1,4],blurIntensity:[0,1],blurPixels:[.1,24],blurDuration:[.04,.4],blurRange:[2,80],explosionPower:[1,8]}
// Invid destruction has independent extra power; Cyclone boost is closed.
const defaults=Object.freeze({shakeEnabled:true,intensity:1,duration:.5,range:100,damping:4.5,maxConcurrent:4,blurEnabled:true,blurIntensity:.85,blurPixels:18,blurDuration:.28,blurRange:60,explosionPower:4})
let value={...defaults}
const listeners=new Set()
export const cameraImpactState={
 defaults,snapshot:()=>value,
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 set(patch){
  const next={...value}
  for(const key of ['shakeEnabled','blurEnabled'])if(typeof patch[key]==='boolean')next[key]=patch[key]
  for(const [key,[min,max]]of Object.entries(limits))if(Number.isFinite(patch[key]))next[key]=Math.max(min,Math.min(max,key==='maxConcurrent'?Math.round(patch[key]):patch[key]))
  value=next;listeners.forEach(fn=>fn())
 },
 reset(){this.set(defaults)},
}
