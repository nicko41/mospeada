import {SCOTT_INITIAL_SELECTION} from './scottModelConfig.js'

// Presentation state only. Resetting a level does not reset the comparison.
const listeners=new Set()
let loader=null,request=0
let value={variant:SCOTT_INITIAL_SELECTION,ready:false}
const publish=patch=>{value={...value,...patch};listeners.forEach(fn=>fn())}
export const scottModelSelection={
 snapshot:()=>value,
 subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},
 ready(ready){if(value.ready!==ready)publish({ready})},
 setLoader(next){loader=next;return()=>{if(loader===next){loader=null;request++}}},
 select(variant){
  if(!value.ready||!['v1','v2','v3'].includes(variant))return
  const id=++request
  if(value.variant===variant){if(value.loading)publish({loading:null});return}
  if(!loader){publish({variant});return}
  publish({loading:variant,error:''})
  Promise.resolve(loader(variant)).then(()=>{if(id===request)publish({variant,loading:null})},error=>{if(id===request)publish({loading:null,error:error.message})})
 },
 toggle(){const variants=['v1','v2','v3'];this.select(variants[(variants.indexOf(value.variant)+1)%variants.length])},
}
