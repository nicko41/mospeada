const listeners=new Set()
const zero=()=>({shortening:0,height:0,lateral:0,depth:0})
export const wheelArmorRanges={shortening:[0,.6],height:[-.6,.4],lateral:[-.4,.4],depth:[-.4,.4]}
let value={front:zero(),rear:zero()}
export const wheelArmorState={
  defaults:Object.freeze({front:Object.freeze(zero()),rear:Object.freeze(zero())}),
  snapshot:()=>value,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
  setWheel(wheel,key,number){
    if(!value[wheel]||!wheelArmorRanges[key])return
    const [min,max]=wheelArmorRanges[key],n=Math.max(min,Math.min(max,Number(number)||0))
    value={...value,[wheel]:{...value[wheel],[key]:n}};listeners.forEach(fn=>fn())
  },
  reset(){value={front:zero(),rear:zero()};listeners.forEach(fn=>fn())},
}
