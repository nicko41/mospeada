export const GRASS_TILE_SIZE = 24
export const GRASS_TILE_RADIUS = 2
export const GRASS_TILE_CANDIDATES = 288
export const GRASS_VISIBLE_DISTANCE = 45

export function createHighwayGrassTile(tileX, tileZ, { startX, roadZ, clearance, heightAt }) {
  let seed = Math.imul(tileX, 73856093) ^ Math.imul(tileZ, 19349663) ^ 721904
  const random = () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const result = []
  // A fixed density per square metre, not a smaller global quality budget.
  for (let i = 0; i < GRASS_TILE_CANDIDATES; i++) {
    const x = (tileX + random()) * GRASS_TILE_SIZE, z = (tileZ + random()) * GRASS_TILE_SIZE
    if (x >= startX + 10 || Math.abs(z - roadZ) < clearance + 2) continue
    const patch = Math.sin(x * 0.14 + Math.sin(z * 0.085) * 1.8) * 0.6 + Math.sin(x * 0.049 - z * 0.073) * 0.4
    if (patch < -0.42 || random() > 0.68 + patch * 0.16) continue
    result.push({ x, y: heightAt(x, z) - 0.018, z, height: 0.78 + random() * 0.73,
      width: 0.78 + random() * 0.8, yaw: random() * Math.PI, roll: (random() - 0.5) * 0.12, color: Math.floor(random() * 5) })
  }
  return result
}
