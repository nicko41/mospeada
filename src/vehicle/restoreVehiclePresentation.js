// Discontinuous cuts/restarts run before the normal frame restores. Unwind
// the late attachment layers first, just as the regular render loop does;
// otherwise V3 can restore an Armor matrix after Armor has already restored.
export function restoreVehiclePresentation(runtime){
  const instance=runtime.scottInstance
  instance?.modelComparison?.v3?.restoreAttachments()
  instance?.armorArticulation?.restore()
  runtime.transformationFrame?.restore()
  runtime.suspensionTransformation?.restore()
  runtime.wheelTransformation?.restore()
  runtime.guardTransformation?.restore()
  runtime.rearTransformation?.restore()
  runtime.frontTransformation?.restore()
}
