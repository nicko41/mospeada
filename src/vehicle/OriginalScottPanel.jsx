import { useSyncExternalStore } from 'react'
import { originalScottState as playback } from './originalScottState.js'

export default function OriginalScottPanel() {
  const s = useSyncExternalStore(playback.subscribe, playback.snapshot)
  return <aside className="scott-original-panel" aria-label="Scott original · animaciones" onKeyDown={event => event.stopPropagation()}>
    <strong>SCOTT · CYCLONE</strong>
    <div className="scott-clip-buttons">{[['Cyclone_Mount', 'Subir al Cyclone'], ['Cyclone_Dismount', 'Bajar del Cyclone'], ['Cyclone_RidingPose', 'Pose de conducción']].map(([clip, label]) => <button key={clip} onClick={() => playback.select(clip)} aria-pressed={s.clip === clip}>{label}</button>)}</div>
    <div className="scott-clip-buttons">{[['Walking', 'Caminar'], ['Running', 'Correr'], ['air_squat', 'Agacharse']].map(([clip, label]) => <button key={clip} onClick={() => playback.select(clip)}>{label}</button>)}</div>
    <label>Animación<select value={s.clip} onChange={event => playback.select(event.target.value)}><option value="rest">T-pose original</option>{s.clips.map(clip => <option key={clip.name} value={clip.name}>{clip.name} · {clip.duration.toFixed(2)} s</option>)}</select></label>
    <div className="scott-clip-buttons"><button onClick={() => !s.playing && s.progress >= 1 ? playback.select(s.clip) : playback.set({ playing: !s.playing })}>{s.playing ? 'Pausar clip' : 'Reproducir'}</button><button onClick={() => playback.scrub(0)}>Inicio</button></div>
    <label>Fotograma · {Math.round(s.progress * 100)}%<input type="range" min="0" max="1" step="0.001" value={s.progress} onChange={event => playback.scrub(Number(event.target.value))} /></label>
    <div className="scott-clip-buttons"><button onClick={() => playback.step(-1)}>← Fotograma</button><button onClick={() => playback.step(1)}>Fotograma →</button></div>
    <label>Velocidad<select value={s.speed} onChange={event => playback.set({ speed: Number(event.target.value) })}>{[0.25, 0.5, 1].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
    <label className="scott-texture-toggle"><input type="checkbox" checked={s.cleanShoulders} onChange={event => playback.set({ cleanShoulders: event.target.checked })} /> Limpieza de hombreras · sólo textura</label>
    <small>Desmarcar para comparar con los mapas originales de Meshy.</small>
    <small>F · subir / bajar. Los 16 clips de Meshy permanecen originales.</small>
  </aside>
}
