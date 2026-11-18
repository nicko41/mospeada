import { useSyncExternalStore } from 'react'
import { surfaceBrushState as brush, BRUSH_TOTAL_SECONDS } from './surfaceBrushState.js'
import { animeState } from './animeState.js'

export default function SurfaceBrushPanel() {
  const value = useSyncExternalStore(brush.subscribe, brush.snapshot)
  const anime = useSyncExternalStore(animeState.subscribe, animeState.snapshot)
  const range = (key, label, min, max, step) => <label className="anime-range"><span>{label}<output>{value[key].toFixed(2)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={event => brush.set({ [key]: Number(event.target.value) })} /></label>
  return <aside className="anime-settings surface-brush-settings" aria-label="Reflejo sobre carrocería" onKeyDown={event => event.stopPropagation()}>
    <h2>Pincelada de luz</h2>
    <small>Carrocería completa · sólo Anime. Pinceladas transversales con desfase por pieza y orientación.</small>
    <label><input type="checkbox" checked={value.enabled} onChange={e => brush.set({ enabled: e.target.checked })} /> Reflejo habilitado</label>
    <button disabled={!anime.ready || !!anime.error} onClick={() => { animeState.set({ mode: 'ANIME', compare: false }); brush.play() }}>Reproducir reflejo</button>
    <label><input type="checkbox" checked={value.automatic} onChange={e => brush.set({ automatic: e.target.checked })} /> Repetir según velocidad de la moto</label>
    <small>Detenido: sin pasadas automáticas. A mayor velocidad, menor pausa. La reproducción manual funciona también detenido.</small>
    <label><input type="checkbox" checked={value.slow} onChange={e => brush.set({ slow: e.target.checked })} /> Reproducción lenta (¼)</label>
    <small>Secuencia: {(BRUSH_TOTAL_SECONDS / value.speed * (value.slow ? 4 : 1)).toFixed(2).replace('.', ',')} s · cada barrido 0,55 s a velocidad normal</small>
    <label className="anime-range"><span>Fotograma · arrastrar para detener<output>{Math.round(value.progress * 100)}%</output></span><input aria-label="Fotograma del reflejo" type="range" min="0" max="1" step="0.005" value={value.progress} onChange={e => brush.scrub(Number(e.target.value))} /></label>
    {range('speed', 'Velocidad del reflejo', 0.25, 2, 0.05)}
    {range('stagger', 'Desfase entre paneles', 0, 1, 0.05)}
    {range('size', 'Tamaño del reflejo', 0.4, 1.6, 0.05)}
    {range('intensity', 'Intensidad del reflejo', 0, 1.5, 0.05)}
    {range('irregularity', 'Irregularidad de la pincelada', 0, 1.5, 0.05)}
    <label className="anime-select">Dirección<select aria-label="Dirección del reflejo" value={value.direction} onChange={e => brush.set({ direction: Number(e.target.value) })}><option value="1">Adelante → atrás</option><option value="-1">Atrás → adelante</option></select></label>
    {range('sensitivity', 'Normales y relieves', 0, 2, 0.05)}
    <label className="anime-select">Color<input aria-label="Color del reflejo" type="color" value={value.color} onChange={e => brush.set({ color: e.target.value })} /></label>
    <button onClick={() => brush.reset()}>Restablecer reflejo</button>
  </aside>
}
