const listeners=new Set()
let value={variant:'original',status:'ready',error:null}
export const SCOTT_HD_MODEL='/models/mospeada/scott-bernard-hd-hybrid-v2.glb'
export const scottVisualVariantState={
 snapshot:()=>value,
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 select(variant){if(!['original','hd-hybrid-v2'].includes(variant)||variant===value.variant)return;this.set({variant,status:variant==='original'?'ready':'loading',error:null})},
 set(next){value={...value,...next};listeners.forEach(fn=>fn())},
}
