import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { desktopInput, isGameInputActive } from './touchInput'
import { createDesktopLookInput, centerDesktopPointer } from './desktopLookInput'

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF'])

export default function DesktopLookControls({ controlsRef }) {
  const { camera, gl, get, setEvents } = useThree()
  const angles = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useEffect(() => {
    const canvas = gl.domElement
    const previousCompute = get().events.compute
    const previousCursor = canvas.style.cursor
    // FPS aiming always originates at the viewport center, including before lock.
    setEvents({ compute: (_event, state) => centerDesktopPointer(state) })
    centerDesktopPointer(get())
    const look = createDesktopLookInput()
    const controls = { pointerSpeed: 1, isLocked: false }
    controlsRef.current = controls
    let requesting = false
    const requestLock = () => {
      if (!desktopInput.ready || document.hidden || !document.hasFocus()) return
      desktopInput.paused = false
      canvas.style.cursor = 'none'
      if (requesting || document.pointerLockElement || !canvas.requestPointerLock) return
      requesting = true
      try {
        canvas.requestPointerLock()?.catch(() => { requesting = false })
      } catch { requesting = false }
    }
    const ready = () => {
      look.reset()
      centerDesktopPointer(get())
      canvas.style.cursor = desktopInput.paused ? 'auto' : 'none'
      // Only request when the browser already has a usable user gesture.
      if (navigator.userActivation?.isActive) requestLock()
    }
    const down = event => {
      if (event.code === 'Escape') {
        desktopInput.paused = true
        canvas.style.cursor = 'auto'
        look.reset()
      } else if (GAME_KEYS.has(event.code) && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
        requestLock()
      }
    }
    const click = event => {
      if (event.button === 0) requestLock()
    }
    const lockChanged = () => {
      const locked = document.pointerLockElement === canvas
      if (controls.isLocked && !locked) desktopInput.paused = true
      controls.isLocked = locked
      canvas.style.cursor = desktopInput.paused ? 'auto' : 'none'
      requesting = false
      look.reset()
      centerDesktopPointer(get())
    }
    const lockError = () => { requesting = false; look.reset() }
    const reset = () => look.reset()
    const move = event => {
      if (!isGameInputActive() || (!controls.isLocked && event.target !== canvas)) {
        look.reset()
        return
      }
      const delta = look.move(event, controls.isLocked)
      if (!delta) return
      angles.setFromQuaternion(camera.quaternion, 'YXZ')
      angles.y -= delta.x * 0.002 * controls.pointerSpeed
      angles.x = THREE.MathUtils.clamp(angles.x - delta.y * 0.002 * controls.pointerSpeed, -Math.PI / 2, Math.PI / 2)
      camera.quaternion.setFromEuler(angles)
    }
    canvas.addEventListener('click', click)
    canvas.addEventListener('mouseleave', reset)
    document.addEventListener('mousemove', move)
    document.addEventListener('pointerlockchange', lockChanged)
    document.addEventListener('pointerlockerror', lockError)
    window.addEventListener('keydown', down, true)
    window.addEventListener('blur', reset)
    window.addEventListener('game-ready', ready)
    if (desktopInput.ready) ready()
    return () => {
      canvas.removeEventListener('click', click)
      canvas.removeEventListener('mouseleave', reset)
      document.removeEventListener('mousemove', move)
      document.removeEventListener('pointerlockchange', lockChanged)
      document.removeEventListener('pointerlockerror', lockError)
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('blur', reset)
      window.removeEventListener('game-ready', ready)
      controlsRef.current = null
      setEvents({ compute: previousCompute })
      canvas.style.cursor = previousCursor
    }
  }, [camera, gl, get, setEvents, angles, controlsRef])
  return null
}
