import {activeEnvironment} from '../environmentConfig.js'

export function shouldShowForestOpening(environment,search=''){
  return environment==='forest'&&new URLSearchParams(search).get('intro')!=='0'
}
let snapshot={phase:shouldShowForestOpening(activeEnvironment,globalThis.location?.search||'')?'loading':'done'},veil=null,opacity=1,controller=null
const listeners=new Set()
// Keep the canvas composited during the black music lead. A fully opaque
// overlay let the browser defer its first presentation until the visible fade.
// At .999, transmission stays below one 8-bit display step (still black).
const veilOpacity=value=>String(Math.min(value,.999))
export const forestOpeningState={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},snapshot:()=>snapshot,
  set(phase){if(snapshot.phase===phase)return;snapshot={phase};listeners.forEach(fn=>fn())},
  opacity(value){opacity=value;if(veil)veil.style.opacity=veilOpacity(value)},
  bindVeil(element){veil=element;if(veil)veil.style.opacity=veilOpacity(opacity)},
  bind(value){controller=value},start(){controller?.play()},skip(){controller?.finish()},
  startupViews(){return controller?.startupViews()||[]},
}
