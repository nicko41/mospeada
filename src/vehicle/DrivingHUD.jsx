import { useState, useSyncExternalStore } from 'react'
import { bikeConfig, TEST_STARTS } from './bikeConfig.js'
import { rideUI, rideCommand } from './rideUI.js'
import './driving.css'
import AnimeControls from '../rendering/AnimeControls'

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
  const [flight, setFlight] = useState(bikeConfig.flightEnabled)
  return <div className="driving-hud camera-active">
    <AnimeControls />
    <header><span className="ride-label">MOSPEADA / PRUEBA DE CONDUCCIÓN</span><strong>VR-052F <span>CYCLONE</span></strong><small>Scott Bernard · {data.location}</small></header>
    <nav aria-label="Escenario de prueba">{Object.entries(TEST_STARTS).map(([key, start], i) => <button key={key} onClick={() => rideCommand({ start: key })}>{i + 1} · {start.label}</button>)}</nav>
    <div className="ride-actions"><button onClick={() => rideCommand({ pause: true })}>{data.paused ? 'Continuar · P' : 'Pausa · P'}</button><button onClick={() => rideCommand({ camera: true })}>Vista · C</button><button onClick={() => rideCommand({ centerCamera: true })}>Recentrar</button><button onClick={() => setOpen(!open)} aria-expanded={open}>Ajustes</button></div>
    {open && <label className="ride-flight-option"><input type="checkbox" checked={flight} onChange={event => { bikeConfig.flightEnabled = event.target.checked; setFlight(event.target.checked) }} /> Despegue por inercia</label>}
    {open && <aside className="ride-tuning"><h2>Ajustes de conducción</h2>{tuning.map(([key, label, min, max, step]) => <label key={key}><span>{label}</span><input type="range" min={min} max={max} step={step} defaultValue={bikeConfig[key]} onChange={e => { bikeConfig[key] = Number(e.target.value) }} /></label>)}<small>Se aplican al instante durante esta sesión.</small></aside>}
    <div className="ride-speed"><strong>{Math.round(data.speed).toString().padStart(2, '0')}</strong><span>KM/H · {data.reverse ? 'A PIE' : 'D'}</span><div className="ride-meter"><i style={{ width: `${Math.min(100, data.speed / (bikeConfig.maxSpeed * 3.6) * 100)}%` }} /></div></div>
    <div className={`ride-boost ${data.boost ? 'active' : ''}`} role="status">{data.boost ? 'BOOST · EMPUJE DE TURBINA' : data.boostCooldown > 0 ? `BOOST · RECARGA ${data.boostCooldown.toFixed(1)} s` : 'SHIFT · BOOST LISTO'}<div className="ride-meter"><i style={{ width: `${Math.max(0, 1 - (data.boostCooldown || 0) / bikeConfig.boostCooldown) * 100}%` }} /></div></div>
    <div className="ride-telemetry"><span>LEAN <b>{Math.abs(data.lean).toFixed(0)}°</b></span><span>HORQUILLA <b>{(data.frontTravel * 1000).toFixed(0)} mm</b></span><span>TRASERA <b>{(data.rearTravel * 1000).toFixed(0)} mm</b></span></div>
    <footer>{data.riderMode === 'onFoot' ? 'Scott a pie · WASD caminar · SHIFT correr · CTRL agacharse · F subir cerca · mantener botón derecho para mirar' : 'Mantener botón derecho para mirar · rueda zoom · C vista · W acelerar · S frenar / atrás · SHIFT boost · ESPACIO freno de mano · CTRL wheelie · F bajar · A D girar · M noche · N día'}</footer>
    {(data.airborne || data.handbrake || data.wheelieAngle > 0.05 || data.riderMode && data.riderMode !== 'mounted') && <div className="ride-motion-status">{data.riderMode === 'stopping' ? 'FRENANDO PARA BAJAR · F CANCELAR' : data.riderMode === 'dismounting' ? 'BAJANDO DEL CYCLONE' : data.riderMode === 'mounting' || data.riderMode === 'approaching' ? 'SUBIENDO AL CYCLONE' : data.riderMode === 'onFoot' ? 'A PIE · F CERCA DE LA MOTO PARA SUBIR' : data.wheelieAngle > 0.05 ? data.wheelieRemaining > 0 ? `WHEELIE · ${data.wheelieRemaining.toFixed(1)} s · CTRL` : 'BAJANDO EL FRENTE' : data.airborne ? 'EN AIRE' : `FRENO DE MANO · DERRAPE ${Math.abs(data.slip || 0).toFixed(0)}°`}</div>}
    {data.paused && <div className="ride-paused"><strong>EN PAUSA</strong><button onClick={() => rideCommand({ pause: true })}>Continuar conducción</button></div>}
    {data.blocked && !data.paused && <p className="ride-blocked">Obstáculo o límite del terreno · Mantener S para retroceder · R para reiniciar</p>}
    <div className="ride-touch">{[['KeyA', '←'], ['KeyD', '→'], ['KeyS', 'FRENO\nATRÁS'], ['Space', 'MANO'], ['KeyW', 'GAS'], ['ShiftLeft', 'BOOST']].map(([code, label]) => <button key={code} style={{ whiteSpace: 'pre-line' }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); rideCommand({ touch: { [code]: true } }) }} onPointerUp={() => rideCommand({ touch: { [code]: false } })} onPointerCancel={() => rideCommand({ touch: { [code]: false } })}>{label}</button>)}</div>
  </div>
}
