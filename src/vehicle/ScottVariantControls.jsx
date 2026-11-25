import {useSyncExternalStore} from 'react'
import {scottVisualVariantState as state} from './scottVisualVariantState.js'
export default function ScottVariantControls(){
 const value=useSyncExternalStore(state.subscribe,state.snapshot)
 return <section className="anime-settings" aria-label="Variante visual de Scott"><h2>Scott · comparación visual</h2>
  <div className="weather-presets">{[['original','Scott original'],['hd-hybrid-v2','Scott HD V2 · cabeza y pechera']].map(([key,label])=><button key={key} aria-pressed={value.variant===key} onClick={()=>state.select(key)}>{label}</button>)}</div>
  <small>{value.status==='loading'?'Cargando Scott HD…':value.status==='error'?`No se pudo cargar Scott HD. ${value.error}`:value.variant==='original'?'Modelo original activo.':'Scott HD activo · rig y animaciones originales.'}</small>
  <p><a href="/scott-hd-lab.html" target="_blank" rel="noreferrer">Abrir comparación y prueba de animaciones</a></p>
 </section>
}
