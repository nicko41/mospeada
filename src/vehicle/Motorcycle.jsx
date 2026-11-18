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

export default function Motorcycle() {
  const { scene, camera, gl } = useThree()
  const bike = useGLTF('/models/mospeada/cyclone-vr052f.glb')
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
    const setCameraMode = mode => {
      drivingCamera.setMode(mode, riderCameraState(runtime.state))
      rideUI.publish({ cameraMode: mode })
    }
    const reset = (name = 'highway') => {
      const start = TEST_STARTS[name] || TEST_STARTS.highway
      runtime.state = createBikeState(start, rig.metrics, sampleRideHeight)
      runtime.keys = {}; runtime.input = {}; runtime.boostQueued = false; runtime.paused = false
      rig.update(runtime.state, sampleRideHeight, getConfig())
      drivingCamera.reset(runtime.state)
      rideMotion.speed = 0; rideMotion.paused = false
      rideUI.publish({ scottPreview: false, paused: false, location: start.label, riderMode: 'mounted', wheelieAngle: 0, wheelieRemaining: 0 })
    }
    reset(new URLSearchParams(location.search).get('start') || 'highway')
    const clear = () => { runtime.keys = {}; runtime.input = {}; runtime.boostQueued = false }
    const pause = () => { clear(); runtime.paused = !runtime.paused; rideUI.publish({ paused: runtime.paused }) }
    const down = event => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF'].includes(event.code)) event.preventDefault()
      runtime.keys[event.code] = true
      if (event.repeat) return
      if (['ShiftLeft', 'ShiftRight'].includes(event.code) && runtime.state.riderMode === 'mounted') runtime.boostQueued = true
      if (event.code === 'KeyR') reset()
      if (event.code === 'KeyP' || event.code === 'Escape') pause()
      if (event.code === 'KeyC') setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.code === 'KeyF' && !runtime.paused) requestRiderToggle(runtime.state, getConfig())
      const starts = { Digit1: 'highway', Digit2: 'curves', Digit3: 'slope', Digit4: 'rough', Digit5: 'jump' }
      if (starts[event.code]) reset(starts[event.code])
    }
    const up = event => { runtime.keys[event.code] = false }
    const blur = () => { clear(); drivingCamera.end(); runtime.paused = true; rideUI.publish({ paused: true }) }
    const visibility = () => { if (document.hidden) blur() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    const command = event => {
      if (event.detail.start) reset(event.detail.start)
      if (event.detail.pause) pause()
      if (event.detail.camera) setCameraMode((runtime.cameraMode + 1) % 4)
      if (event.detail.freeCamera) setCameraMode(runtime.cameraMode === 3 ? 0 : 3)
      if (event.detail.centerCamera) setCameraMode(0)
      if (event.detail.rider && !runtime.paused) requestRiderToggle(runtime.state, getConfig())
      if (event.detail.touch) Object.assign(runtime.keys, event.detail.touch)
    }
    window.addEventListener('ride-command', command)
    if (import.meta.env.DEV) window.__MOSPEADA__ = {
      rig, runtime, config: bikeConfig, camera, scene, reset, sample: sampleRideHeight,
      setCameraMode,
      snapshot: () => ({ ...runtime.state, ...rig.articulation, handErrors: rig.arms.map(a => a.error), hydraulics: rig.hydraulics.map(link => ({ ...link.state })), cameraMode: runtime.cameraMode, metrics: rig.metrics, render: gl.info.render }),
    }
    return () => {
      unregister(); clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur)
      drivingCamera.dispose(); runtime.cameraController = null; orbit.dispose(); runtime.orbit = null
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('ride-command', command)
      if (import.meta.env.DEV) delete window.__MOSPEADA__
    }
  }, [rig, runtime, camera, scene, gl])

  useFrame((_, delta) => {
    const s = runtime.state
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
      if (!Number.isFinite(y)) return false
      // Keep the entire contact footprint inside a rendered surface.
      for (const along of [-1.2, 1.2]) {
        if (!Number.isFinite(sampleRideHeight(x + Math.sin(yaw) * along, z + Math.cos(yaw) * along))) return false
      }
      queryColliders(x - 1.3, z - 1.3, x + 1.3, z + 1.3, runtime.nearby)
      // Three swept stations and a small fixed physics step stop guardrail/pole tunnelling.
      for (const along of [-0.85, 0, 0.85]) for (const collider of runtime.nearby) {
        const base = s.airborne ? Math.max(y, s.height) : y
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
    if (!runtime.paused) advanceBike(s, runtime.input, Math.min(delta, 0.1), rig.metrics, sampleRideHeight, canMove, getConfig(), canWalk)
    if (s.boostPressed || s.riderMode !== 'mounted') runtime.boostQueued = false
    rig.update(s, sampleRideHeight, getConfig())
    rig.sunlight.intensity = 0.015 + timeOfDayState.value * 0.6
    rig.lighting.update(timeOfDayState.value)
    rideMotion.speed = s.speed; rideMotion.paused = runtime.paused
    runtime.stamp += delta
    if (runtime.stamp > 0.1) {
      runtime.stamp = 0
      rideUI.publish({ speed: Math.abs(s.speed) * 3.6, lean: s.lean * 180 / Math.PI, frontTravel: rig.articulation.frontTravel, rearTravel: rig.articulation.rearTravel, blocked: s.blocked, reverse: s.speed < -0.1, airborne: s.airborne, slip: s.slip * 180 / Math.PI, handbrake: s.handbrake > 0.15, boost: s.boostTime > 0, boostCooldown: s.boostCooldown, cameraMode: runtime.cameraMode, riderMode: s.riderMode, wheelieAngle: s.wheelieAngle, wheelieRemaining: s.wheelieRemaining })
    }
  }, -2)
  useFrame((_, delta) => { if (runtime.state) runtime.cameraController?.update(riderCameraState(runtime.state), delta) })
  return <><primitive object={rig.root} dispose={null} /><OriginalScott runtime={runtime} /></>
}
