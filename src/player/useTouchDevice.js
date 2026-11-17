import { useEffect, useState } from 'react'

const detectTouch = () => typeof window !== 'undefined' &&
  matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

export default function useTouchDevice() {
  const [enabled, setEnabled] = useState(detectTouch)
  useEffect(() => {
    const query = matchMedia('(pointer: coarse)')
    const update = () => setEnabled(detectTouch())
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return enabled
}
