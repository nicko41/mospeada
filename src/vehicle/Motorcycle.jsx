import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as T from 'three'
import { bikeConfig, TEST_STARTS } from './bikeConfig.js'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { createDrivingCyclone } from './createDrivingCyclone.js'
import OriginalScott from './OriginalScott.jsx'
import { registerRideSurfaces, sampleRideHeight } from './rideSurface.js'
import { queryColliders, overlapsFootprint } from '../player/collisionWorld.js'
import { rideUI } from './rideUI.js'
import { timeOfDayState } from '../world/TimeOfDay'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DrivingCamera } from './drivingCamera.js'
import { requestRiderToggle, riderCameraState } from './riderPresence.js'
import { rideMotion } from './rideMotion.js'
import CycloneWeathering from './CycloneWeathering.jsx'
import CycloneVFX from '../vfx/CycloneVFX.jsx'
import FrontTransformation from './FrontTransformation.jsx'
import {ArmorController} from './ArmorController.js'
import {ArmorCamera} from './ArmorCamera.js'
import { activeEnvironment, defaultStart, selectEnvironment } from '../world/environmentConfig.js'
import {ForestStage2Progress} from '../world/forest/forestStage2Progress.js'
import ForestFoliageInteraction from '../world/forest/ForestFoliageInteraction.jsx'
import ForestOpening from '../world/forest/ForestOpening.jsx'

const CYCLONE_MODEL='/models/mospeada/cyclone-vr052f.glb'
useGLTF.preload(CYCLONE_MODEL)

