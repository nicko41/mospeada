import { useSyncExternalStore } from 'react'
import { vfxState as store } from './vfxState.js'
import { weatheringState as soil } from '../vehicle/weatheringState.js'
import EngineVFXControls from './EngineVFXControls.jsx'
import ForestWheelFXControls from './ForestWheelFXControls.jsx'
import {activeEnvironment} from '../world/environmentConfig.js'
import {forestWheelFXState} from '../world/forest/forestWheelFX.js'
import './vfx.css'

const controls = [
  ['emission', 'Intensidad de emisión', 0, 3, .05], ['size', 'Tamaño de partículas', .4, 2, .05], ['life', 'Duración de vida', .4, 2, .05],
  ['gravity', 'Gravedad', 0, 3, .05], ['drag', 'Resistencia aerodinámica', 0, 4, .05], ['turbulence', 'Turbulencia', 0, 2, .05],
  ['spread', 'Dispersión', .2, 2.5, .05], ['wind', 'Intensidad del viento', 0, 4, .05], ['humidity', 'Humedad del suelo', 0, 1, .02], ['maximum', 'Máximo de partículas', 64, 960, 32],
]
export default function VFXPanel() {
  const forest=activeEnvironment==='forest'
  const value = useSyncExternalStore(store.subscribe, store.snapshot), dirt = useSyncExternalStore(soil.subscribe, soil.snapshot)
  return <>
    <aside className="anime-settings vfx-settings" aria-label="VFX de terreno" onKeyDown={e => e.stopPropagation()}>
      <h2>VFX del Cyclone · Quarks</h2>
      <EngineVFXControls />
      <small>Rueda trasera: {value.rearSurface==='grass'?'Pasto':value.rearSurface === 'dirt' ? 'Tierra' : value.rearSurface === 'asphalt' ? 'Asfalto' : 'Sin superficie'}{value.grounded ? '' : ' · sin contacto'}<br />La humedad es experimental; no cambia el terreno ni la lluvia.</small>
      <label><input type="checkbox" checked={value.enabled} onChange={e => store.set({ enabled: e.target.checked })} />Partículas de polvo habilitadas</label>
      {forest?<ForestWheelFXControls/>:<label className="anime-range"><span>Humedad del suelo<output>{Math.round(value.humidity * 100)}%</output></span><input aria-label="Humedad del suelo" type="range" min="0" max="1" step=".02" value={value.humidity} onChange={e => store.set({ humidity: Number(e.target.value) })} /></label>}
      {['water', 'earth', 'mud'].map((key, i) => <div key={key} className="vfx-effect-control">
        <label><input type="checkbox" checked={value[key + 'Enabled']} onChange={e => store.set({ [key + 'Enabled']: e.target.checked })} />{['Agua', 'Tierra', 'Barro'][i]}</label>
        <label className="anime-range"><span>Intensidad de {['agua', 'tierra', 'barro'][i]}<output>{value[key].toFixed(2)}</output></span><input aria-label={`Intensidad de ${['agua', 'tierra', 'barro'][i]}`} type="range" min="0" max="3" step=".05" value={value[key]} onChange={e => store.set({ [key]: Number(e.target.value) })} /></label>
      </div>)}
      <div className="vfx-soil-controls">
        <h3>Suciedad acumulativa</h3>
        <label><input type="checkbox" checked={dirt.enabled && dirt.scottEnabled} onChange={e => soil.set({ enabled: true, scottEnabled: e.target.checked })} />Scott</label>
        <label className="anime-range"><span>Acumulación en Scott<output>{dirt.scottBuildup.toFixed(2)}</output></span><input aria-label="Acumulación en Scott" type="range" min="0" max="4" step=".05" value={dirt.scottBuildup} onChange={e => soil.set({ scottBuildup: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={dirt.enabled && dirt.accumulation} onChange={e => soil.set({ enabled: true, accumulation: e.target.checked })} />Cyclone</label>
        <label className="anime-range"><span>Acumulación en Cyclone<output>{dirt.buildup.toFixed(2)}</output></span><input aria-label="Acumulación en Cyclone" type="range" min="0" max="4" step=".05" value={dirt.buildup} onChange={e => soil.set({ buildup: Number(e.target.value) })} /></label>
        <label className="anime-range"><span>Limpieza por lluvia<output>{dirt.cleaning.toFixed(2)}</output></span><input aria-label="Limpieza por lluvia" type="range" min="0" max="4" step=".05" value={dirt.cleaning} onChange={e => soil.set({ cleaning: Number(e.target.value) })} /></label>
        <div className="weathering-buttons"><button onClick={() => soil.cleanBoth()}>Limpiar ambos</button><button onClick={() => soil.soilBoth()}>Ensuciar ambos</button></div>
        <small>Scott: {Math.round(dirt.scottDirt * 100)}% · Cyclone: {Math.round(dirt.dirt * 100)}%</small>
      </div>
      <details><summary>Ajustes del polvo aprobado</summary>
      {controls.filter(([key]) => key !== 'humidity'&&(!forest||!['emission','size','life'].includes(key))).map(([key, label, min, max, step]) => <label key={key} className="anime-range"><span>{label}<output>{key === 'maximum' ? value[key] : value[key].toFixed(2)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => store.set({ [key]: Number(e.target.value) })} /></label>)}
      </details>
      <small>0% humedad: seco · 100%: mojado, sin polvo.<br />Polvo: {value.active}/{value.budget} · agua/tierra/barro: {value.ejectaActive || 0}/{value.ejectaBudget || 0}</small>
      {forest&&<small>Fragmentos activos: {value.grassActive||0}</small>}
      <button onClick={() => {store.reset();if(forest)forestWheelFXState.reset()}}>Restablecer VFX</button>
    </aside>
  </>
}
