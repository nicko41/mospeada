import {useSyncExternalStore} from 'react'
import {scottModelSelection as state} from './scottModelSelection.js'

export default function ScottModelToggle(){
 const {variant,ready}=useSyncExternalStore(state.subscribe,state.snapshot)
 const current=variant.toUpperCase(),next=({v1:'V2',v2:'V3',v3:'V1'})[variant]
 const buttonKey=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()}
 return <button type="button" className="scott-model-toggle" disabled={!ready} aria-label={`Scott ${current}. Cambiar a Scott ${next}`} data-variant={variant} title={ready?`Scott ${current} activo · Cambiar a Scott ${next}`:'Cargando Scott…'} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onKeyDown={buttonKey} onKeyUp={buttonKey} onClick={e=>{state.toggle();if(e.detail>0)e.currentTarget.blur()}}>
  <svg viewBox="0 0 32 28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 17v-5a10 10 0 0 1 20 0v5l-3 5H9z"/><path d="M8 11h16l-2 6H10zM12 22v3h8v-3M2 7h5L5 4M30 21h-5l2 3"/></svg>
  <span>{current}</span>
 </button>
}
