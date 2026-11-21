import { useState, useSyncExternalStore } from 'react'
import { bikeConfig, TEST_STARTS } from './bikeConfig.js'
import { rideUI, rideCommand } from './rideUI.js'
import './driving.css'
import AnimeControls, { AnimeOverlay } from '../rendering/AnimeControls'
import SurfaceBrushPanel from '../rendering/SurfaceBrushPanel'
import WeatheringPanel from './WeatheringPanel.jsx'
import VFXPanel from '../vfx/VFXPanel.jsx'
import { weatherState } from '../world/weatherState.js'
import { timeOfDayState } from '../world/TimeOfDay.jsx'
import FrontTransformControls, { FrontTransformStatus } from './FrontTransformControls.jsx'
import ArmorControls from './ArmorControls.jsx'
import { activeEnvironment } from '../world/environmentConfig.js'

const tuning = [
  ['acceleration', 'Aceleración', 2, 24, 0.2], ['braking', 'Frenado', 4, 30, 0.5],
  ['maxSpeed', 'Velocidad máxima · m/s', 16, 75, 1], ['steeringSensitivity', 'Dirección · rad', 0.2, 0.52, 0.01],
  ['boostImpulse', 'Golpe de turbina · m/s', 4, 18, 0.5], ['launchAcceleration', 'Tirón de salida', 0, 10, 0.5],
  ['maxLean', 'Inclinación máxima · rad', 0.2, 0.65, 0.01],
  ['suspensionStiffness', 'Rigidez', 60, 240, 5], ['suspensionDamping', 'Amortiguación', 10, 32, 1],
  ['forkExtension', 'Extensión horquilla · m', 0.01, 0.055, 0.001], ['forkCompression', 'Compresión horquilla · m', 0.005, 0.060, 0.001],
  ['handbrakeYawRate', 'Fuerza de coleada', 0.7, 2.2, 0.05], ['handbrakeWagAngle', 'Balanceo al bloquear atrás', 0, 0.18, 0.01],
  ['pitchIntensity', 'Transferencia de peso', 0, 0.012, 0.0001], ['airGravityScale', 'Peso en el salto', 1, 2.2, 0.05],
  ['terrainLaunchGain', 'Impulso al despegar', 1, 3.5, 0.05], ['landingDamping', 'Amortiguación al aterrizar', 3, 20, 0.5],
  ['maxTerrainLaunchSpeed', 'Impulso vertical máximo · m/s', 1, 14, 0.1], ['cameraSmoothing', 'Respuesta cámara', 1, 8, 0.2],
]
export default function DrivingHUD() {
  const data = useSyncExternalStore(rideUI.subscribe, rideUI.snapshot)
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState('weather')
  const weather = useSyncExternalStore(weatherState.subscribe, weatherState.snapshot)
  const [flight, setFlight] = useState(bikeConfig.flightEnabled)
  const armor=data.controlMode?.startsWith('ARMOR_')
  return <div className="driving-hud camera-active">
    <AnimeOverlay />
    <FrontTransformStatus />
    <header><span className="ride-label">MOSPEADA / {activeEnvironment === 'forest' ? 'LEVEL 01 · FOREST' : armor?'ARMOR · DEMO DE MOVIMIENTO':'PRUEBA DE CONDUCCIÓN'}</span><strong>VR-052F <span>{armor?'ARMOR':'CYCLONE'}</span></strong><small>Scott Bernard · {armor?data.controlMode==='ARMOR_HOVER'?'HOVER':'GROUND':data.location}</small></header>
    <div className="ride-actions"><button onClick={() => rideCommand({ pause: true })}>{data.paused ? 'Continuar · P' : 'Pausa · P'}</button><button onClick={() => rideCommand({ camera: true })}>Vista · C</button><button onClick={() => rideCommand({ centerCamera: true })}>Recentrar</button><button onClick={() => setOpen(!open)} aria-expanded={open}>Ajustes</button></div>
    {open && <aside className="ride-settings" aria-label="Ajustes del juego" onKeyDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      <div className="ride-settings-heading"><h2>Ajustes</h2><button aria-label="Cerrar ajustes" onClick={() => setOpen(false)}>×</button></div>
      <div className="ride-settings-tabs" role="group" aria-label="Categorías de ajustes">{[['weather', 'Clima'], ['driving', 'Conducción'],['armor','Armor'], ['anime', 'Anime'], ['brush', 'Reflejo'], ['soil', 'Suciedad'], ['vfx', 'VFX · terreno'], ['transform', 'Transformación']].map(([key, label]) => <button key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}</div>
      <div className="ride-settings-body">
        {section === 'weather' && <section className="anime-settings" aria-label="Clima y hora"><h2>Clima y hora</h2>
          <div className="weather-presets"><button aria-pressed={weather === 'sunny'} onClick={() => { weatherState.setPreset('sunny'); timeOfDayState.target = 1 }}>Día soleado</button><button aria-pressed={weather === 'storm'} onClick={() => weatherState.setPreset('storm')}>Tormenta</button></div>
          <small>{activeEnvironment === 'forest' ? 'Nivel 01: luz diurna suave y bruma cian. Cambiá de entorno en Conducción y escenario.' : 'Cielo azul con nubes blancas, sin niebla, lluvia ni truenos. El terreno conserva su humedad actual.'}</small>
          <div className="weather-presets"><button onClick={() => { timeOfDayState.target = 1 }}>Día · N</button><button onClick={() => { timeOfDayState.target = 0 }}>Noche · M</button></div>
        </section>}
        {section === 'driving' && <div className="ride-tuning"><h2>Conducción y escenario</h2><label><span>Escenario de prueba</span><select aria-label="Escenario de prueba" defaultValue="" onChange={e => { rideCommand({ start: e.target.value }); e.target.value = '' }}><option value="" disabled>Elegir escenario…</option>{Object.entries(TEST_STARTS).map(([key, start], i) => <option key={key} value={key}>{i + 1} · {start.label}</option>)}</select></label><label className="ride-flight-option"><input type="checkbox" checked={flight} onChange={event => { bikeConfig.flightEnabled = event.target.checked; setFlight(event.target.checked) }} /> Despegue por inercia</label>{tuning.map(([key, label, min, max, step]) => <label key={key}><span>{label}</span><input aria-label={label} type="range" min={min} max={max} step={step} defaultValue={bikeConfig[key]} onChange={e => { bikeConfig[key] = Number(e.target.value) }} /></label>)}<small>Se aplican al instante durante esta sesión.</small></div>}
        {section === 'anime' && <AnimeControls />}
        {section === 'brush' && <SurfaceBrushPanel />}
        {section === 'soil' && <WeatheringPanel />}
        {section === 'vfx' && <VFXPanel />}
        {section === 'transform' && <FrontTransformControls />}
        {section === 'armor' && <ArmorControls/>}
      </div>
    </aside>}
    <div className="ride-speed"><strong>{Math.round(data.speed).toString().padStart(2, '0')}</strong><span>KM/H · {data.reverse ? 'A PIE' : 'D'}</span><div className="ride-meter"><i style={{ width: `${Math.min(100, data.speed / (bikeConfig.maxSpeed * 3.6) * 100)}%` }} /></div></div>
    <div className={`ride-boost ${data.boost ? 'active' : ''}`} role="status">{data.boost ? 'BOOST · EMPUJE DE TURBINA' : data.boostCooldown > 0 ? `BOOST · RECARGA ${data.boostCooldown.toFixed(1)} s` : 'SHIFT · BOOST LISTO'}<div className="ride-meter"><i style={{ width: `${Math.max(0, 1 - (data.boostCooldown || 0) / bikeConfig.boostCooldown) * 100}%` }} /></div></div>
    <div className="ride-telemetry">{armor?<><span>{data.controlMode} <button onClick={()=>rideCommand({armorGround:true})}>G · cambiar</button></span><span>ALTURA <b>{(data.armorHeight||0).toFixed(1)} m</b></span><span>VERTICAL <b>{(data.verticalSpeed||0).toFixed(1)} m/s</b></span></>:<><span>LEAN <b>{Math.abs(data.lean).toFixed(0)}°</b></span><span>HORQUILLA <b>{(data.frontTravel * 1000).toFixed(0)} mm</b></span><span>TRASERA <b>{(data.rearTravel * 1000).toFixed(0)} mm</b></span></>}</div>
    <footer>{armor?'ARMOR · WASD mover · Mouse mirar / clic capturar · SHIFT + WASD boost (Ground: correr) · ESPACIO salto · CTRL descender · G Hover/Ground · T transformar':data.riderMode === 'onFoot' ? 'Scott a pie · WASD caminar · SHIFT correr · CTRL agacharse · F subir cerca · mantener botón derecho para mirar' : 'Mantener botón derecho para mirar · rueda zoom · C vista · W acelerar · S frenar / atrás · SHIFT boost · ESPACIO freno de mano · CTRL wheelie · F bajar · A D girar · M noche · N día'}</footer>
    {(data.airborne || data.handbrake || data.wheelieAngle > 0.05 || data.riderMode && data.riderMode !== 'mounted') && <div className="ride-motion-status">{data.riderMode === 'stopping' ? 'FRENANDO PARA BAJAR · F CANCELAR' : data.riderMode === 'dismounting' ? 'BAJANDO DEL CYCLONE' : data.riderMode === 'mounting' || data.riderMode === 'approaching' ? 'SUBIENDO AL CYCLONE' : data.riderMode === 'onFoot' ? 'A PIE · F CERCA DE LA MOTO PARA SUBIR' : data.wheelieAngle > 0.05 ? data.wheelieRemaining > 0 ? `WHEELIE · ${data.wheelieRemaining.toFixed(1)} s · CTRL` : 'BAJANDO EL FRENTE' : data.airborne ? 'EN AIRE' : `FRENO DE MANO · DERRAPE ${Math.abs(data.slip || 0).toFixed(0)}°`}</div>}
    {data.paused && <div className="ride-paused"><strong>EN PAUSA</strong><button onClick={() => rideCommand({ pause: true })}>Continuar conducción</button></div>}
    {data.blocked && !data.paused && <p className="ride-blocked">Obstáculo o límite del terreno · Mantener S para retroceder · R para reiniciar</p>}
    <div className="ride-touch">{[['KeyA', '←'], ['KeyD', '→'], ['KeyS', 'FRENO\nATRÁS'], ['Space', 'MANO'], ['KeyW', 'GAS'], ['ShiftLeft', 'BOOST']].map(([code, label]) => <button key={code} style={{ whiteSpace: 'pre-line' }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); rideCommand({ touch: { [code]: true } }) }} onPointerUp={() => rideCommand({ touch: { [code]: false } })} onPointerCancel={() => rideCommand({ touch: { [code]: false } })}>{label}</button>)}</div>
  </div>
}
