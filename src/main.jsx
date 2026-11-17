import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import FirstPersonRig from './player/FirstPersonRig'
import MeleePrototype from './player/MeleePrototype'
import BatViewModel from './player/BatViewModel'
import PlayerDamageFeedback from './player/PlayerDamageFeedback'
import PlayerHealthBar from './player/PlayerHealthBar'
import ColliderDebug from './player/ColliderDebug'
import { registerColliders, cylinderCollider } from './player/collisionWorld'
import * as THREE from 'three'
import { getWalkableHeightAt } from './player/getWalkableHeight'
import PhoneLight from './player/PhoneLight'
import CameraLocomotion from './player/CameraLocomotion'
import FlashlightEnergyBar from './player/FlashlightEnergyBar'
import EntityImpactFeedback from './world/EntityImpactFeedback'
import DirtRoad from './world/DirtRoad'
import Rain from './world/Rain'
import Lightning from './world/Lightning'
import AmbienceAudio from './world/AmbienceAudio'
import ApparitionSystem from './world/ApparitionSystem'
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
import ZombieTest from './world/ZombieTest'
import RuralPowerLines, { RURAL_POLES } from './world/RuralPowerLines'
import { createAgedPoleWood } from './world/agedPoleWood'
import TimeOfDay from './world/TimeOfDay'
import CasetaInteraction from './narrative/CasetaInteraction'
import NarrativeUI from './narrative/NarrativeUI'
import HighwaySequence from './narrative/HighwayNarrative'
import './styles.css'
import MobileControls from './player/MobileControls'
import MobileOrientation from './player/MobileOrientation'
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
      <ParkedRangeRover />

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
  const startedAt = useRef(performance.now())
  const highestProgress = useRef(0)

  useEffect(() => {
    const overlay = document.getElementById('entry-preloader')
    const fill = document.getElementById('entry-progress-fill')
    if (!overlay || !fill) return

    highestProgress.current = Math.max(highestProgress.current, Math.min(progress, 95))
    fill.style.width = `${highestProgress.current}%`
    fill.parentElement.setAttribute('aria-valuenow', Math.round(highestProgress.current))
    if (active || !sceneReady) return

    let removeTimer
    const finishTimer = window.setTimeout(() => {
      fill.style.width = '100%'
      fill.parentElement.setAttribute('aria-valuenow', '100')
      removeTimer = window.setTimeout(() => {
        overlay.classList.add('is-ready')
        removeTimer = window.setTimeout(() => {
          overlay.remove()
          desktopInput.ready = true
          window.dispatchEvent(new Event('game-ready'))
        }, 550)
      }, 300)
    }, Math.max(350, 900 - (performance.now() - startedAt.current)))

    return () => {
      window.clearTimeout(finishTimer)
      window.clearTimeout(removeTimer)
    }
  }, [active, progress, sceneReady])

  return null
}

function Scene({ onReady }) {
  return (
    <>
      <color attach="background" args={['#030507']} />
      <fogExp2 attach="fog" args={['#0b0e0f', 0.068]} />

      <TimeOfDay />
      <HighwaySequence />
      <OvercastSky />
      <Landscape />
      <Suspense fallback={null}>
        <ZombieTest />
      </Suspense>
      <GroundMist />
      <Rain />
      <Lightning />
      <AmbienceAudio />
      <ApparitionSystem />
      <PhoneLight />
      <FirstPersonRig />
      <CameraLocomotion />
      <MeleePrototype />
      <EntityImpactFeedback />
      <Suspense fallback={null}><BatViewModel /></Suspense>
      <PlayerDamageFeedback />
      <ColliderDebug />
      <CasetaInteraction />
      <SceneReady onReady={onReady} />
    </>
  )
}

function App() {
  const [sceneReady, setSceneReady] = useState(false)
  return (
    <main className="app">
      <EntryPreloader sceneReady={sceneReady} />
      <MobileOrientation>
      <Canvas
        shadows
        camera={{ fov: 65, near: 0.1, far: 220 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Scene onReady={setSceneReady} />
        </Suspense>
      </Canvas>

      <div className="hud">
        <PlayerHealthBar />
        <FlashlightEnergyBar />
        <div className="crosshair" aria-hidden="true" />
        <NarrativeUI />
        <MobileControls />
      </div>
      </MobileOrientation>
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
