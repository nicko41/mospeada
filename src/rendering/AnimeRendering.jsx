import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AnimeRenderer } from './AnimeRenderer.js'
import { animeState } from './animeState.js'
import { timeOfDayState } from '../world/TimeOfDay.jsx'
import { rideMotion } from '../vehicle/rideMotion.js'
import {desktopInput} from '../player/touchInput.js'
import {frontTransformState} from '../vehicle/frontTransformState.js'
import {forestOpeningState} from '../world/forest/forestOpeningState.js'
import {forestEndingState} from '../world/forest/forestEndingState.js'
import {canPrepareLighting} from './renderPreparation.js'
import {forestFirstPassViews} from '../world/forest/forestFirstPassPreparation.js'
import {Vector3} from 'three'
import {CameraImpactFX} from './CameraImpactFX.js'
import {cameraImpactEvents} from './cameraImpactEvents.js'
import {cameraImpactState} from './cameraImpactState.js'
import {cameraImpactAllowed,sampleImpactPlayer,sampleImpactFocus,subscribeCameraImpactDamage} from './cameraImpactGameplay.js'
import {BoostCameraFX} from './BoostCameraFX.js'
import {boostCameraState} from './boostCameraState.js'
import {bikeConfig} from '../vehicle/bikeConfig.js'

export default function AnimeRendering() {
  const { gl, scene, camera } = useThree(), controller = useRef(null),impactController=useRef(null)
  useLayoutEffect(() => {
    animeState.set({ ready: false, openingReady: false, nightReady: false, error: '' })
    const effect = new AnimeRenderer(gl, scene, camera); controller.current = effect
    const impact=new CameraImpactFX(camera)
    const boost=new BoostCameraFX(camera)
    impactController.current={fx:impact,boost,generation:cameraImpactEvents.generation,actor:null,player:new Vector3(),kick:new Vector3()}
    const unsubscribe=subscribeCameraImpactDamage(cameraImpactEvents,()=>impact.reset())
    effect.allowBackgroundWork=()=>!frontTransformState.snapshot().entryRunning&&forestOpeningState.snapshot().phase!=='playing'&&forestEndingState.snapshot().phase==='idle'&&(!effect.openingReady||!desktopInput.ready||rideMotion.paused||effect.initialNight!==(timeOfDayState.target<.5))
    effect.startupViews=()=>[...forestOpeningState.startupViews(),...forestFirstPassViews(scene,camera)]
    const previous = gl.debug.onShaderError
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      const message = [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].filter(Boolean).join('\n')
      console.error('MOSPEADA render shader:', message)
      effect.error = message; animeState.set({ error: 'No se pudo compilar el renderizado Anime.' })
      previous?.(context, program, vertex, fragment)
    }
    if (import.meta.env.DEV) window.__ANIME__ = { effect, state: animeState, renderer: gl, scene, camera }
    if(import.meta.env.DEV)window.__CAMERA_IMPACT__={effect:impact,state:cameraImpactState,events:cameraImpactEvents}
    if(import.meta.env.DEV)window.__BOOST_CAMERA__={effect:boost,state:boostCameraState}
    return () => {
      controller.current = null; effect.dispose(); gl.debug.onShaderError = previous
      unsubscribe();impact.reset();impactController.current=null
      if (import.meta.env.DEV) delete window.__ANIME__
      if(import.meta.env.DEV)delete window.__CAMERA_IMPACT__
      if(import.meta.env.DEV)delete window.__BOOST_CAMERA__
    }
  }, [gl, scene, camera])
  // Positive priority takes over only the final render. All simulation, camera,
  // weather and headlamp callbacks still run first at their original priorities.
  useFrame((_, delta) => {
    const effect = controller.current
    if (!effect) return
    const config = animeState.snapshot()
    const openingPhase=forestOpeningState.snapshot().phase
    effect.brush.tick(delta, true, timeOfDayState.value, rideMotion.speed, rideMotion.paused)
    const hiddenPreparation=!desktopInput.ready&&effect.ready&&!effect.openingReady&&!effect.error
    const feedback=impactController.current,runtime=cameraImpactEvents.runtime
    let presentation=null
    if(feedback){
      if(feedback.generation!==cameraImpactEvents.generation||feedback.actor!==runtime?.state){feedback.fx.reset();feedback.boost.reset(runtime?.state);cameraImpactEvents.drain();feedback.generation=cameraImpactEvents.generation;feedback.actor=runtime?.state}
      const boostConfig=boostCameraState.snapshot(),ready=desktopInput.ready&&effect.ready&&!effect.error
      feedback.boost.sample(delta,runtime,boostConfig,bikeConfig,ready)
      if(cameraImpactAllowed(runtime,desktopInput.ready&&effect.ready&&!effect.error)){
        sampleImpactPlayer(runtime,feedback.player)
        if(feedback.boost.started){const s=runtime.state;feedback.kick.copy(feedback.player).add(new Vector3(-Math.sin(s.yaw),0,-Math.cos(s.yaw)));cameraImpactEvents.emit('boostStart',feedback.kick,boostConfig.shakeIntensity*Math.min(1,Math.max(0,s.speed)/20))}
        presentation=feedback.fx.update(delta,camera,feedback.player,cameraImpactState.snapshot(),cameraImpactEvents.drain())
        sampleImpactFocus(runtime,presentation.blurFocus)
      }else{feedback.fx.reset();cameraImpactEvents.drain()}
      sampleImpactFocus(runtime||{},feedback.boost.focus)
      presentation=feedback.boost.compose(camera,presentation,boostConfig,feedback.boost.focus)
    }
    // The opaque loader retains the first frame. Preparation refreshes its own
    // bindings; traversing all materials at 60 Hz here starves compilation.
    if(!hiddenPreparation)effect.render(config, timeOfDayState.value,presentation)
    // Route uploads belong to the loader, even when skipping the intro.
    // Alternate lighting yields to driving and combat; prepare it while paused.
    if(effect.ready&&!effect.openingReady&&!effect.error)effect.prepareOpening()
    if((rideMotion.paused||effect.initialNight!==(timeOfDayState.target<.5))&&canPrepareLighting(effect.ready,desktopInput.ready,openingPhase))effect.prepareNight()
    if (effect.error && !animeState.snapshot().error) animeState.set({ error: 'No se pudo preparar el renderizado Anime.' })
    if (effect.ready !== animeState.snapshot().ready) animeState.set({ ready: effect.ready })
    if (!!effect.openingReady !== animeState.snapshot().openingReady) animeState.set({ openingReady: !!effect.openingReady })
    if (!!effect.nightReady !== animeState.snapshot().nightReady) animeState.set({ nightReady: !!effect.nightReady })
  }, 1)
  return null
}
