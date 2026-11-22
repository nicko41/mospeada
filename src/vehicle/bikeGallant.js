// Shared by input and pose evaluation. Driving, braking, steering, boost and
// airborne state deliberately do not gate mounted aiming/shooting.
export function bikeGallantAvailable(runtime){
  return runtime.state?.riderMode==='mounted'&&!runtime.armorController?.active&&!runtime.opening?.active&&(!runtime.transformEntry||runtime.transformEntry.phase==='idle')
}
