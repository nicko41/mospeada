// Created once per mobile session; only a direct user gesture calls request().
export function createMobileFullscreenSession(doc) {
  let attempted = false
  return {
    async request() {
      if (attempted) return
      attempted = true
      try {
        const root = doc.documentElement
        if (doc.fullscreenElement || typeof root?.requestFullscreen !== 'function') return
        // Invoke before awaiting anything, while transient user activation is available.
        await root.requestFullscreen()
      } catch {
        // Unsupported or denied fullscreen must never interrupt the existing game.
      }
    },
    isFullscreen: () => doc.fullscreenElement === doc.documentElement ||
      doc.webkitFullscreenElement === doc.documentElement,
  }
}
