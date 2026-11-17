export const PORTRAIT_QUERY = '(orientation: portrait)'

// One shared snapshot for the overlay and controls, with one set of native listeners.
export function createViewportOrientationStore(viewport) {
  const query = viewport.matchMedia(PORTRAIT_QUERY)
  const listeners = new Set()
  let landscape = !query.matches
  const update = event => {
    const next = event?.type === 'change' ? !event.matches
      : !viewport.matchMedia(PORTRAIT_QUERY).matches
    if (next === landscape) return
    landscape = next
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => landscape,
    subscribe(listener) {
      if (listeners.size === 0) {
        if (query.addEventListener) query.addEventListener('change', update)
        else query.addListener(update)
        viewport.addEventListener('orientationchange', update)
        viewport.addEventListener('resize', update)
        viewport.visualViewport?.addEventListener('resize', update)
        update()
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size !== 0) return
        if (query.removeEventListener) query.removeEventListener('change', update)
        else query.removeListener(update)
        viewport.removeEventListener('orientationchange', update)
        viewport.removeEventListener('resize', update)
        viewport.visualViewport?.removeEventListener('resize', update)
      }
    },
  }
}

let orientationStore
const getOrientationStore = () => orientationStore ??= createViewportOrientationStore(window)
export const isLandscapeViewport = () => typeof window === 'undefined' || getOrientationStore().getSnapshot()
export const subscribeViewportOrientation = listener => getOrientationStore().subscribe(listener)

// Optional fullscreen enhancement. The portrait overlay never depends on this API.
export async function tryLockLandscape(screenApi = window.screen) {
  try {
    if (typeof screenApi?.orientation?.lock !== 'function') return false
    await screenApi.orientation.lock('landscape')
    return true
  } catch {
    return false
  }
}
