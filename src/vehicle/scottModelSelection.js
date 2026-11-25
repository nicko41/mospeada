import {SCOTT_INITIAL_SELECTION} from './scottModelConfig.js'

// Presentation state only. Resetting a level does not reset the comparison.
const listeners=new Set()
let value={variant:SCOTT_INITIAL_SELECTION,ready:false}
const publish=patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}
export const scottModelSelection={
 snapshot:()=>value,
 subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},
 ready(ready){if(value.ready!==ready)publish({ready})},
 select(variant){if(!value.ready||!['v1','v2','v3'].includes(variant)||value.variant===variant)return;publish({variant})},
 toggle(){const variants=['v1','v2','v3'];this.select(variants[(variants.indexOf(value.variant)+1)%variants.length])},
}
