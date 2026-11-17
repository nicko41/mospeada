import { useSyncExternalStore } from 'react'
import { isLandscapeViewport, subscribeViewportOrientation } from './viewportOrientation'

export default function useLandscapeViewport() {
  return useSyncExternalStore(subscribeViewportOrientation, isLandscapeViewport, () => true)
}
