export function centerDesktopPointer(state) {
  state.pointer.set(0, 0)
  state.raycaster.setFromCamera(state.pointer, state.camera)
}

// Both modes use relative movement. Never turn a click position into a view angle.
export function createDesktopLookInput() {
  let mode = null
  let skipSample = true
  return {
    reset() { mode = null; skipSample = true },
    move(event, locked) {
      if (mode !== locked) { mode = locked; skipSample = true }
      if (skipSample) { skipSample = false; return null }
      // The screen position never becomes a look origin, even before capture.
      return { x: event.movementX || 0, y: event.movementY || 0 }
    },
  }
}
