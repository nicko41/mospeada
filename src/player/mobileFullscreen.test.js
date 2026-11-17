import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMobileFullscreenSession } from './mobileFullscreen.js'

test('initialization never requests fullscreen; a gesture calls it synchronously', async () => {
  let calls = 0
  const doc = { documentElement: { requestFullscreen() { calls++; return Promise.resolve() } }, fullscreenElement: null }
  const session = createMobileFullscreenSession(doc)
  assert.equal(calls, 0)
  const result = session.request()
  assert.equal(calls, 1)
  await result
  assert.equal(session.isFullscreen(), false)
  doc.fullscreenElement = doc.documentElement
  assert.equal(session.isFullscreen(), true)
})

test('leaving fullscreen does not cause another request on later gestures', async () => {
  let calls = 0
  const doc = { documentElement: { requestFullscreen() { calls++; return Promise.resolve() } }, fullscreenElement: null }
  const session = createMobileFullscreenSession(doc)
  await session.request()
  doc.fullscreenElement = doc.documentElement
  assert.equal(session.isFullscreen(), true)
  doc.fullscreenElement = null
  assert.equal(session.isFullscreen(), false)
  await session.request()
  assert.equal(calls, 1)
})

test('unsupported, synchronously thrown and rejected fullscreen fall back silently', async () => {
  for (const root of [
    {},
    { requestFullscreen() { throw new Error('Unsupported') } },
    { requestFullscreen() { return Promise.reject(new Error('Not allowed')) } },
  ]) {
    const session = createMobileFullscreenSession({ documentElement: root, fullscreenElement: null })
    await assert.doesNotReject(() => session.request())
    assert.equal(session.isFullscreen(), false)
    await assert.doesNotReject(() => session.request())
  }
})

test('rapid taps while the request is pending produce only one attempt', async () => {
  let calls = 0, resolve
  const pending = new Promise(done => { resolve = done })
  const doc = { documentElement: { requestFullscreen() { calls++; return pending } }, fullscreenElement: null }
  const session = createMobileFullscreenSession(doc)
  const first = session.request()
  await session.request()
  assert.equal(calls, 1)
  resolve()
  await first
})
