import { useSyncExternalStore } from 'react'
import { engineVFXState as store } from './engineVFXState.js'
const exhaust = [['exhaustIntensity', 'Intensidad de escapes', 0, 3, .05], ['exhaustSize', 'Tamaño de escapes', .4, 2, .05], ['exhaustTurbulence', 'Turbulencia de escapes', 0, 2, .05], ['exhaustOpacity', 'Opacidad de escapes', 0, 1, .02]]
const boost = [['boostIntensity', 'Intensidad de turbina', 0, 3, .05], ['boostSpeed', 'Velocidad de expulsión · m/s', 12, 65, 1], ['boostLength', 'Longitud de estela', .4, 2, .05], ['boostExpansion', 'Expansión de estela', .4, 2.5, .05], ['boostTurbulence', 'Turbulencia de turbina', 0, 2.5, .05], ['boostOpacity', 'Opacidad de turbina', 0, 1, .02]]
const point = [['boostX', 'Emisor · desplazamiento X · m', -.4, .4, .01], ['boostY', 'Emisor · altura Y · m', -.4, .6, .01], ['boostZ', 'Emisor · desplazamiento Z · m', -.6, .4, .01], ['boostYaw', 'Emisor · giro · grados', -60, 60, 1], ['boostPitch', 'Emisor · inclinación · grados', -60, 60, 1]]
export default function EngineVFXControls() {
  const value = useSyncExternalStore(store.subscribe, store.snapshot)
  const sliders = fields => fields.map(([key, label, min, max, step]) => <label key={key} className="anime-range"><span>{label}<output>{value[key].toFixed(step < 1 ? 2 : 0)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e => store.set({ [key]: Number(e.target.value) })} /></label>)
  return <>
    <details className="engine-vfx-controls"><summary>Escapes · humo discreto</summary>
      <label><input type="checkbox" checked={value.exhaustEnabled} onChange={e => store.set({ exhaustEnabled: e.target.checked })} />Humo de escapes</label>
      {sliders(exhaust)}<small>Reposo suave · ráfagas de vapor al circular · activas: {value.exhaustActive}</small>
    </details>
    <details className="engine-vfx-controls"><summary>Turbina Boost · SHIFT</summary>
      <label><input type="checkbox" checked={value.boostEnabled} onChange={e => store.set({ boostEnabled: e.target.checked })} />Humo de turbina</label>
      {sliders(boost)}
      <details><summary>Punto provisional de la turbina</summary><small>Desplazamientos desde la referencia trasera medida en el Cyclone. La posición y el eje siguen su inclinación; no se agrega una pieza.</small>{sliders(point)}</details>
      <small>{value.boosting ? 'Turbina expulsando humo' : 'Sin emisión de boost; la estela existente se disipa'} · activas: {value.boostActive}</small>
    </details>
    <button onClick={() => store.reset()}>Restablecer escapes y turbina</button>
  </>
}
