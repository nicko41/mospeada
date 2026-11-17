export const POLE_FADE_START = 175
export const POLE_FADE_FULL = 105
export const POLE_FADE_RESPONSE = 5

const smoothstep = (value, low, high) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

export function highwayPoleVisibility(alongDistance, lateralDistance) {
  return (1 - smoothstep(Math.abs(alongDistance), POLE_FADE_FULL, POLE_FADE_START))
    * (1 - smoothstep(Math.abs(lateralDistance), 32, 48))
}
