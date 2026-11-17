import { useEffect, useRef, useState } from 'react'
import { ChevronsUp, Flashlight, Hand, Sword, SunMoon } from 'lucide-react'
import MobileLookSurface from './MobileLookSurface'
import { touchInput, resetTouchInput, joystickVector, triggerTouchAction } from './touchInput'
import { vehicleState } from './vehicleState'
import useTouchDevice from './useTouchDevice'
import useLandscapeViewport from './useLandscapeViewport'

export function MobileJoystick() {
  const pointer = useRef(null)
  const base = useRef(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const release = (event) => {
    if (event && event.pointerId !== pointer.current) return
    const id = pointer.current
    pointer.current = null
    if (id !== null && base.current?.hasPointerCapture(id)) base.current.releasePointerCapture(id)
    Object.assign(touchInput, { x: 0, y: 0, sprint: false })
    setOffset({ x: 0, y: 0 })
  }
  useEffect(() => {
    const clear = () => release()
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      Object.assign(touchInput, { x: 0, y: 0, sprint: false })
    }
  }, [])
  const move = (event) => {
    if (event.pointerId !== pointer.current) return
    event.preventDefault()
    const rect = base.current.getBoundingClientRect()
    const radius = (rect.width - 46) / 2
    const value = joystickVector(event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2, radius)
    Object.assign(touchInput, value)
    setOffset({ x: value.x * radius, y: -value.y * radius })
  }
  return <div ref={base} className={`mobile-joystick${pointer.current !== null ? ' is-pressed' : ''}`}
    role="group" aria-label="Movimiento; al borde superior, correr"
    onPointerDown={event => {
      if (event.pointerType !== 'touch' || pointer.current !== null) return
      event.preventDefault()
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      touchInput.active = true
      move(event)
    }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <div className="mobile-joystick-thumb" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} />
  </div>
}

export function MobileActionButton({ action, label, Icon }) {
  const pointer = useRef(null)
  const button = useRef(null)
  const [pressed, setPressed] = useState(false)
  const release = event => {
    if (event && event.pointerId !== pointer.current) return
    const id = pointer.current
    pointer.current = null
    if (id !== null && button.current?.hasPointerCapture(id)) button.current.releasePointerCapture(id)
    setPressed(false)
  }
  useEffect(() => {
    const clear = () => release()
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [])
  const activate = () => {
    touchInput.active = true
    triggerTouchAction(action === 'interact' && (vehicleState.active || vehicleState.nearDoor) ? 'vehicle' : action)
  }
  return <button ref={button} type="button" aria-label={label} title={label}
    className={`mobile-action mobile-action-${action}${pressed ? ' is-pressed' : ''}`}
    onPointerDown={event => {
      if (event.pointerType !== 'touch' || pointer.current !== null) return
      event.preventDefault()
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      setPressed(true)
      activate()
    }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onClick={event => { if (event.detail === 0) activate() }}>
    <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
  </button>
}

export default function MobileControls() {
  const touchDevice = useTouchDevice()
  const landscape = useLandscapeViewport()
  const enabled = touchDevice && landscape
  useEffect(() => {
    if (!enabled) return
    touchInput.enabled = true
    document.querySelector('.app')?.classList.add('has-touch-controls')
    const clear = () => {
      touchInput.active = false
      resetTouchInput()
    }
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      clear()
      touchInput.enabled = false
      document.querySelector('.app')?.classList.remove('has-touch-controls')
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [enabled])
  if (!enabled) return null
  return <div className="mobile-controls" onContextMenu={event => event.preventDefault()}>
    <MobileLookSurface />
    <MobileJoystick />
    <MobileActionButton action="time" label="Alternar día y noche" Icon={SunMoon} />
    <div className="mobile-actions">
      <MobileActionButton action="interact" label="Interactuar" Icon={Hand} />
      <MobileActionButton action="light" label="Linterna" Icon={Flashlight} />
      <MobileActionButton action="attack" label="Pegar" Icon={Sword} />
      <MobileActionButton action="jump" label="Saltar" Icon={ChevronsUp} />
    </div>
  </div>
}
