import {useState,useSyncExternalStore} from 'react'
import {Html} from '@react-three/drei'
import {foliageTelemetryStore,foliageRecording} from './forestFoliageTelemetry.js'
import {rideUI} from '../../vehicle/rideUI.js'

export default function ForestFoliageDiagnostics({manager}){
  const [open,setOpen]=useState(()=>new URLSearchParams(location.search).has('foliageDebug'))
  const stats=useSyncExternalStore(foliageTelemetryStore.subscribe,foliageTelemetryStore.snapshot)
  const {paused}=useSyncExternalStore(rideUI.subscribe,rideUI.snapshot)
  const exportReport=()=>{const url=URL.createObjectURL(new Blob([foliageRecording.export()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mospeada-foliage-metrics.json';a.click();URL.revokeObjectURL(url)}
  if(!paused)return null
  return <Html fullscreen zIndexRange={[18,0]} style={{pointerEvents:'none'}}>
    <section aria-label="Diagnóstico de foliage" style={{position:'absolute',right:20,top:88,width:285,color:'#e0eadc',background:'#102c24e8',border:'1px solid #668474',font:'12px system-ui',pointerEvents:'auto',padding:9,borderRadius:4}}>
      <button onClick={()=>setOpen(!open)} style={{width:'100%',background:'transparent',color:'inherit',border:0,textAlign:'left',cursor:'pointer'}}>Foliage · métricas {open?'▾':'▸'}</button>
      {open&&<><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:9}}>
        <span>FPS / frame</span><b>{stats.fps.toFixed(1)} / {stats.frameMs.toFixed(1)} ms</b>
        <span>P95 frame</span><b>{stats.p95Ms.toFixed(1)} ms</b><span>Draw calls</span><b>{stats.drawCalls}</b>
        <span>Triángulos enviados</span><b>{stats.triangles.toLocaleString()}</b><span>Grupos en frustum</span><b>{stats.visibleGroups.toLocaleString()}</b>
        <span>Cruzados / simples</span><b>{stats.nearGroups} / {stats.farGroups}</b><span>Sectores / precarga</span><b>{stats.residentSectors} / {stats.pendingSectors}</b>
        <span>Foliage GPU aprox.</span><b>{stats.gpuMB.toFixed(1)} MB</b><span>Render real</span><b>{stats.width} × {stats.height}</b>
        <span>Preparaciones tardías</span><b>{stats.latePrepares}</b>
      </div><label style={{display:'block',marginTop:10}}>Densidad objetivo · <select aria-label="Densidad de foliage" defaultValue={manager.profile} onChange={e=>{manager.profile=Number(e.target.value)}}>{[2000,3000,4000].map(n=><option key={n} value={n}>~{n} grupos visibles</option>)}</select></label>
      <label style={{display:'block',marginTop:8}}><input type="checkbox" defaultChecked onChange={e=>{manager.enabled=e.target.checked}}/> Mostrar foliage (comparación A/B)</label>
      <div style={{display:'flex',gap:7,marginTop:9}}><button onClick={()=>foliageRecording.start(10)} disabled={stats.recording}>{stats.recording?'Grabando…':'Grabar 10 s'}</button><button onClick={exportReport}>Exportar JSON</button></div>
      <p style={{margin:'8px 0 0',opacity:.8}}>Conteo en frustum, incluye plantas ocultas por otros objetos. El render real puede usar resolución adaptativa. Objetivo: 60 FPS / 16,7 ms a 1920 × 1080.</p></>}
    </section>
  </Html>
}
