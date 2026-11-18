import { useState, useSyncExternalStore } from 'react'
import { animeState } from './animeState.js'
import './anime.css'
import SurfaceBrushPanel from './SurfaceBrushPanel'

export default function AnimeControls() {
  const value = useSyncExternalStore(animeState.subscribe, animeState.snapshot), [panel, setPanel] = useState(null)
  const open = panel === 'anime'
  const range = (key, label, min, max, step, suffix = '') => <label className="anime-range"><span>{label}<output>{Number(value[key]).toFixed(step < 1 ? 2 : 0)}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={event => animeState.set({ [key]: Number(event.target.value) })} /></label>
  return <>
    <div className="anime-switcher" role="group" aria-label="Modo de renderizado">
      <button aria-pressed={value.mode === 'PBR'} onClick={() => animeState.set({ mode: 'PBR' })}>PBR</button>
      <button aria-pressed={value.mode === 'ANIME'} onClick={() => animeState.set({ mode: 'ANIME' })} disabled={!value.ready || !!value.error}>{value.ready ? 'ANIME' : 'Preparando Anime…'}</button>
      <button aria-pressed={value.compare} disabled={!value.ready || !!value.error} onClick={() => animeState.set({ mode: 'ANIME', compare: !value.compare })}>Comparar</button>
      <button aria-expanded={open} onClick={() => setPanel(open ? null : 'anime')}>Ajustes Anime</button>
      <button aria-expanded={panel === 'brush'} onClick={() => setPanel(panel === 'brush' ? null : 'brush')}>Reflejo · ensayo</button>
    </div>
    {panel === 'brush' && <SurfaceBrushPanel />}
    {open && <aside className="anime-settings" aria-label="Ajustes Anime">
      <h2>Imagen Anime</h2><small>Bandas de luz y contornos finos · PBR conserva su aspecto original.</small>
      <label className="anime-check"><input type="checkbox" checked={value.cel} onChange={e => animeState.set({ cel: e.target.checked })} /> Cel shading</label>
      <label className="anime-select">Niveles de iluminación<select aria-label="Niveles de iluminación" value={value.levels} onChange={e => animeState.set({ levels: Number(e.target.value) })}>{[2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
      {range('shadow', 'Intensidad de sombras', 0, 1, 0.02)}
      <label className="anime-check"><input type="checkbox" checked={value.outlines} onChange={e => animeState.set({ outlines: e.target.checked })} /> Contornos</label>
      {range('width', 'Grosor de contornos', 0.5, 3, 0.1, ' px')}
      <label className="anime-select">Color de contornos<input aria-label="Color de contornos" type="color" value={value.color} onChange={e => animeState.set({ color: e.target.value })} /></label>
      {range('highlights', 'Reflejos estilizados', 0, 1.5, 0.05)}
      <button onClick={() => animeState.reset()}>Restablecer estilo</button>
    </aside>}
    {value.compare && <>
      <div className="anime-divider" style={{ left: `${value.split * 100}%` }} />
      <label className="anime-comparison">PBR ← Comparación → Anime<input aria-label="División de comparación" type="range" min="0" max="1" step="0.005" value={value.split} onChange={e => animeState.set({ split: Number(e.target.value) })} /></label>
    </>}
    {value.error && <p className="anime-error">{value.error}</p>}
  </>
}
