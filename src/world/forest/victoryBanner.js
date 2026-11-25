const clamp=n=>Math.max(0,Math.min(1,n))
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)}
export const VICTORY_BANNER=Object.freeze({bands:.55,panelStart:.35,panelDuration:.4,typeStart:.8,letterSeconds:.11,text:'VICTORIA'})
export function sampleVictoryBanner(time){
  const c=VICTORY_BANNER,t=clamp((time-c.panelStart)/c.panelDuration),back=1.70158
  return{bands:smooth(time/c.bands),panel:1+(back+1)*(t-1)**3+back*(t-1)**2,opacity:clamp(t*4),letters:Math.min(c.text.length,Math.max(0,Math.floor((time-c.typeStart)/c.letterSeconds)))}
}
