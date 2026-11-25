import {useLayoutEffect,useEffect,useSyncExternalStore} from 'react'
import {useFrame} from '@react-three/fiber'
import {ForestEndingShot} from './ForestEndingShot.js'
import {forestEndingState as store} from './forestEndingState.js'
import {stage4World} from './forestStage4Config.js'
import {sampleRideHeight} from '../../vehicle/rideSurface.js'
import {DefeatReadout} from '../../vehicle/ScottHealthHUD.jsx'
import {VICTORY_BANNER} from './victoryBanner.js'
import './forestEnding.css'

export default function ForestEnding({runtime}){
  useLayoutEffect(()=>{
    const shot=new ForestEndingShot(runtime,sampleRideHeight,{onPhase:phase=>store.set(phase),onOpacity:value=>store.opacity(value),onVictoryFrame:time=>store.victory(time),onComplete:()=>window.dispatchEvent(new Event('level1-ending-complete'))})
    runtime.ending=shot
    const input=e=>{
      if(!shot.holding||e.ctrlKey||e.metaKey||e.code==='Tab'||e.code==='F5'||shot.phase==='done'&&e.code==='KeyR')return
      e.preventDefault();e.stopImmediatePropagation()
    }
    const resume=()=>{if(shot.holding&&shot.phase!=='done'&&!document.hidden)runtime.paused=false}
    const events=['keydown','keyup','pointerdown','mousedown','wheel']
    for(const event of events)window.addEventListener(event,input,{capture:true,passive:false})
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume)
    if(import.meta.env.DEV)window.__FOREST_ENDING__=shot
    return()=>{for(const event of events)window.removeEventListener(event,input,true);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);shot.reset();if(runtime.ending===shot)delete runtime.ending;if(import.meta.env.DEV)delete window.__FOREST_ENDING__}
  },[runtime])
  useFrame((_,delta)=>runtime.ending?.update(delta,stage4World.get()),-2.2)
  return null
}

export function ForestEndingOverlay(){
  const state=useSyncExternalStore(store.subscribe,store.snapshot)
  useEffect(()=>{
    const app=document.querySelector('.app');if(app)app.dataset.forestEnding=state.phase==='idle'?'idle':'active'
    return()=>{if(app)delete app.dataset.forestEnding}
  },[state.phase])
  return <div className="forest-ending" data-phase={state.phase} aria-label={state.phase==='done'?'Fin del nivel 1':'Escena final del nivel 1'}>
    {state.phase==='victory'&&<section ref={store.bindVictory} className="ride-defeat-overlay ride-victory-overlay" role="status" aria-label="Victoria"><div className="ride-defeat-band"><div className="ride-defeat-title"><strong><DefeatReadout value={VICTORY_BANNER.text} displayValue={VICTORY_BANNER.text.slice(0,state.letters)} width={460} height={72}/></strong></div></div></section>}
    <div ref={store.bindVeil} className="forest-ending-veil"/>
  </div>
}
