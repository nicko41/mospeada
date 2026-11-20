const listeners=new Set()
let value={enabled:true,intensity:1}
export const armorIdleState={
  snapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
  set(next){value={...value,...next};value.intensity=Math.max(0,Math.min(1,Number(value.intensity)||0));listeners.forEach(fn=>fn())},
}
