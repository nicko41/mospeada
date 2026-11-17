export const WORLD_WIDTH = 280
export const WORLD_LENGTH = 380
export const WORLD_CENTER_Z = -115

export function terrainHeight(x, z) {
  const broad = Math.sin(x * 0.027) * 0.09 + Math.sin(z * 0.021 + 0.8) * 0.08
  const crossed = Math.sin((x + z) * 0.052) * 0.035
  const shallowDitch = -0.1 * Math.exp(-Math.pow((Math.abs(x) - 5.2) / 1.5, 2))

  return broad + crossed + shallowDitch
}

export function roadCenterAt(z) {
  return Math.sin((z + 18) * 0.018) * 1.8 + Math.sin(z * 0.047) * 0.45
}
