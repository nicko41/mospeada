import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF,useTexture } from '@react-three/drei'
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
import ForestStage3Encounter from '../world/forest/ForestStage3Encounter.jsx'
import GallantCombat from './GallantCombat.jsx'
import ForestDesertScouts from '../world/forest/ForestDesertScouts.jsx'
import ForestRandEscape from '../world/forest/ForestRandEscape.jsx'
import ForestEnding from '../world/forest/ForestEnding.jsx'
import {playerCombat,resetPlayerCombat,damagePlayer} from '../player/playerCombat.js'
import {stage3World} from '../world/forest/forestStage3World.js'
import {stage4World} from '../world/forest/forestStage4Config.js'
import {BikeDefeatMotion} from './BikeDefeatMotion.js'
import {COVER_DECALS} from './coverDecalData.js'
import {applyCoverDecals} from './coverDecals.js'
import {restoreVehiclePresentation} from './restoreVehiclePresentation.js'
import {cameraImpactEvents} from '../rendering/cameraImpactEvents.js'

const CYCLONE_MODEL='/models/mospeada/cyclone-vr052f.glb'
useGLTF.preload(CYCLONE_MODEL)
const COVER_TEXTURES=COVER_DECALS.map(d=>d.texture)
useTexture.preload(COVER_TEXTURES)

