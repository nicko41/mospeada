import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { createDesktopLookInput, centerDesktopPointer } from './desktopLookInput.js'

test('aiming ray is recentered on the camera direction regardless of cursor position', () => {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 220)
  camera.position.set(3, 1.7, 18)
  camera.rotation.set(-0.12, 0.4, 0)
  camera.updateMatrixWorld()
  const state = { camera, pointer: new Vector2(0.8, -0.6), raycaster: new Raycaster() }
  centerDesktopPointer(state)
  assert.deepEqual(state.pointer.toArray(), [0, 0])
  assert.ok(state.raycaster.ray.origin.distanceTo(camera.position) < 1e-10)
  assert.ok(state.raycaster.ray.direction.distanceTo(camera.getWorldDirection(new Vector3())) < 1e-10)
})

test('an off-center initial cursor position never rotates the camera', () => {
  const look = createDesktopLookInput()
  assert.equal(look.move({ clientX: 900, clientY: 100 }, false), null)
  assert.deepEqual(look.move({ clientX: 905, clientY: 98, movementX: 5, movementY: -2 }, false), { x: 5, y: -2 })
})

test('capture discards the initial cursor warp and then uses relative deltas', () => {
  const look = createDesktopLookInput()
  look.move({ clientX: 900, clientY: 100 }, false)
  look.reset()
  assert.equal(look.move({ movementX: -400, movementY: 250 }, true), null)
  assert.deepEqual(look.move({ movementX: 4, movementY: -3, clientX: 900, clientY: 100 }, true), { x: 4, y: -3 })
})

test('returning after focus loss or unlocking establishes a fresh cursor baseline', () => {
  const look = createDesktopLookInput()
  look.move({ clientX: 20, clientY: 40 }, false)
  look.reset()
  assert.equal(look.move({ clientX: 1000, clientY: 800 }, false), null)
  assert.deepEqual(look.move({ clientX: 998, clientY: 805, movementX: -2, movementY: 5 }, false), { x: -2, y: 5 })
})

test('different screen positions produce identical POV movement before and after capture', () => {
  for (const locked of [false, true]) {
    const corner = createDesktopLookInput()
    const center = createDesktopLookInput()
    corner.move({ clientX: 10, clientY: 20 }, locked)
    center.move({ clientX: 960, clientY: 540 }, locked)
    assert.deepEqual(
      corner.move({ clientX: 500, clientY: 700, movementX: 3, movementY: -1 }, locked),
      center.move({ clientX: 963, clientY: 539, movementX: 3, movementY: -1 }, locked),
    )
  }
})
