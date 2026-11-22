import {useSyncExternalStore} from 'react'
import {ambientVFXState as store} from './ambientVFXState.js'
export default function AmbientVFXControls(){
 const value=useSyncExternalStore(store.subscribe,store.snapshot)
 const toggle=(key,label)=><label key={key}><input type="checkbox" checked={value[key]} onChange={e=>store.set({[key]:e.target.checked})}/>{label}</label>
 return <details><summary>Ambiente por bioma</summary>
  {toggle('enabled','Ambiente activado')}
  <label>Calidad del ambiente <select aria-label="Calidad del ambiente" value={value.quality} onChange={e=>store.set({quality:e.target.value})}><option value="auto">Automática</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
  <h3>Bosque</h3>{toggle('forestEnabled','Ambiente del bosque')}{toggle('pollenEnabled','Polen y semillas flotantes')}{toggle('leavesEnabled','Hojas flotantes')}{toggle('skyBirdsEnabled','Bandadas lejanas')}{toggle('canyonBirdsEnabled','Bandada del salto del barranco')}
  <label className="anime-range"><span>Densidad del bosque<output>{value.forestDensity.toFixed(2)}</output></span><input aria-label="Densidad ambiental del bosque" type="range" min="0" max="1.5" step=".05" value={value.forestDensity} onChange={e=>store.set({forestDensity:Number(e.target.value)})}/></label>
  <h3>Desierto</h3>{toggle('desertEnabled','Ambiente del desierto')}{toggle('sandEnabled','Arena flotante')}{toggle('gustsEnabled','Ráfagas de viento')}
  <label className="anime-range"><span>Densidad del desierto<output>{value.desertDensity.toFixed(2)}</output></span><input aria-label="Densidad ambiental del desierto" type="range" min="0" max="1.5" step=".05" value={value.desertDensity} onChange={e=>store.set({desertDensity:Number(e.target.value)})}/></label>
  <button onClick={()=>store.reset()}>Restablecer ambiente</button>
 </details>
}
