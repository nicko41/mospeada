const START_MINUTES = 3 * 60
const REAL_SECONDS_PER_MINUTE = 10

export function mobileClockTime(elapsedSeconds) {
  const minutes = (START_MINUTES + Math.floor(elapsedSeconds / REAL_SECONDS_PER_MINUTE)) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
