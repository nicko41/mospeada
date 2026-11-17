import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { touchInput, desktopInput, joystickVector, resetTouchInput, isGameInputActive,
  subscribeTouchAction, triggerTouchAction } from './touchInput.js'

beforeEach(() => {
  globalThis.document = { pointerLockElement: null, hidden: false, hasFocus: () => true }
  resetTouchInput()
  touchInput.enabled = false
  touchInput.active = false
  desktopInput.ready = false
  desktopInput.paused = false
})

test('desktop input activates after loading without requiring pointer lock', () => {
  assert.equal(isGameInputActive(), false)
  desktopInput.ready = true
  assert.equal(isGameInputActive(), true)
  desktopInput.paused = true
  assert.equal(isGameInputActive(), false)
})

test('desktop input stops when the page is hidden or loses focus', () => {
  desktopInput.ready = true
  document.hidden = true
  assert.equal(isGameInputActive(), false)
  document.hidden = false
  document.hasFocus = () => false
  assert.equal(isGameInputActive(), false)
})

test('mobile input requires a gesture, focus and a visible page', () => {
  touchInput.enabled = true
  assert.equal(isGameInputActive(), false)
  touchInput.active = true
  assert.equal(isGameInputActive(), true)
  document.hidden = true
  assert.equal(isGameInputActive(), false)
  document.hidden = false
  document.hasFocus = () => false
  assert.equal(isGameInputActive(), false)
})

test('small deflections preserve analog speed in every direction', () => {
  assert.deepEqual(joystickVector(0, -10, 40), { x: 0, y: 0.25, sprint: false })
  const reverse = joystickVector(-10, 10, 40)
  assert.equal(reverse.x, -0.25)
  assert.equal(reverse.y, -0.25)
  assert.equal(reverse.sprint, false)
})

test('diagonal and out-of-bounds drags cannot exceed full speed', () => {
  const diagonal = joystickVector(400, -400, 40)
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12)
  assert.equal(diagonal.sprint, false)
  assert.equal(joystickVector(0, -400, 40).sprint, true)
})

test('sprint engages only in the final 18 percent toward the top', () => {
  assert.equal(joystickVector(0, -81, 100).sprint, false)
  assert.equal(joystickVector(0, -82, 100).sprint, true)
  assert.equal(joystickVector(100, 0, 100).sprint, false)
  assert.equal(joystickVector(0, 100, 100).sprint, false)
})

test('reset immediately clears movement, sprint and pending look', () => {
  Object.assign(touchInput, { x: 0.5, y: 1, sprint: true, lookX: 90, lookY: -60 })
  resetTouchInput()
  assert.equal(touchInput.x, 0)
  assert.equal(touchInput.y, 0)
  assert.equal(touchInput.sprint, false)
  assert.equal(touchInput.lookX, 0)
  assert.equal(touchInput.lookY, 0)
})

test('actions coexist with a held joystick and unsubscribe cleanly', () => {
  Object.assign(touchInput, { enabled: true, active: true, y: 1, sprint: true })
  let attacks = 0, jumps = 0
  const stopAttack = subscribeTouchAction('attack', () => attacks++)
  const stopJump = subscribeTouchAction('jump', () => jumps++)
  triggerTouchAction('attack')
  triggerTouchAction('jump')
  assert.equal(attacks, 1)
  assert.equal(jumps, 1)
  assert.equal(touchInput.y, 1)
  assert.equal(touchInput.sprint, true)
  stopAttack()
  triggerTouchAction('attack')
  assert.equal(attacks, 1)
  document.hidden = true
  triggerTouchAction('jump')
  assert.equal(jumps, 1)
  stopJump()
})
