import {useState,useSyncExternalStore} from 'react'
import {cameraImpactState} from './cameraImpactState.js'
import BoostCameraControls from './BoostCameraControls.jsx'
export default function CameraImpactControls(){
 const value=useSyncExternalStore(cameraImpactState.subscribe,cameraImpactState.snapshot)
 const [page,setPage]=useState('impact')
 const range=(key,label,min,max,step,suffix='')=><label className="anime-range"><span>{label}<output>{Number(value[key]).toFixed(step<1?2:0)}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e=>cameraImpactState.set({[key]:Number(e.target.value)})}/></label>
 return <aside className="anime-settings" aria-label={page==='impact'?'Impactos de cámara':'Boost del Cyclone'}>
  <div className="camera-fx-tabs" role="group" aria-label="Efectos de cámara"><button aria-pressed={page==='impact'} onClick={()=>setPage('impact')}>Impactos</button><button aria-pressed={page==='boost'} onClick={()=>setPage('boost')}>Boost · Cyclone</button></div>
  {page==='boost'?<BoostCameraControls/>:<><h2>Impactos de cámara</h2><small>Shake solo en explosiones de Invid. El desenfoque de impacto se controla por separado.</small>
  <label className="anime-check"><input type="checkbox" checked={value.shakeEnabled} onChange={e=>cameraImpactState.set({shakeEnabled:e.target.checked})}/> Camera shake</label>
  {range('intensity','Intensidad del shake',0,1,.05)}
  {range('explosionPower','Potencia de explosión Invid',1,8,.25,'×')}
  {range('duration','Duración del shake',.06,.7,.01,' s')}
  {range('range','Alcance de impactos',4,140,1,' m')}
  {range('damping','Amortiguación',2,40,.5)}
  {range('maxConcurrent','Impactos simultáneos',1,4,1)}
  <label className="anime-check"><input type="checkbox" checked={value.blurEnabled} onChange={e=>cameraImpactState.set({blurEnabled:e.target.checked})}/> Desenfoque de impacto</label>
  <small>Solo golpes directos y explosiones cercanas. Conserva el centro de la mira y los contornos.</small>
  {range('blurIntensity','Intensidad del desenfoque',0,1,.01)}
  {range('blurPixels','Extensión del desenfoque',.1,24,.1,' px')}
  {range('blurDuration','Duración del desenfoque',.04,.4,.01,' s')}
  {range('blurRange','Alcance del desenfoque',2,80,1,' m')}
  <button onClick={()=>cameraImpactState.reset()}>Restablecer impactos</button></>}
 </aside>
}