export default function Motorcycle() {
  const { scene, camera, gl } = useThree()
  const bike = useGLTF(CYCLONE_MODEL)
  const coverTextures=useTexture(COVER_TEXTURES)
  const rig = useMemo(() => {const rig=createDrivingCyclone(bike.scene);rig.coverDecals=applyCoverDecals(rig,coverTextures);return rig}, [bike,coverTextures[0],coverTextures[1]])
  const runtime = useRef({ state: null, keys: {}, input: {}, paused: false, cameraMode: 0, stamp: 0, nearby: [], cameraNearby: [], cameraTarget: new T.Vector3(), desired: new T.Vector3(), probe: new T.Vector3() }).current

  runtime.gameplay = true; runtime.scottBikeBody = rig.body; runtime.vehicleRig = rig
  useLayoutEffect(()=>cameraImpactEvents.bind(runtime),[runtime])
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
      runtime.ending?.reset()
      restoreVehiclePresentation(runtime)
      runtime.scottInstance?.defeatMotion?.reset();runtime.defeat=null;runtime.pendingDefeatRetry=false
      runtime.bikeDefeatMotion?.reset();runtime.canyonCrash=null
      runtime.resumeClimaxCheckpoint=!!start.climax
      resetPlayerCombat()
      runtime.gallant?.bikeCamera.finish(runtime.state||{x:start.x,height:0,z:start.z})
      runtime.stage3?.encounter.reset();runtime.scottInstance?.shooterPose?.restore()
      const stage4=stage4World.get()
      if(start.stage4&&stage4?.bound){if(runtime.stage3)runtime.stage3.encounter.phase='complete'}else stage4?.reset()
      stage3World.get()?.ensureAround(start.z)
      armor.reset();runtime.transformEntry?.reset()
      runtime.state=createBikeState(start,rig.metrics,sampleRideHeight)
      runtime.keys={};runtime.input={};runtime.boostQueued=false;runtime.paused=false
      rig.update(runtime.state,sampleRideHeight,getConfig());drivingCamera.reset(runtime.state)
      rideMotion.speed=0;rideMotion.paused=false
      rideUI.publish({shooter:null,scottPreview:false,paused:false,defeat:null,location:start.label,riderMode:'mounted',wheelieAngle:0,wheelieRemaining:0,controlMode:'MOTORCYCLE',speed:0,airborne:false,boost:false,boostCooldown:0,blocked:false,slip:0,handbrake:false})
    }
    runtime.resetAt=resetAt
    const reset = (name = defaultStart) => {
      if ((name === 'forest') !== (activeEnvironment === 'forest')) { selectEnvironment(name); return }
      const start = TEST_STARTS[name] || TEST_STARTS.highway
      runtime.transformEntry?.resetLevelCamera()
      levelProgress?.reset();resetAt(start)
    }
    reset(activeEnvironment === 'forest' ? 'forest' : new URLSearchParams(location.search).get('start') || 'highway')
    runtime.retryDefeat=()=>{
      if(!playerCombat.dead)return
      const world=stage4World.get()
      if(world?.bound){
        if(runtime.climaxSequence?.active)runtime.pendingDefeatRetry=true
        else resetAt(world.checkpoint||world.startAt(550))
      }else if(levelProgress?.checkpoint)resetAt(levelProgress.checkpoint)
      else reset()
    }
    const clear = () => { runtime.keys = {}; runtime.input = {}; runtime.boostQueued = false;runtime.armorJumpQueued=false;if(runtime.stage3)runtime.stage3.encounter.firing=false }
    const pause = () => { clear(); runtime.paused = !runtime.paused; rideUI.publish({ paused: runtime.paused }) }
    const down = event => {
      if(runtime.opening?.active)return
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return
      if(playerCombat.dead){
        event.preventDefault();if(event.repeat)return
        if(event.code==='KeyR')runtime.retryDefeat()
        else if(event.code==='KeyP'||event.code==='Escape')pause()
        return
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF'].includes(event.code)) event.preventDefault()
      runtime.keys[event.code] = true
      if (event.repeat) return
      if(event.code==='Space'&&armor.active&&!runtime.paused)runtime.armorJumpQueued=true
      if(event.code==='KeyG'&&armor.active){event.preventDefault();armor.toggle()}
      if (['ShiftLeft', 'ShiftRight'].includes(event.code) && runtime.state.riderMode === 'mounted') runtime.boostQueued = true
      if (event.code === 'KeyR') reset()
      if (event.code === 'KeyP' || event.code === 'Escape') pause()
      if (event.code === 'KeyC'&&!armor.active) setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.code === 'KeyF' && !runtime.paused && !runtime.stage3?.encounter.active && !runtime.transformEntry?.blocksRiderChange) requestRiderToggle(runtime.state, getConfig())
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
      if(playerCombat.dead){if(event.detail.retryDefeat)runtime.retryDefeat();else if(event.detail.pause)pause();return}
      if (event.detail.start) reset(event.detail.start)
      if (event.detail.pause) pause()
      if (event.detail.camera&&!armor.active) setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.detail.freeCamera&&!armor.active) setCameraMode(runtime.cameraMode === 3 ? 0 : 3)
      if (event.detail.centerCamera){if(armor.active)armorCamera.yaw=armor.state.yaw;else setCameraMode(0)}
      if(event.detail.armorGround)armor.toggle()
      if (event.detail.rider && !runtime.paused && !runtime.stage3?.encounter.active && !runtime.transformEntry?.blocksRiderChange) requestRiderToggle(runtime.state, getConfig())
      if (event.detail.touch) Object.assign(runtime.keys, event.detail.touch)
    }
    window.addEventListener('ride-command', command)
    if (import.meta.env.DEV) window.__MOSPEADA__ = {
      rig, runtime, config: bikeConfig, camera, scene, reset, sample: sampleRideHeight,
      setCameraMode,
      snapshot: () => ({ ...runtime.state, ...rig.articulation, handErrors: rig.arms.map(a => a.error), hydraulics: rig.hydraulics.map(link => ({ ...link.state })), cameraMode: runtime.cameraMode, metrics: rig.metrics, render: gl.info.render }),
    }
    return () => {
      armorCamera.dispose();delete runtime.armorController;delete runtime.retryDefeat
      unregister(); clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur)
      drivingCamera.dispose(); runtime.cameraController = null; orbit.dispose(); runtime.orbit = null
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('ride-command', command)
      if (import.meta.env.DEV) delete window.__MOSPEADA__
    }
  }, [rig, runtime, camera, scene, gl])

  useFrame((_, delta) => {
    if(runtime.pendingDefeatRetry){const start=stage4World.get()?.prepareClimaxRetry(rig.metrics);if(start)runtime.resetAt(start)}
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
      if(!playerCombat.dead&&!runtime.canyonCrash&&!runtime.armorController?.active){
        const hit=runtime.levelProgress?.sweepWall(s,x,z,yaw)
        if(hit){runtime.canyonCrash=hit;return false}
      }
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
    if(playerCombat.dead){
      runtime.bikeDefeatMotion ||=new BikeDefeatMotion(rig,runtime)
      runtime.bikeDefeatMotion.advance(runtime.paused?0:Math.min(delta,.1),sampleRideHeight,canMove)
      runtime.keys={};runtime.input={};runtime.boostQueued=false;s.acceleration=0;s.boostTime=s.boostBlend=s.boostKick=0
      if(runtime.armorController?.active){const a=runtime.armorController.state;a.speed=a.vx=a.vz=a.boostBlend=0;a.boosting=false}
    }
    if (!runtime.paused&&!runtime.opening?.holding&&!runtime.ending?.holding&&!playerCombat.dead) {
      const dt=Math.min(delta,.1),entry=runtime.transformEntry
      const armor=runtime.armorController
      stage3World.get()?.ensureAround(s.z)
      const encounter=runtime.stage3?.encounter
      encounter?.observe(s,!armor.active&&(!entry||entry.phase==='idle'))
      encounter?.drive(s,dt)
      const stage4=stage4World.get();stage4?.prepare(encounter,s)
      // Advance the assembly before choosing the control mode. The frame that
      // reaches 100% consumes the player's Armor input immediately.
      entry?.store.advance(dt,entry.assemblyDuration)
      entry?.completeAssembly()
      if(entry?.phase==='complete'&&!entry.returnFlight&&!armor.active)armor.activate()
      if(armor.active){
        const down=!!armor.state.knockedDown
        armor.update({forward:down?0:runtime.input.walkForward,side:down?0:runtime.input.walkSide,yaw:down?armor.state.yaw:armor.camera.yaw,aiming:!down&&!!(runtime.gallant?.aimInput?.held||runtime.gallant?.firing),boost:!down&&runtime.input.run,rise:!down&&!!k.Space,risePressed:!down&&!!runtime.armorJumpQueued,descend:!down&&!!(k.ControlLeft||k.ControlRight)},dt)
        runtime.armorJumpQueued=false
      }else{
        if(entry&&entry.phase!=='idle'&&entry.phase!=='complete')runtime.input={throttle:0,steer:0,boost:false,handbrake:false,brake:0}
        if(entry)runtime.input=entry.beforePhysics(runtime.input,dt)
        const config={...getConfig(),...entry?.physicsConfig}
        if(runtime.levelProgress)config.airBoostEnabled=runtime.levelProgress.airEnabled(s,entry?.phase||'idle')||stage4?.airEnabled(s,entry?.phase||'idle')||false
        advanceBike(s,runtime.input,dt,rig.metrics,sampleRideHeight,canMove,config,canWalk)
        entry?.afterPhysics(dt,rig.metrics,config)
      }
      encounter?.move(s,dt)
      runtime.levelProgress?.observe(runtime.state)
      if(stage4?.contains(s.x,s.z)){
        if(stage4.needsRecovery(s)){runtime.resetAt(stage4.checkpoint);s=runtime.state}
      }else if(runtime.canyonCrash){
        const hit=runtime.canyonCrash
        s.x=hit.point.x+hit.normal.x*1.4;s.z=hit.point.z+hit.normal.z*1.4;s.height=hit.height;s.speed=0
        s.boostTime=s.boostBlend=s.boostKick=0;runtime.keys={};runtime.input={};runtime.boostQueued=false
        damagePlayer(playerCombat.playerMaxHealth)
      }else if(runtime.levelProgress?.needsRecovery(runtime.state)){
        runtime.levelProgress.recover(runtime.resetAt);s=runtime.state
      }
    }
    if (s.boostPressed || s.riderMode !== 'mounted') runtime.boostQueued = false
    rig.update(s, sampleRideHeight, getConfig(),runtime.transformEntry?.returnTilt)
    if(playerCombat.dead)runtime.bikeDefeatMotion?.apply(sampleRideHeight)
    rig.sunlight.intensity = 0.015 + timeOfDayState.value * 0.6
    rig.lighting.update(timeOfDayState.value)
    rideMotion.speed = s.speed; rideMotion.paused = runtime.paused
    runtime.stamp += delta
    if (runtime.stamp > 0.1) {
      runtime.stamp = 0
      const armor=runtime.armorController,active=armor?.active,a=armor?.state
      const encounter=runtime.stage3?.encounter
      if(encounter?.active)rideUI.publish({location:'Nivel 01 · Plano 3 · Reconocimiento Invid',shooter:{active:true,remaining:encounter.remaining,blocked:!encounter.canShoot}})
      else if(encounter?.phase==='complete')rideUI.publish({location:'Nivel 01 · Plano 3 · Despejado',shooter:{active:false,remaining:0,blocked:false}})
      const stage4=stage4World.get()
      if(stage4?.contains(s.x,s.z))rideUI.publish({location:stage4.distance(s.z)>=2400?'Nivel 01 · Plano 5 · Llanura Invid':stage4.distance(s.z)>620?'Nivel 01 · Plano 4 · Desierto':'Nivel 01 · Plano 4 · Salida del bosque'})
      rideUI.publish({ speed: Math.abs(s.speed) * 3.6, lean: s.lean * 180 / Math.PI, frontTravel: rig.articulation.frontTravel, rearTravel: rig.articulation.rearTravel, blocked: s.blocked, reverse: !active&&s.speed < -0.1, airborne: active?!a.grounded:s.airborne, slip: s.slip * 180 / Math.PI, handbrake: s.handbrake > 0.15, boost: active?a.boostBlend>.15:s.boostTime > 0, boostCooldown: s.boostCooldown, cameraMode: runtime.cameraMode, riderMode: s.riderMode, wheelieAngle: s.wheelieAngle, wheelieRemaining: s.wheelieRemaining,controlMode:encounter?.active?'CYCLONE_SHOOTER':active?a.mode:runtime.transformEntry?.phase&&runtime.transformEntry.phase!=='idle'?'TRANSFORMING':'MOTORCYCLE',armorHeight:active?a.height:0,verticalSpeed:active?a.vy:0 })
    }
  }, -2)
  useFrame((_, delta) => {
    if(runtime.opening?.update(delta))return
    if(runtime.ending?.holding){runtime.ending.presentCamera(camera);return}
    if(playerCombat.dead){runtime.gallant?.bikeCamera.finish(runtime.state);if(runtime.cameraController?.updateDefeat(delta))return}
    if(!runtime.cameraController?.middleLook.active&&runtime.state&&runtime.gallant?.bikeCamera.update(runtime.gallant,runtime.state,runtime.paused?0:delta))return
    if(runtime.armorController?.active)runtime.armorController.camera.update(runtime.armorController.state,delta)
    else if(runtime.state)runtime.cameraController?.update(riderCameraState(runtime.state),delta)
  })
  return <><primitive object={rig.root} dispose={null} /><OriginalScott runtime={runtime} /><FrontTransformation rig={rig} runtime={runtime} /><CycloneWeathering rig={rig} runtime={runtime} /><CycloneVFX rig={rig} runtime={runtime} /><GallantCombat runtime={runtime}/>{activeEnvironment==='forest'&&<><ForestFoliageInteraction runtime={runtime}/><ForestOpening runtime={runtime}/><ForestStage3Encounter runtime={runtime}/><ForestRandEscape runtime={runtime}/><ForestDesertScouts runtime={runtime}/><ForestEnding runtime={runtime}/></>}</>
}
