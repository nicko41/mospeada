import {useSyncExternalStore} from 'react'
import {forestWheelFXState as store} from '../world/forest/forestWheelFX.js'
const groups=[['Polvo',[['dustEmission','Emisión',0,3],['dustSize','Tamaño',.2,3],['dustLife','Vida',.25,2],['dustLaunch','Velocidad',.25,2.5]]],['Barro',[['mudEmission','Emisión',0,3],['mudSize','Tamaño',.3,3],['mudLife','Vida',.25,2],['mudLaunch','Velocidad',.25,2.5]]],['Fragmentos de pasto',[['grassEmission','Emisión',0,3],['grassSize','Tamaño',.3,3],['grassLife','Vida (s)',.15,1.2],['grassLaunch','Velocidad',.25,2.5],['grassGravity','Gravedad',3,20]]]]
export default function ForestWheelFXControls(){
  const value=useSyncExternalStore(store.subscribe,store.snapshot)
  return <div className="vfx-soil-controls"><h3>Presets de ruedas · Forest</h3><small>La máscara del terreno mezcla ambos presets bajo cada rueda. No modifica la lluvia ni la física.</small>
    <label><input type="checkbox" checked={value.grassEnabled} onChange={e=>store.set({grassEnabled:e.target.checked})}/>Fragmentos de pasto</label>
    {['dirt','grass'].map(name=><details key={name}><summary>{name==='dirt'?'Tierra · valores aprobados':'Pasto'}</summary>
      <label className="anime-range"><span>Humedad<output>{Math.round(value[name].humidity*100)}%</output></span><input aria-label={`Humedad ${name}`} type="range" min="0" max="1" step=".01" value={value[name].humidity} onChange={e=>store.setPreset(name,{humidity:Number(e.target.value)})}/></label>
      {groups.filter(([title])=>name==='grass'||title!=='Fragmentos de pasto').map(([title,fields])=><div key={title}><b>{title}</b>{fields.map(([key,label,min,max])=><label className="anime-range" key={key}><span>{label}<output>{value[name][key].toFixed(2)}</output></span><input aria-label={`${name} ${key}`} type="range" min={min} max={max} step=".05" value={value[name][key]} onChange={e=>store.setPreset(name,{[key]:Number(e.target.value)})}/></label>)}</div>)}
    </details>)}
    <label className="anime-range"><span>Transición (s)<output>{value.transitionSeconds.toFixed(2)}</output></span><input aria-label="Transición de superficie" type="range" min=".05" max=".6" step=".01" value={value.transitionSeconds} onChange={e=>store.set({transitionSeconds:Number(e.target.value)})}/></label>
  </div>
}
