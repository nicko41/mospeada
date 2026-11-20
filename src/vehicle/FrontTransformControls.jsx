import { useSyncExternalStore } from 'react'
import { frontTransformState as store } from './frontTransformState.js'
import { wheelArmorState,wheelArmorRanges } from './wheelArmorState.js'
import { armorIdleState } from './armorIdleState.js'

function WheelArmorControls(){
  const settings=useSyncExternalStore(wheelArmorState.subscribe,wheelArmorState.snapshot)
  const controls=[['shortening','Acortar hidráulico'],['height','Altura'],['lateral','Desplazamiento lateral'],['depth','Profundidad']]
  return <>
    <h3>Ruedas · composición Armor</h3>
    <small>Los ajustes empiezan en cero. La delantera se baja de base para igualar su altura con la trasera; los controles añaden desplazamientos a esa composición. Altura negativa baja la rueda; lateral positivo va hacia la izquierda de Scott y profundidad negativa hacia su espalda.</small>
    {['front','rear'].map(wheel=>{const title=wheel==='front'?'delantera':'trasera';return <fieldset key={wheel}>
      <legend>Rueda {title}</legend>
      {controls.map(([key,label])=><label className="anime-range" key={key}>
        <span>{label}<output>{Math.round(settings[wheel][key]*100)} cm</output></span>
        <input aria-label={`${label} · rueda ${title}`} type="range" min={wheelArmorRanges[key][0]*100} max={wheelArmorRanges[key][1]*100} step="1" value={Math.round(settings[wheel][key]*100)} onChange={e=>wheelArmorState.setWheel(wheel,key,Number(e.target.value)/100)}/>
      </label>)}
    </fieldset>})}
    <button onClick={()=>wheelArmorState.reset()}>Restaurar ajustes de ruedas</button>
  </>
}

export default function FrontTransformControls() {
  const v=useSyncExternalStore(store.subscribe,store.snapshot)
  const idle=useSyncExternalStore(armorIdleState.subscribe,armorIdleState.snapshot)
  return <section className="anime-settings" aria-label="Transformación del front">
    <h2>Motorcycle → Battloid · montaje completo</h2>
    <small>T al avanzar: wheelie y giro de faros → boost y despegue → T-pose desde la cintura → llegada rápida de CHEST → giro de tapas y salida del tanque → montaje final. La cámara da una vuelta completa.</small>
    <small>La pausa del juego detiene toda la entrada. La revisión manual se habilita al empezar la T-pose en el aire.</small>
    <small>T en Armor: boost vertical → coreografía inversa de piezas en 1 s → posición de salto y caída con suspensión. Pecho y cuffs conservan su coordinación; la duración ajustable corresponde a la ida.</small>
    <small>El rear acompaña al tanque al bajar y retroceder. Sus tramos delanteros se retraen y ambos caballero-right se colocan en las piernas. Los guards llegan a los antebrazos antes de bajar los brazos. En el tramo final, los hidráulicos recogen ambas ruedas hacia la espalda.</small>
    <small>La placa inferior y la parrilla viajan al pecho junto con CHEST. La parrilla se pliega hacia adentro y conserva la reducción diseñada para ocultarse detrás de la placa.</small>
    {v.error&&<p role="alert">{v.error}</p>}
    <div className="weather-presets"><button disabled={!v.ready} onClick={()=>store.request()}>Transformar / Revertir · T</button><button disabled={!v.ready} onClick={()=>v.entryRunning?store.pauseSequence():store.resumeSequence()}>{v.entryRunning?'Pausar':v.sequencePaused?'Reanudar':'Reproducir'}</button></div>
    <label className="anime-range"><span>Motorcycle → Battloid<output>{Math.round(v.progress*100)}%</output></span><input aria-label="Progreso de transformación" type="range" min="0" max="1" step=".001" value={v.progress} disabled={!v.ready||!v.inspection} onChange={e=>store.scrub(e.target.value)}/></label>
    <div className="weather-presets"><button disabled={!v.ready||!v.inspection} onClick={()=>store.stepSequence(-1/60)}>← Fotograma</button><button disabled={!v.ready||!v.inspection} onClick={()=>store.stepSequence(1/60)}>Fotograma →</button></div>
    <label className="anime-range"><span>Duración<output>{v.duration.toFixed(1)} s</output></span><input aria-label="Duración de transformación" type="range" min=".5" max="8" step=".1" value={v.duration} onChange={e=>store.duration(e.target.value)}/></label>
    <button onClick={()=>store.restart()}>Reiniciar transformación</button>
    <fieldset><legend>Scott · reposo Armor</legend>
      <label><input type="checkbox" checked={idle.enabled} onChange={e=>armorIdleState.set({enabled:e.target.checked})}/> Respiración y microgestos</label>
      <label className="anime-range"><span>Intensidad<output>{Math.round(idle.intensity*100)}%</output></span><input aria-label="Intensidad de reposo Armor" type="range" min="0" max="1" step=".05" value={idle.intensity} onChange={e=>armorIdleState.set({intensity:Number(e.target.value)})}/></label>
    </fieldset>
    <WheelArmorControls/>
    <small>{v.ready?`${v.surfaces} superficies vinculadas por identidad de origen.`:'Preparando configuración…'}</small>
    {v.warnings.length>0&&<small>Los dos chest-relieve conservan sus cortes originales; el JSON final los reevaluó con otra forma. Su posición se obtiene de los vértices de contorno.</small>}
    <small>Al llegar las tapas bajan los brazos; después Scott estira y separa las piernas. Al cerrar el montaje, un segundo boost desde rear1 impulsa a Scott con la armadura y las ruedas.</small>
  </section>
}

export function FrontTransformStatus(){
  const v=useSyncExternalStore(store.subscribe,store.snapshot)
  const labels={wheelie:'TRANSFORMACIÓN · WHEELIE',boost:'TRANSFORMACIÓN · BOOST',airpose:'EN EL AIRE · T-POSE',transforming:`TRANSFORMANDO · ${Math.round(v.progress*100)}%`,armorboost:'ARMOR · IMPULSO REAR1',complete:'BATTLOID · T PARA REVERTIR',returnboost:'ARMOR → CYCLONE · BOOST',reversing:'RESTAURANDO MOTORCYCLE',returnpose:'CYCLONE · POSICIÓN DE SALTO',falling:'CYCLONE · ATERRIZANDO',returning:'VOLVIENDO A CONDUCCIÓN'}
  const label=v.message||labels[v.phase]
  return label?<div className="ride-motion-status ride-transform-status" role="status">{label}{v.sequencePaused?' · PAUSADO':''}</div>:null
}
