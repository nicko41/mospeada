export const cameraFraming={cycloneFov:70,armorFov:50,armorTargetHeight:1.35,armorPitch:-.04}
export const smoothCamera=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}
export function armorCameraWeight(runtime){
  if(runtime.armorController?.active)return 1
  const entry=runtime.transformEntry
  if(entry?.returnFlight)return 1-smoothCamera(entry.returnProgress??1)
  return entry?.cameraProgress!=null?smoothCamera(entry.cameraProgress):0
}
export function setCameraFov(camera,fov){
  if(Math.abs(camera.fov-fov)>.0001){camera.fov=fov;camera.updateProjectionMatrix()}
}
