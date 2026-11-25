import {useSyncExternalStore} from 'react'
import {CINEMATIC_NAMES,CINEMATIC_PRESETS,CINEMATIC_TYPES,cinematicCombatState as store} from './cinematicCombatState.js'
export default function CinematicCombatControls(){
 const config=useSyncExternalStore(store.subscribe,store.snapshot)
 const check=(key,label)=><label className="anime-check"><input type="checkbox" checked={config[key]} onChange={e=>store.set({[key]:e.target.checked})}/>{label}</label>
 const slider=(key,label,min,max,step)=><label className="anime-range"><span>{label}<output>{config[key].toFixed(step<1?2:0)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={config[key]} onChange={e=>store.set({[key]:Number(e.target.value)})}/></label>
 const fields=[['intensity','Intensidad',0,2,.05],['duration','Duración · s',.06,.9,.01],['minDistance','Distancia plena · m',0,8,.25],['maxDistance','Alcance · m',1,80,1],['opacity','Opacidad',0,.7,.01],['size','Tamaño',.01,1.5,.01],['particles','Partículas por evento',0,24,1],['blurAmount','Blur · px',0,4,.1],['distortionAmount','Distorsión · px',0,2,.05],['cooldown','Cooldown · s',.025,1,.025],['cap','Eventos simultáneos',1,3,1],['directionality','Lateralidad',0,1,.05]]
 return <section className="anime-settings cinematic-settings" aria-label="Cinematic Combat Screen FX"><h2>Cine · combate</h2><small>Destellos, amenazas y residuos del combate. El boost y las explosiones aprobadas conservan sus propios ajustes.</small>
  <label className="anime-select">Preset<select aria-label="Preset cinematográfico" value={config.preset} onChange={e=>store.preset(e.target.value)}>{!CINEMATIC_PRESETS.includes(config.preset)&&<option>Custom</option>}{CINEMATIC_PRESETS.map(p=><option key={p}>{p}</option>)}</select></label>
  {check('enabled','Activar Cinematic Combat FX')}
  {slider('intensity','Intensidad global',0,1.8,.05)}{slider('accumulationCap','Cap de mezcla',.1,.7,.01)}{slider('maxConcurrent','Eventos máximos',1,8,1)}{slider('maxParticles','Partículas máximas',0,96,1)}{slider('directionality','Influencia direccional',0,1,.05)}
  {check('blurEnabled','Blur transitorio de amenazas')}{check('exposureEnabled','Exposición breve de explosión')}{slider('exposureAmount','Exposición adicional',0,.12,.01)}
  {check('chromaticEnabled','Aberración cromática de shockwave')}{slider('chromaticAmount','Aberración · px',0,.35,.01)}
  {check('groundShakeEnabled','Respuesta mínima de cámara al suelo')}{slider('groundShakeIntensity','Intensidad de respuesta al suelo',0,.025,.001)}
  {CINEMATIC_TYPES.map(kind=>{const f=config.families[kind];return <details key={kind} className="cinematic-family"><summary>{CINEMATIC_NAMES[kind]}</summary>
   <label className="anime-check"><input aria-label={'Activar '+CINEMATIC_NAMES[kind]} type="checkbox" checked={f.enabled} onChange={e=>store.setFamily(kind,{enabled:e.target.checked})}/>Activar efecto</label>
   {[...fields,...(kind==='explosion'?[['particleDuration','Duración de partículas · s',.06,.9,.01],['particleSize','Tamaño de partículas · m',0,.45,.01],['particleOpacity','Opacidad de partículas',0,1,.01]]:[])].map(([key,label,min,max,step])=><label key={key} className="anime-range"><span>{label}<output>{f[key].toFixed(step<1?2:0)}</output></span><input aria-label={CINEMATIC_NAMES[kind]+' · '+label} type="range" min={min} max={max} step={step} value={f[key]} onChange={e=>store.setFamily(kind,{[key]:Number(e.target.value)})}/></label>)}
  </details>})}
  <button onClick={()=>store.reset()}>Restablecer Normal</button>
 </section>
}
