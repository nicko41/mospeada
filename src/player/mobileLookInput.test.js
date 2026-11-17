import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLookGesture, smoothLookDelta } from './mobileLookInput.js'
import { MOBILE_LOOK_SENSITIVITY_X } from './mobileLookConfig.js'
import { touchInput, resetTouchLook, subscribeTouchAction, triggerTouchAction } from './touchInput.js'

test('look owns only its pointer and ignores other fingers', () => {
  const gesture = createLookGesture()
  assert.equal(gesture.start(2, 400, 100, 800, 400), true)
  assert.equal(gesture.start(3, 600, 100, 800, 400), false)
  assert.equal(gesture.move(1, 100, 200), null)
  assert.equal(gesture.end(3), false)
  assert.equal(gesture.pointerId, 2)
  assert.ok(gesture.move(2, 450, 100).x > 0)
  assert.equal(gesture.end(2), true)
  assert.equal(gesture.pointerId, null)
})

test('jitter is absorbed while slow, deliberate movement still accumulates', () => {
  const gesture = createLookGesture()
  gesture.start(1, 100, 100, 800, 400)
  assert.equal(gesture.move(1, 101, 101), null)
  assert.equal(gesture.move(1, 99, 99), null)
  assert.equal(gesture.move(1, 102, 100), null)
  const first = gesture.move(1, 103, 100)
  const second = gesture.move(1, 104, 100)
  assert.equal(first.x, 0.5 / 800)
  assert.equal(second.x, 1 / 800)
})

test('look is relative to the gesture and a comfortable swipe turns approximately 180 degrees', () => {
  for (const width of [640, 800, 1024]) {
    const gesture = createLookGesture()
    gesture.start(1, width / 2, 100, width, 400)
    const delta = gesture.move(1, width / 2 + width * 0.42, 100)
    assert.ok(Math.abs(delta.x * MOBILE_LOOK_SENSITIVITY_X - Math.PI) < 0.04)
    assert.equal(delta.y, 0)
  }
})

test('smoothing responds immediately and settles within a few milliseconds', () => {
  const input = { lookX: 1, lookPendingX: 0 }
  const immediate = smoothLookDelta(input, 'lookX', 1 / 60)
  assert.equal(immediate, 0.85)
  const next = smoothLookDelta(input, 'lookX', 1 / 60)
  assert.ok(immediate + next > 0.98)
  let total = immediate + next
  for (let i = 0; i < 8; i++) total += smoothLookDelta(input, 'lookX', 1 / 60)
  assert.ok(Math.abs(total - 1) < 1e-8)
})

test('looking, sprinting and attacking coexist; releasing look preserves movement', () => {
  globalThis.document = { pointerLockElement: null, hidden: false, hasFocus: () => true }
  Object.assign(touchInput, { enabled: true, active: true, x: 0, y: 1, sprint: true })
  const gesture = createLookGesture()
  gesture.start(2, 500, 100, 800, 400)
  const delta = gesture.move(2, 550, 120)
  touchInput.lookX = delta.x; touchInput.lookY = delta.y
  let attacks = 0
  const stop = subscribeTouchAction('attack', () => attacks++)
  triggerTouchAction('attack')
  assert.equal(attacks, 1)
  assert.equal(touchInput.y, 1)
  assert.ok(touchInput.lookX > 0)
  smoothLookDelta(touchInput, 'lookX', 1 / 60)
  gesture.end(2)
  resetTouchLook()
  assert.equal(touchInput.lookPendingX, 0)
  assert.equal(touchInput.lookPendingY, 0)
  assert.equal(touchInput.lookX, 0)
  assert.equal(touchInput.y, 1)
  assert.equal(touchInput.sprint, true)
  stop()
})

test('cancelled gestures cannot resume until a new pointer down', () => {
  const gesture = createLookGesture()
  gesture.start(4, 400, 100, 800, 400)
  gesture.clear()
  assert.equal(gesture.move(4, 450, 150), null)
  assert.equal(gesture.start(5, 600, 200, 800, 400), true)
  assert.equal(gesture.move(5, 600, 200), null)
})
