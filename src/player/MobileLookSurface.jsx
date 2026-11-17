import { useEffect, useRef } from 'react'
import { touchInput, resetTouchLook } from './touchInput'
import { createLookGesture } from './mobileLookInput'

export default function MobileLookSurface() {
  const surface = useRef(null)
  const gesture = useRef(createLookGesture())
  const clear = () => {
    const id = gesture.current.pointerId
    gesture.current.clear()
    if (id !== null && surface.current?.hasPointerCapture(id)) surface.current.releasePointerCapture(id)
    resetTouchLook()
  }
  useEffect(() => {
    window.addEventListener('blur', clear)
    window.addEventListener('resize', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('blur', clear)
      window.removeEventListener('resize', clear)
      document.removeEventListener('visibilitychange', clear)
      clear()
    }
  }, [])
  const end = event => {
    if (!gesture.current.end(event.pointerId)) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    resetTouchLook()
  }
  return <div ref={surface} className="mobile-look-surface" aria-hidden="true"
    onPointerDown={event => {
      if (event.pointerType !== 'touch') return
      const rect = event.currentTarget.parentElement.getBoundingClientRect()
      if (!gesture.current.start(event.pointerId, event.clientX, event.clientY, rect.width, rect.height)) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      touchInput.active = true
      resetTouchLook()
    }} onPointerMove={event => {
      if (gesture.current.pointerId !== event.pointerId) return
      event.preventDefault()
      const move = gesture.current.move(event.pointerId, event.clientX, event.clientY)
      if (move) { touchInput.lookX += move.x; touchInput.lookY += move.y }
    }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
}
