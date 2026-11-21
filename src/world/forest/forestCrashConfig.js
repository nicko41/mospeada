// Provisional design scale, not a canonical aircraft specification.
import {CRASH_REFERENCE,CRASH_RELOCATION} from './crashRelocation.js'
export const FOREST_CRASH = Object.freeze({
  x: CRASH_REFERENCE.x+CRASH_RELOCATION.x, z: CRASH_REFERENCE.z+CRASH_RELOCATION.z, yaw: .65, pitch: -.045, roll: -.14,
  settledPitch: .075, noseClearance: .025,
  length: 16, previousLength: 10, sourceLength: 1.902529001235962, burial: .30,
  model: '/models/mospeada/alpha-fighter-down.glb',
})
// Beside the nose, matching the requested front-left reference. Aim just ahead
// of the tip so straight acceleration clears the wreck instead of hitting it.
export const FOREST_SPAWN=Object.freeze({
  x:FOREST_CRASH.x-Math.cos(FOREST_CRASH.yaw)*5.5-Math.sin(FOREST_CRASH.yaw)*8.8,
  z:FOREST_CRASH.z+Math.sin(FOREST_CRASH.yaw)*5.5-Math.cos(FOREST_CRASH.yaw)*8.8,
  yaw:FOREST_CRASH.yaw+Math.PI/2+.15,label:'Nivel 01 · Bosque',
})
export function crashLocal(x,z) {
  const dx=x-FOREST_CRASH.x,dz=z-FOREST_CRASH.z,c=Math.cos(FOREST_CRASH.yaw),s=Math.sin(FOREST_CRASH.yaw)
  return {x:c*dx-s*dz,z:s*dx+c*dz}
}
export function crashVegetationClearance(x,z,margin=0) {
  const p=crashLocal(x,z)
  return (p.x/(3.5+margin))**2+(p.z/(5.8+margin))**2<1
    || Math.abs(p.x)<1.6+margin&&p.z>3&&p.z<10.5+margin
}
