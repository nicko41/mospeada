import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { registerColliders, cylinderCollider } from './player/collisionWorld'
import * as THREE from 'three'
import { getWalkableHeightAt } from './player/getWalkableHeight'
import DirtRoad from './world/DirtRoad'
import Rain from './world/Rain'
import Lightning from './world/Lightning'
import AmbienceAudio from './world/AmbienceAudio'
import Ground from './world/Ground'
import GroundMist from './world/GroundMist'
import GuardHut from './world/GuardHut'
import ParkedRangeRover from './world/ParkedRangeRover'
import NaturePackSample from './world/NaturePackSample'
import OvercastSky from './world/OvercastSky'
import Puddles from './world/Puddles'
import RoadsideVegetation from './world/RoadsideVegetation'
import Highway from './world/sectors/Highway'
import TreeClusters from './world/TreeClusters'
import RuralPowerLines, { RURAL_POLES } from './world/RuralPowerLines'
import { createAgedPoleWood } from './world/agedPoleWood'
import TimeOfDay, { timeOfDayState } from './world/TimeOfDay'
import Motorcycle from './vehicle/Motorcycle'
import DrivingHUD from './vehicle/DrivingHUD'
import DrivingLighting from './vehicle/DrivingLighting'
import JumpTestMound from './vehicle/JumpTestMound'
import AnimeRendering from './rendering/AnimeRendering'
import { animeState } from './rendering/animeState.js'
import ForestEnvironment from './world/forest/ForestEnvironment.jsx'
import { activeEnvironment } from './world/environmentConfig.js'
import { weatherState } from './world/weatherState.js'
import {ForestOpeningOverlay} from './world/forest/ForestOpening.jsx'
import {forestOpeningState} from './world/forest/forestOpeningState.js'
import {startupRenderReady} from './rendering/renderPreparation.js'
timeOfDayState.value = 1
timeOfDayState.target = 1
if (activeEnvironment === 'forest') weatherState.setPreset('sunny')
import './styles.css'
import { desktopInput } from './player/touchInput'

function Pole({ x, z, leanX, leanZ, wood }) {
  return (
    <group position={[x, 0, z]} rotation={[leanX, 0, leanZ]}>
      <mesh position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 6.5, 8]} />
        <primitive object={wood.trunk} attach="material" />
      </mesh>
      <mesh position={[0, 5.7, 0]} castShadow>
        <boxGeometry args={[1.7, 0.1, 0.1]} />
        <primitive object={wood.arm} attach="material" />
      </mesh>
    </group>
  )
}

function Poles() {
  useLayoutEffect(() => registerColliders(RURAL_POLES.map(({ x, z }) =>
    cylinderCollider(x, z, 0.25, 0, 6.5))), [])
  const materials = useMemo(() => {
    const trunk = createAgedPoleWood()
    const arm = createAgedPoleWood(true)
    const tints = ['#dedbd2', '#ccc9bf', '#e8e3d9']
    return tints.map((color) => ({
      trunk: new THREE.MeshStandardMaterial({
        map: trunk.map, bumpMap: trunk.bumpMap, bumpScale: 0.035,
        color, roughness: 1, metalness: 0,
      }),
      arm: new THREE.MeshStandardMaterial({
        map: arm.map, bumpMap: arm.bumpMap, bumpScale: 0.026,
        color, roughness: 1, metalness: 0,
      }),
    }))
  }, [])
  return RURAL_POLES.map((pole, index) => (
    <Pole key={index} {...pole} wood={materials[index % materials.length]} />
  ))
}

function Landscape() {
  return (
    <>
      <Ground />
      <Puddles />
      <DirtRoad />
      <Highway />
      <RoadsideVegetation />
      <TreeClusters />
      <Suspense fallback={null}><NaturePackSample /></Suspense>
      <Poles />
      <RuralPowerLines />

      <GuardHut position={[28, getWalkableHeightAt(28, -105), -105]} />
      <ParkedRangeRover drivable={false} />

    </>
  )
}

function SceneReady({ onReady }) {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 2) onReady(true)
  })
  return null
}

function EntryPreloader({ sceneReady }) {
  const { active, progress } = useProgress()
  const renderState = useSyncExternalStore(animeState.subscribe, animeState.snapshot)
  const opening = useSyncExternalStore(forestOpeningState.subscribe, forestOpeningState.snapshot)
  // Finish GPU preparation behind the loader, before music/fade/camera begin.
  // Otherwise night-program reflection competes with the visible cinematic.
  const renderReady = startupRenderReady(renderState,opening.phase)
  const highestProgress = useRef(0)
  const revealed = useRef(false)

  useEffect(() => {
    const overlay = document.getElementById('entry-preloader')
    const fill = document.getElementById('entry-progress-fill')
    if (!overlay || !fill) return
    if(revealed.current){overlay.remove();return}

    highestProgress.current = Math.max(highestProgress.current, Math.min(progress, 95))
    fill.style.width = `${highestProgress.current}%`
    fill.parentElement.setAttribute('aria-valuenow', Math.round(highestProgress.current))
    const status = document.getElementById('entry-loading-status')
    if (status) status.textContent = active || !sceneReady ? 'Cargando escenario…' : !renderReady ? 'Preparando iluminación y estilos…' : 'Listo'
    if (active || !sceneReady || !renderReady) return

    fill.style.width = '100%'
    fill.parentElement.setAttribute('aria-valuenow', '100')
    overlay.classList.add('is-ready')
    revealed.current=true
    desktopInput.ready = true
    window.dispatchEvent(new Event('game-ready'))
    const removeTimer=window.setTimeout(()=>overlay.remove(),180)
    return()=>window.clearTimeout(removeTimer)
  }, [active, progress, sceneReady, renderReady])

  return null
}

function Scene({ onReady }) {
  const forest = activeEnvironment === 'forest'
  return <>
    {forest ? <ForestEnvironment /> : <>
      <color attach="background" args={['#839196']} />
      <fogExp2 attach="fog" args={['#839196', 0.068]} />
      <TimeOfDay />
      <OvercastSky />
      <Landscape />
      <JumpTestMound />
      <GroundMist />
      <Rain />
      <Lightning />
      <AmbienceAudio />
    </>}
    <DrivingLighting manageFog={!forest} />
    <Motorcycle />
    <AnimeRendering />
    <SceneReady onReady={onReady} />
  </>
}

function App() {
  const [sceneReady, setSceneReady] = useState(false)
  const opening=useSyncExternalStore(forestOpeningState.subscribe,forestOpeningState.snapshot)
  return (
    <main className="app" data-forest-opening={opening.phase!=='done'?'active':undefined}>
      <EntryPreloader sceneReady={sceneReady} />
      <Canvas
        shadows="percentage"
        camera={{ fov: 65, near: 0.1, far: activeEnvironment === 'forest' ? 700 : 220 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Scene onReady={setSceneReady} />
        </Suspense>
      </Canvas>

      <DrivingHUD />
      <ForestOpeningOverlay />
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
