import { useCallback, useEffect, useRef, useState } from 'react'
import { createMobileFullscreenSession } from './mobileFullscreen'
import { tryLockLandscape } from './viewportOrientation'

export default function useMobileFullscreen(mobile) {
  const session = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)
  const requestFromGesture = useCallback(() => {
    if (!mobile) return
    session.current ??= createMobileFullscreenSession(document)
    void session.current.request()
  }, [mobile])

  useEffect(() => {
    if (!mobile) return
    session.current ??= createMobileFullscreenSession(document)
    let wasFullscreen = false
    let frame = null
    const onFullscreen = () => {
      const active = session.current.isFullscreen()
      setFullscreen(active)
      if (active && !wasFullscreen) void tryLockLandscape()
      wasFullscreen = active
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }
    onFullscreen()
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('webkitfullscreenchange', onFullscreen)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('webkitfullscreenchange', onFullscreen)
    }
  }, [mobile])

  return { fullscreen, requestFromGesture }
}
