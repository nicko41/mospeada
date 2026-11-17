import { highwayLiftAt, infiniteHighwayHeightAt } from '../world/sectors/highwayProfile'
import { terrainHeight } from '../world/terrain'

export function getWalkableHeightAt(x, z) {
  const extensionHeight = infiniteHighwayHeightAt(x, z)
  if (extensionHeight !== null) return extensionHeight
  return terrainHeight(x, z) + highwayLiftAt(x, z)
}
