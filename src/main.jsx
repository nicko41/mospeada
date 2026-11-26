import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { registerColliders, cylinderCollider } from './player/collisionWorld'
import * as THREE from 'three'
import { getWalkableHeightAt } from './player/getWalkableHeight'
import TimeOfDay, { timeOfDayState } from './world/TimeOfDay'
import Motorcycle from './vehicle/Motorcycle'
import DrivingHUD from './vehicle/DrivingHUD'
import DrivingLighting from './vehicle/DrivingLighting'
import AnimeRendering from './rendering/AnimeRendering'
import { animeState } from './rendering/animeState.js'
import ForestEnvironment from './world/forest/ForestEnvironment.jsx'
import { activeEnvironment } from './world/environmentConfig.js'
import { weatherState } from './world/weatherState.js'
import {ForestOpeningOverlay} from './world/forest/ForestOpening.jsx'
import {ForestEndingOverlay} from './world/forest/ForestEnding.jsx'
import {forestOpeningState} from './world/forest/forestOpeningState.js'
import {startupRenderReady} from './rendering/renderPreparation.js'
import {updateEntryPreloader} from './ui/entryPreloader.js'
import {entryLoadingMessage} from './ui/cycloneInstrumentModel.js'
timeOfDayState.value = 1
timeOfDayState.target = 1
if (activeEnvironment === 'forest') weatherState.setPreset('sunny')
import './styles.css'
import { desktopInput } from './player/touchInput'
import {preloadInitial,initialProgress,resourceProgress} from './loading/startupProgress.js'
import {initializeGpuPreparation} from './loading/gpuUploads.js'
import {stageStreaming} from './loading/stageStreaming.js'
if(activeEnvironment==='forest'){
  preloadInitial()
  // The next combat's small network set must be discovered before graphics
  // preparation, including a returning visitor who immediately skips the intro.
  // Its GPU work and readiness remain outside the initial loading barrier.
  stageStreaming.prefetchNearRoute().catch(()=>{})
}

const HighwayEnvironment=lazy(()=>import('./world/HighwayEnvironment.jsx'))

function SceneReady({ onReady }) {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 2) onReady(true)
  })
  return null
}

function EntryPreloader({ sceneReady }) {
  const { active, progress, item } = useProgress()
  useSyncExternalStore(resourceProgress.subscribe,resourceProgress.snapshot)
  const renderState = useSyncExternalStore(animeState.subscribe, animeState.snapshot)
  const opening = useSyncExternalStore(forestOpeningState.subscribe, forestOpeningState.snapshot)
  // Wait for the current frame and opening views, never for alternate lighting.
  const renderReady = startupRenderReady(renderState,opening.phase,activeEnvironment==='forest')
  const highestProgress = useRef(0)
  const revealed = useRef(false)

  useEffect(() => {
    const overlay = document.getElementById('entry-preloader')
    if (!overlay) return
    if(revealed.current){overlay.remove();return}

    const forest=activeEnvironment==='forest',initial=initialProgress(sceneReady,renderReady,renderState.startupPreparation)
    highestProgress.current = Math.max(highestProgress.current, forest?initial.percent:Math.min(progress, 95))
    updateEntryPreloader(highestProgress.current,forest?initial.message:entryLoadingMessage({active,sceneReady,renderReady,item}))
    if ((forest?!initial.complete:active) || !sceneReady || !renderReady) return

    updateEntryPreloader(100,'SYSTEM READY')
    overlay.classList.add('is-ready')
    revealed.current=true
    desktopInput.ready = true
    window.dispatchEvent(new Event('game-ready'))
    const removeTimer=window.setTimeout(()=>overlay.remove(),180)
    return()=>window.clearTimeout(removeTimer)
  }, [active, progress, sceneReady, renderReady,renderState.startupPreparation, item,resourceProgress.snapshot()])

  return null
}

function Scene({ onReady }) {
  const forest = activeEnvironment === 'forest'
  return <>
    {forest ? <ForestEnvironment /> : <HighwayEnvironment />}
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
          onCreated={({gl})=>initializeGpuPreparation(gl)}
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
      <ForestEndingOverlay />
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
