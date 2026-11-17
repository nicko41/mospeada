import { useLayoutEffect } from 'react'
import { Smartphone } from 'lucide-react'
import useTouchDevice from './useTouchDevice'
import useLandscapeViewport from './useLandscapeViewport'
import useMobileFullscreen from './useMobileFullscreen'
import { resetTouchInput, touchInput } from './touchInput'

export default function MobileOrientation({ children }) {
  const mobile = useTouchDevice()
  const landscape = useLandscapeViewport()
  const blocked = mobile && !landscape
  const { fullscreen, requestFromGesture } = useMobileFullscreen(mobile)

  useLayoutEffect(() => {
    if (!mobile) return
    const app = document.querySelector('.app')
    app?.classList.add('mobile-viewport')
    document.documentElement.classList.add('mobile-game-page')
    return () => {
      app?.classList.remove('mobile-viewport')
      document.documentElement.classList.remove('mobile-game-page')
    }
  }, [mobile])

  useLayoutEffect(() => {
    if (blocked) {
      touchInput.active = false
      resetTouchInput()
    }
  }, [blocked])

  useLayoutEffect(() => {
    if (!mobile) return
    // Re-measure after the rotated viewport has laid out; R3F handles size and aspect.
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => window.cancelAnimationFrame(frame)
  }, [mobile, landscape])

  return <>
    {/* Keep the scene mounted and measurable so R3F's resize observer updates the camera aspect. */}
    <div className={`game-viewport${blocked ? ' orientation-blocked' : ''}`}
      data-fullscreen={mobile ? fullscreen : undefined}
      onPointerUpCapture={mobile && !blocked ? requestFromGesture : undefined}
      onClickCapture={mobile && !blocked ? requestFromGesture : undefined}
      inert={blocked ? true : undefined} aria-hidden={blocked ? true : undefined}>
      {children}
    </div>
    {blocked && <div className="mobile-orientation-overlay" role="status" aria-live="polite">
      <Smartphone className="mobile-rotation-icon" size={56} strokeWidth={1.4} aria-hidden="true" />
      <h1>Girá tu dispositivo</h1>
      <p>Este juego está diseñado para jugar en horizontal.</p>
    </div>}
  </>
}
