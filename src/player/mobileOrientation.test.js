import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PORTRAIT_QUERY, createViewportOrientationStore,
  tryLockLandscape } from './viewportOrientation.js'

function mockViewport(portrait = true) {
  const target = () => {
    const handlers = new Map()
    return {
      handlers,
      addEventListener(type, listener) {
        if (!handlers.has(type)) handlers.set(type, new Set())
        handlers.get(type).add(listener)
      },
      removeEventListener(type, listener) { handlers.get(type)?.delete(listener) },
      dispatch(type, extra = {}) { handlers.get(type)?.forEach(listener => listener({ type, ...extra })) },
    }
  }
  const query = { ...target(), matches: portrait }
  const viewport = {
    ...target(), visualViewport: target(),
    matchMedia(value) { assert.equal(value, PORTRAIT_QUERY); return query },
  }
  return { viewport, query }
}

test('portrait → landscape → portrait updates both subscribers throughout the session', () => {
  const { viewport, query } = mockViewport()
  const store = createViewportOrientationStore(viewport)
  const overlay = [], controls = []
  assert.equal(store.getSnapshot(), false)
  const stopOverlay = store.subscribe(() => overlay.push(store.getSnapshot()))
  const stopControls = store.subscribe(() => controls.push(store.getSnapshot()))
  for (const portrait of [false, true, false, true]) {
    query.matches = portrait
    query.dispatch('change', { matches: portrait })
  }
  assert.deepEqual(overlay, [true, false, true, false])
  assert.deepEqual(controls, overlay)
  assert.equal(query.handlers.get('change').size, 1)
  stopOverlay()
  assert.equal(query.handlers.get('change').size, 1)
  stopControls()
  assert.equal(query.handlers.get('change').size, 0)
  for (const callbacks of viewport.handlers.values()) assert.equal(callbacks.size, 0)
  assert.equal(viewport.visualViewport.handlers.get('resize').size, 0)
})

test('resize and orientationchange recover when the media query change event is missing', () => {
  const { viewport, query } = mockViewport()
  const store = createViewportOrientationStore(viewport)
  const states = []
  const stop = store.subscribe(() => states.push(store.getSnapshot()))
  query.matches = false
  viewport.dispatch('resize')
  viewport.dispatch('resize') // Canvas remeasurement must not create an update loop.
  query.matches = true
  viewport.dispatch('orientationchange')
  query.matches = false
  viewport.visualViewport.dispatch('resize')
  assert.deepEqual(states, [true, false, true])
  stop()
})

test('resubscribing refreshes orientation after an unmounted interval', () => {
  const { viewport, query } = mockViewport()
  const store = createViewportOrientationStore(viewport)
  store.subscribe(() => {})()
  query.matches = false
  const stop = store.subscribe(() => {})
  assert.equal(store.getSnapshot(), true)
  stop()
})

test('older mobile media query listeners also update and clean up', () => {
  const { viewport, query } = mockViewport()
  query.addListener = listener => query.addEventListenerLegacy('change', listener)
  query.removeListener = listener => query.removeEventListenerLegacy('change', listener)
  query.addEventListenerLegacy = query.addEventListener
  query.removeEventListenerLegacy = query.removeEventListener
  delete query.addEventListener
  delete query.removeEventListener
  const store = createViewportOrientationStore(viewport)
  const stop = store.subscribe(() => {})
  query.matches = false
  query.dispatch('change', { matches: false })
  assert.equal(store.getSnapshot(), true)
  stop()
  assert.equal(query.handlers.get('change').size, 0)
})

test('fullscreen enhancement requests landscape when supported', async () => {
  let requested = null
  assert.equal(await tryLockLandscape({ orientation: { async lock(value) { requested = value } } }), true)
  assert.equal(requested, 'landscape')
})

test('unsupported and rejected orientation locks leave the fallback available', async () => {
  assert.equal(await tryLockLandscape({}), false)
  assert.equal(await tryLockLandscape({ orientation: { lock() { throw new Error('Unsupported') } } }), false)
  assert.equal(await tryLockLandscape({ orientation: { async lock() { throw new Error('Not allowed') } } }), false)
})
