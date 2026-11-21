export const FOLIAGE_PILOT=Object.freeze({
  seed:19830924,center:{x:-19,z:-23},radius:{x:13,z:15},
  instances:66,distance:58,fadeStart:44,alphaTest:.42,
})
export function inFoliagePilot(x,z,margin=0){return ((x-FOLIAGE_PILOT.center.x)/(FOLIAGE_PILOT.radius.x+margin))**2+((z-FOLIAGE_PILOT.center.z)/(FOLIAGE_PILOT.radius.z+margin))**2<1}
