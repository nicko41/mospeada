import {useSyncExternalStore} from 'react'
import {boostCameraState} from './boostCameraState.js'
export default function BoostCameraControls(){
 const value=useSyncExternalStore(boostCameraState.subscribe,boostCameraState.snapshot)
 const range=(key,label,min,max,step,suffix='')=><label className="anime-range"><span>{label}<output>{Number(value[key]).toFixed(step<1?2:0)}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value[key]} onChange={e=>boostCameraState.set({[key]:Number(e.target.value)})}/></label>
 const check=(key,label)=><label className="anime-check"><input type="checkbox" checked={value[key]} onChange={e=>boostCameraState.set({[key]:e.target.checked})}/>{label}</label>
 return <section aria-label="Boost Camera FX"><h2>Cyclone · boost</h2><small>Prueba de intensidad alta. Scott, Cyclone y HUD protegidos del blur radial.</small>
  {check('blurEnabled','Blur radial periférico')}
  {range('blurIntensity','Intensidad máxima del blur',0,1,.01)}
  {range('clearRadius','Radio de la zona central nítida',.25,.85,.05)}
  {range('peripheralIntensity','Intensidad en los bordes',0,1,.05)}
  {range('blurPixels','Extensión radial',.5,64,.5,' px')}
  {check('fovEnabled','FOV de aceleración')}
  {range('maxFov','Incremento máximo de FOV',0,20,.25,'°')}
  {range('enterRate','Velocidad de entrada',1,16,.5)}
  {range('exitRate','Velocidad de salida',1,10,.5)}
  {check('shakeEnabled','Impulso de shake al iniciar')}
  {range('shakeIntensity','Intensidad del impulso inicial',0,1,.01)}
  <small>El impulso respeta el apagado general del shake y da prioridad a los impactos de combate.</small>
  <button onClick={()=>boostCameraState.reset()}>Restablecer boost</button>
 </section>
}
