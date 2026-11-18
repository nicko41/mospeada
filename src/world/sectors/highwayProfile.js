import { terrainHeight } from '../terrain.js'

export const HIGHWAY_Z = -72
export const HIGHWAY_LENGTH = 260
export const HIGHWAY_CLEARANCE = 24
export const HIGHWAY_TOP_HALF_WIDTH = 14
export const HIGHWAY_SLOPE_MID = 19
export const HIGHWAY_ROAD_HEIGHT = 2.15
export const INFINITE_HIGHWAY_START_X = -HIGHWAY_LENGTH * 0.5

// Beyond the authored road, the recycled extension has a level repeating profile.
export function infiniteHighwayHeightAt(x, z) {
  if (x >= INFINITE_HIGHWAY_START_X) return null
  const distance = Math.abs(z - HIGHWAY_Z)
  const base = terrainHeight(INFINITE_HIGHWAY_START_X, z)
  if (distance >= 27) return base
  if (distance <= HIGHWAY_TOP_HALF_WIDTH) return base + HIGHWAY_ROAD_HEIGHT + 0.012
  if (distance <= 19) {
    const t = smoothstep((distance - HIGHWAY_TOP_HALF_WIDTH) / (19 - HIGHWAY_TOP_HALF_WIDTH))
    return base + lerp(HIGHWAY_ROAD_HEIGHT + 0.012, HIGHWAY_SLOPE_MID_HEIGHT, t)
  }
  return base + HIGHWAY_SLOPE_MID_HEIGHT * (1 - smoothstep((distance - 19) / 8))
}

export const HIGHWAY_SLOPE_MID_HEIGHT = 0.38

function lerp(start, end, amount) {
  return start + (end - start) * amount
}

function smoothstep(t) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

// The road stays fixed; only the earth beyond its compacted crown wanders.
export function highwayEarthEdgeAt(x, side) {
  const wave = Math.sin(x * 0.045 + side * 1.7) * 0.55
    + Math.sin(x * 0.091 - side * 0.8) * 0.21
  return {
    crown: HIGHWAY_TOP_HALF_WIDTH + 0.5 + wave * 0.25,
    mid: HIGHWAY_SLOPE_MID + wave * 0.55,
    foot: HIGHWAY_CLEARANCE + wave,
  }
}

export function highwayLiftAt(x, z) {
  if (Math.abs(x) > HIGHWAY_LENGTH * 0.5) return 0

  const distance = Math.abs(z - HIGHWAY_Z)
  const { crown, mid, foot } = highwayEarthEdgeAt(x, Math.sign(z - HIGHWAY_Z) || 1)
  if (distance >= foot) return 0
  if (distance <= HIGHWAY_TOP_HALF_WIDTH) return HIGHWAY_ROAD_HEIGHT + 0.012

  if (distance <= crown) {
    const t = smoothstep((distance - HIGHWAY_TOP_HALF_WIDTH) / (crown - HIGHWAY_TOP_HALF_WIDTH))
    return HIGHWAY_ROAD_HEIGHT + 0.012 - t * 0.075
  }

  const settledWave = Math.sin(x * 0.061 + distance * 0.82) * 0.045
    + Math.sin(x * 0.11 - distance * 0.43) * 0.025
  if (distance <= mid) {
    const progress = smoothstep((distance - crown) / (mid - crown))
    return lerp(HIGHWAY_ROAD_HEIGHT - 0.063, HIGHWAY_SLOPE_MID_HEIGHT + settledWave, progress)
  }

  const progress = smoothstep((distance - mid) / (foot - mid))
  return lerp(HIGHWAY_SLOPE_MID_HEIGHT + settledWave, 0, progress)
}
