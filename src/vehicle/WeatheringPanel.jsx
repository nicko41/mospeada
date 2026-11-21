import { useSyncExternalStore } from 'react'
import { weatheringState as store } from './weatheringState.js'
import './weathering.css'

export default function WeatheringPanel() {
  const value = useSyncExternalStore(store.subscribe, store.snapshot)
  const surface = (type, grounded) => `${type === 'asphalt' ? 'Asfalto' : type === 'dirt' ? 'Tierra húmeda' : 'Sin superficie'}${grounded ? '' : ' · sin contacto'}`
  const check = (key, label) => <label><input type="checkbox" checked={value[key]} onChange={e => store.set({ [key]: e.target.checked })} />{label}</label>
  const range = (key, label, max, step = .05) => <label className="anime-range"><span>{label}<output>{value[key].toFixed(2)}</output></span><input aria-label={label} type="range" min="0" max={max} step={step} value={value[key]} onChange={e => store.set({ [key]: Number(e.target.value) })} /></label>
  return <>
    <aside className="anime-settings weathering-settings" aria-label="Suciedad del Cyclone" onKeyDown={e => e.stopPropagation()}>
      <h2>Suciedad acumulativa</h2>
      <div className="weathering-surfaces" role="status"><span>Delantera: <b>{surface(value.front, value.frontGrounded)}</b></span><span>Trasera: <b>{surface(value.rear, value.rearGrounded)}</b></span></div>
      <small>El barro queda adherido al cambiar de terreno y conserva el estilo Anime.</small>
      {check('enabled', 'Efecto habilitado')}{check('accumulation', 'Suciedad acumulativa')}
      {range('buildup', 'Acumulación de suciedad', 4)}{range('maximum', 'Suciedad máxima', 1, .02)}{range('cleaning', 'Limpieza por lluvia', 4)}
      <div className="weathering-buttons"><button onClick={() => store.clean()}>Limpiar Cyclone</button><button onClick={() => store.soil()}>Ensuciar Cyclone</button></div>
      <small>Depósito: {Math.round(value.dirt * 100)}%<br />La limpieza rápida es manual; la lluvia elimina primero la película superficial.</small>
    </aside>
  </>
}
