// Scott's gear stays restrained. The bike retains its original strong coating;
// its load and coverage limits must never be inherited from Scott's .25 cap.
export const EQUIPMENT_SOIL_MAX = .25
export const BIKE_SOIL_MAX = 1
export const BIKE_SOIL_COVERAGE_MAX = .79
export const equipmentSoil = (value, maximum = EQUIPMENT_SOIL_MAX) =>
  Math.max(0, Math.min(EQUIPMENT_SOIL_MAX, Number(maximum) || 0, Number(value) || 0))
export const bikeSoil = (value, maximum = BIKE_SOIL_MAX) =>
  Math.max(0, Math.min(BIKE_SOIL_MAX, Number(maximum) || 0, Number(value) || 0))