export default function Motorcycle() {
  const { scene, camera, gl } = useThree()
  const bike = useGLTF(CYCLONE_MODEL)
  const rig = useMemo(() => createDrivingCyclone(bike.scene), [bike])
  const runtime = useRef({ state: null, keys: {}, input: {}, paused: false, cameraMode: 0, stamp: 0, nearby: [], cameraNearby: [], cameraTarget: new T.Vector3(), desired: new T.Vector3(), probe: new T.Vector3() }).current

  runtime.gameplay = true; runtime.scottBikeBody = rig.body; runtime.vehicleRig = rig
  const getConfig = () => ({ ...bikeConfig, dismountDuration: runtime.scottData?.duration || bikeConfig.dismountDuration, mountAnchor: runtime.scottData?.keyPoses[0].pelvis })
  useLayoutEffect(() => {
    const unregister = registerRideSurfaces(scene)
    const orbit = new OrbitControls(camera, gl.domElement)
    Object.assign(orbit, { enabled: true, enableDamping: true, dampingFactor: 0.09 })
    runtime.orbit = orbit; runtime.orbitAnchor = new T.Vector3(); runtime.orbitDelta = new T.Vector3()
    const drivingCamera = new DrivingCamera(camera, orbit, runtime, bikeConfig, sampleRideHeight)
    runtime.cameraController = drivingCamera
    const armor=new ArmorController(runtime,rig,sampleRideHeight,(x,z,y)=>{
      if(!Number.isFinite(sampleRideHeight(x,z)))return false
      queryColliders(x-.4,z-.4,x+.4,z+.4,runtime.cameraNearby)
      const feet=y+(armor.state?.soleOffset||0)
      return !runtime.cameraNearby.some(c=>c.maxY>feet+.08&&c.minY<feet+1.85&&overlapsFootprint(c,x,z,.34))
    })
    const armorCamera=new ArmorCamera(camera,orbit,runtime,sampleRideHeight);armor.camera=armorCamera;runtime.armorController=armor
    const setCameraMode = mode => {
      drivingCamera.setMode(mode, riderCameraState(runtime.state))
      rideUI.publish({ cameraMode: mode })
    }
    const levelProgress=activeEnvironment==='forest'?new ForestStage2Progress():null
    runtime.levelProgress=levelProgress
    const resetAt=start=>{
      armor.reset();runtime.transformEntry?.reset()
      runtime.state=createBikeState(start,rig.metrics,sampleRideHeight)
      runtime.keys={};runtime.input={};runtime.boostQueued=false;runtime.paused=false
      rig.update(runtime.state,sampleRideHeight,getConfig());drivingCamera.reset(runtime.state)
      rideMotion.speed=0;rideMotion.paused=false
      rideUI.publish({scottPreview:false,paused:false,location:start.label,riderMode:'mounted',wheelieAngle:0,wheelieRemaining:0,controlMode:'MOTORCYCLE',speed:0,airborne:false,boost:false,boostCooldown:0,blocked:false,slip:0,handbrake:false})
    }
    runtime.resetAt=resetAt
    const reset = (name = defaultStart) => {
      if ((name === 'forest') !== (activeEnvironment === 'forest')) { selectEnvironment(name); return }
      const start = TEST_STARTS[name] || TEST_STARTS.highway
      levelProgress?.reset();resetAt(start)
    }
    reset(activeEnvironment === 'forest' ? 'forest' : new URLSearchParams(location.search).get('start') || 'highway')
    const clear = () => { runtime.keys = {}; runtime.input = {}; runtime.boostQueued = false }
    const pause = () => { clear(); runtime.paused = !runtime.paused; rideUI.publish({ paused: runtime.paused }) }
    const down = event => {
      if(runtime.opening?.active)return
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF'].includes(event.code)) event.preventDefault()
      runtime.keys[event.code] = true
      if (event.repeat) return
      if(event.code==='KeyG'&&armor.active){event.preventDefault();armor.toggle()}
      if (['ShiftLeft', 'ShiftRight'].includes(event.code) && runtime.state.riderMode === 'mounted') runtime.boostQueued = true
      if (event.code === 'KeyR') reset()
      if (event.code === 'KeyP' || event.code === 'Escape') pause()
      if (event.code === 'KeyC'&&!armor.active) setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.code === 'KeyF' && !runtime.paused && !runtime.transformEntry?.blocksRiderChange) requestRiderToggle(runtime.state, getConfig())
      const starts = { Digit1: 'highway', Digit2: 'curves', Digit3: 'slope', Digit4: 'rough', Digit5: 'jump', Digit6: 'forest' }
      if (starts[event.code]) reset(starts[event.code])
    }
    const up = event => { runtime.keys[event.code] = false }
    const blur = () => { clear(); drivingCamera.end(); runtime.paused = true; rideUI.publish({ paused: true }) }
    const visibility = () => { if (document.hidden) blur() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    const command = event => {
      if(runtime.opening?.active)return
      if (event.detail.start) reset(event.detail.start)
      if (event.detail.pause) pause()
      if (event.detail.camera&&!armor.active) setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.detail.freeCamera&&!armor.active) setCameraMode(runtime.cameraMode === 3 ? 0 : 3)
      if (event.detail.centerCamera){if(armor.active)armorCamera.yaw=armor.state.yaw;else setCameraMode(0)}
      if(event.detail.armorGround)armor.toggle()
      if (event.detail.rider && !runtime.paused && !runtime.transformEntry?.blocksRiderChange) requestRiderToggle(runtime.state, getConfig())
      if (event.detail.touch) Object.assign(runtime.keys, event.detail.touch)
    }
    window.addEventListener('ride-command', command)
    if (import.meta.env.DEV) window.__MOSPEADA__ = {
      rig, runtime, config: bikeConfig, camera, scene, reset, sample: sampleRideHeight,
      setCameraMode,
      snapshot: () => ({ ...runtime.state, ...rig.articulation, handErrors: rig.arms.map(a => a.error), hydraulics: rig.hydraulics.map(link => ({ ...link.state })), cameraMode: runtime.cameraMode, metrics: rig.metrics, render: gl.info.render }),
    }
    return () => {
      armorCamera.dispose();delete runtime.armorController
      unregister(); clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur)
      drivingCamera.dispose(); runtime.cameraController = null; orbit.dispose(); runtime.orbit = null
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('ride-command', command)
      if (import.meta.env.DEV) delete window.__MOSPEADA__
    }
  }, [rig, runtime, camera, scene, gl])

  useFrame((_, delta) => {
    let s = runtime.state
    if (!s) return
    const k = runtime.keys
    const view = camera.getWorldDirection(runtime.probe)
    runtime.input = {
      throttle: k.KeyW || k.ArrowUp ? 1 : 0,
      brakeReverse: !!(k.KeyS || k.ArrowDown),
      handbrake: !!k.Space,
      boost: !!(k.ShiftLeft || k.ShiftRight || runtime.boostQueued),
      wheelie: !!(k.ControlLeft || k.ControlRight),
      steer: (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0),
      walkForward: (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0),
      walkSide: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
      walkYaw: Math.atan2(view.x, view.z),
      run: !!(k.ShiftLeft || k.ShiftRight),
      crouch: !!(k.ControlLeft || k.ControlRight),
    }
    const canMove = (x, z, yaw) => {
      const y = sampleRideHeight(x, z)
      if (!Number.isFinite(y)&&!runtime.levelProgress?.allowsVoid(x,z)) return false
      // An airborne bike that arrives below the far lip hits the cliff; it
      // cannot snap upward onto the landing platform from underneath.
      if(Number.isFinite(y)&&s.airborne&&(s.frontOverVoid||s.rearOverVoid)&&s.height<y-.25)return false
      // Keep the entire contact footprint inside a rendered surface.
      for (const along of [-1.2, 1.2]) {
        const px=x+Math.sin(yaw)*along,pz=z+Math.cos(yaw)*along
        if (!Number.isFinite(sampleRideHeight(px,pz))&&!runtime.levelProgress?.allowsVoid(px,pz)) return false
      }
      queryColliders(x - 1.3, z - 1.3, x + 1.3, z + 1.3, runtime.nearby)
      // Three swept stations and a small fixed physics step stop guardrail/pole tunnelling.
      for (const along of [-0.85, 0, 0.85]) for (const collider of runtime.nearby) {
        const base = s.airborne ? Math.max(Number.isFinite(y)?y:s.height, s.height) : Number.isFinite(y)?y:s.height
        if (collider.maxY < base + 0.12 || collider.minY > base + 1.6 || collider.walkable && collider.maxY < base + 0.18) continue
        if (overlapsFootprint(collider, x + Math.sin(yaw) * along, z + Math.cos(yaw) * along, 0.3)) return false
      }
      return true
    }
    const canWalk = (x, z) => {
      const y = sampleRideHeight(x, z)
      if (!Number.isFinite(y)) return false
      const dx = x - s.x, dz = z - s.z
      if (Math.abs(Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz) < 0.49 && Math.abs(Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz) < 1.3) return false
      queryColliders(x - 0.3, z - 0.3, x + 0.3, z + 0.3, runtime.nearby)
      return !runtime.nearby.some(item => item.maxY > y + 0.2 && item.minY < y + 1.9 && overlapsFootprint(item, x, z, 0.23))
    }
    if (!runtime.paused&&!runtime.opening?.holding) {
      const dt=Math.min(delta,.1),entry=runtime.transformEntry
      const armor=runtime.armorController
      if(entry?.phase==='complete'&&!entry.returnFlight&&!armor.active)armor.activate()
      if(armor.active){
        armor.update({forward:runtime.input.walkForward,side:runtime.input.walkSide,yaw:armor.camera.yaw,boost:runtime.input.run,rise:!!k.Space,descend:!!(k.ControlLeft||k.ControlRight)},dt)
      }else{
        if(entry&&entry.phase!=='idle'&&entry.phase!=='complete')runtime.input={throttle:0,steer:0,boost:false,handbrake:false,brake:0}
        if(entry)runtime.input=entry.beforePhysics(runtime.input,dt)
        const config={...getConfig(),...entry?.physicsConfig}
        if(runtime.levelProgress)config.airBoostEnabled=runtime.levelProgress.airEnabled(s,entry?.phase||'idle')
        advanceBike(s,runtime.input,dt,rig.metrics,sampleRideHeight,canMove,config,canWalk)
        entry?.afterPhysics(dt,rig.metrics,config)
      }
      runtime.levelProgress?.observe(runtime.state)
      if(runtime.levelProgress?.needsRecovery(runtime.state)){
        runtime.levelProgress.recover(runtime.resetAt);s=runtime.state
      }
    }
    if (s.boostPressed || s.riderMode !== 'mounted') runtime.boostQueued = false
    rig.update(s, sampleRideHeight, getConfig(),runtime.transformEntry?.returnTilt)
    rig.sunlight.intensity = 0.015 + timeOfDayState.value * 0.6
    rig.lighting.update(timeOfDayState.value)
    rideMotion.speed = s.speed; rideMotion.paused = runtime.paused
    runtime.stamp += delta
    if (runtime.stamp > 0.1) {
      runtime.stamp = 0
      const armor=runtime.armorController,active=armor?.active,a=armor?.state
      rideUI.publish({ speed: Math.abs(s.speed) * 3.6, lean: s.lean * 180 / Math.PI, frontTravel: rig.articulation.frontTravel, rearTravel: rig.articulation.rearTravel, blocked: s.blocked, reverse: !active&&s.speed < -0.1, airborne: active?!a.grounded:s.airborne, slip: s.slip * 180 / Math.PI, handbrake: s.handbrake > 0.15, boost: active?a.boostBlend>.15:s.boostTime > 0, boostCooldown: s.boostCooldown, cameraMode: runtime.cameraMode, riderMode: s.riderMode, wheelieAngle: s.wheelieAngle, wheelieRemaining: s.wheelieRemaining,controlMode:active?a.mode:runtime.transformEntry?.phase&&runtime.transformEntry.phase!=='idle'?'TRANSFORMING':'MOTORCYCLE',armorHeight:active?a.height:0,verticalSpeed:active?a.vy:0 })
    }
  }, -2)
  useFrame((_, delta) => { if(runtime.opening?.update(delta))return;if(runtime.armorController?.active)runtime.armorController.camera.update(runtime.armorController.state,delta);else if (runtime.state) runtime.cameraController?.update(riderCameraState(runtime.state), delta) })
  return <><primitive object={rig.root} dispose={null} /><OriginalScott runtime={runtime} /><FrontTransformation rig={rig} runtime={runtime} /><CycloneWeathering rig={rig} runtime={runtime} /><CycloneVFX rig={rig} runtime={runtime} />{activeEnvironment==='forest'&&<><ForestFoliageInteraction runtime={runtime}/><ForestOpening runtime={runtime}/></>}</>
}
