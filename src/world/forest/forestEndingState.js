import {sampleVictoryBanner} from './victoryBanner.js'
let state={phase:'idle',letters:0},veil=null,opacity=0,banner=null,bannerFrame=sampleVictoryBanner(0)
const listeners=new Set()
function paintBanner(){if(banner){banner.style.setProperty('--victory-bands',bannerFrame.bands);banner.style.setProperty('--victory-panel',bannerFrame.panel);banner.style.setProperty('--victory-opacity',bannerFrame.opacity)}}
export const forestEndingState={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},snapshot:()=>state,
  set(phase){if(state.phase===phase)return;state={phase,letters:0};if(phase==='idle')bannerFrame=sampleVictoryBanner(0);for(const fn of listeners)fn()},
  victory(time){bannerFrame=sampleVictoryBanner(time);paintBanner();if(state.phase==='victory'&&state.letters!==bannerFrame.letters){state={...state,letters:bannerFrame.letters};for(const fn of listeners)fn()}},
  bindVictory(element){banner=element;paintBanner()},
  opacity(value){opacity=value;if(veil)veil.style.opacity=String(value)},
  bindVeil(element){veil=element;if(veil)veil.style.opacity=String(opacity)},
}
