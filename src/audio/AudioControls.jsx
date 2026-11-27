import {useState,useSyncExternalStore} from 'react'
import {gameAudio} from './gameAudio.js'
import {engineAudioState,ENGINE_AUDIO_CONTROLS} from './engineAudioState.js'
const controls=[['gallantShot','Disparos Gallant'],['targetLock','Target · lock rojo'],['terrainDirtPass','Terreno · tierra/desierto'],['terrainGrassPass','Terreno · pasto'],['terrainDirtDrift','Terreno · derrape'],['cycloneBoost','Cyclone · boost'],['cycloneTransform','Cyclone ↔ Armor · transformación'],['armorStrafe','Armor · strafe'],['armorStep','Armor · pisadas'],['armorLanding','Armor · aterrizaje'],['scoutOrb','Scout · orbs'],['invidExplosion','Invid · explosiones'],['droneFlight','Drones · vuelo'],['droneExplosion','Drones · explosión']]

export default function AudioControls({driving=false,onToggleDriving}){
  const [master,setMaster]=useState(gameAudio.masterVolume),[levels,setLevels]=useState(()=>Object.fromEntries(Object.keys(gameAudio.effects).map(name=>[name,gameAudio.getVolume(name)])))
  const engine=useSyncExternalStore(engineAudioState.subscribe,engineAudioState.snapshot)
  return <section className="ride-tuning" aria-label="Sonido"><h2>Sonido</h2>
    <div className="weather-presets"><button onClick={event=>{event.currentTarget.blur();onToggleDriving?.()}}>{driving?'Pausar conducción':'Continuar y calibrar'}</button></div>
    <h3>Motor Cyclone</h3>
    {ENGINE_AUDIO_CONTROLS.map(([key,label,min,max,step,unit])=><label key={key}><span>{label} · {engine[key].toFixed(2)}{unit}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={engine[key]} onChange={event=>engineAudioState.set(key,event.target.value)}/></label>)}
    <button onClick={()=>engineAudioState.reset()}>Restaurar motor</button>
    <h3>Mezcla de efectos</h3>
    <label><span>Efectos de sonido · {Math.round(master*100)}%</span><input aria-label="Volumen de efectos de sonido" type="range" min="0" max="1" step="0.01" value={master} onChange={event=>{const value=Number(event.target.value);gameAudio.setMasterVolume(value);setMaster(value)}}/></label>
    {controls.map(([name,label])=><label key={name}><span>{label} · {Math.round(levels[name]*100)}%</span><input aria-label={'Volumen de '+label.toLowerCase()} type="range" min="0" max={gameAudio.effects[name].maxVolume??1} step="0.01" value={levels[name]} onChange={event=>{const value=Number(event.target.value);gameAudio.setVolume(name,value);setLevels(previous=>({...previous,[name]:value}))}}/></label>)}
    <small>Se aplican al instante durante esta sesión. La música conserva su volumen independiente.</small>
  </section>
}
