import test from 'node:test'
import assert from 'node:assert/strict'
import { createHighwayGrassTile, GRASS_TILE_SIZE } from './highwayGrassTiles.js'

const settings = { startX: -130, roadZ: -72, clearance: 24, heightAt: (x, z) => x * 0.01 + z * 0.02 }

test('streamed grass is anchored to world tiles and returns unchanged after recycling', () => {
  const first = createHighwayGrassTile(-11, -5, settings)
  createHighwayGrassTile(-30, -4, settings)
  assert.deepEqual(createHighwayGrassTile(-11, -5, settings), first)
  assert.notDeepEqual(createHighwayGrassTile(-12, -5, settings), first)
  assert.ok(first.length > 100, 'The field must retain dense clumps, not sparse sign weeds')
  for (const point of first) {
    assert.ok(point.x >= -11 * GRASS_TILE_SIZE && point.x < -10 * GRASS_TILE_SIZE)
    assert.ok(point.z >= -5 * GRASS_TILE_SIZE && point.z < -4 * GRASS_TILE_SIZE)
    assert.ok(Math.abs(point.y - (settings.heightAt(point.x, point.z) - 0.018)) < 1e-8)
    assert.ok(point.height >= 0.78 && point.height <= 1.51 && point.width >= 0.78 && point.width <= 1.58)
  }
})

test('streamed vegetation leaves carriageways clear and stays outside the original field', () => {
  assert.deepEqual(createHighwayGrassTile(-11, -4, settings), [])
  assert.deepEqual(createHighwayGrassTile(0, -5, settings), [])
  for (let x = -14; x <= -5; x++) for (let z = -6; z <= -1; z++) {
    for (const point of createHighwayGrassTile(x, z, settings)) {
      assert.ok(point.x < -120)
      assert.ok(Math.abs(point.z + 72) >= 26)
    }
  }
})
