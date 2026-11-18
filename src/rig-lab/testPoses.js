import { Quaternion, Vector3 } from 'three'

export function rigBones(root) {
  const map = new Map()
  root.traverse(node => { if (node.isBone) map.set(node.name.replace(/^mixamorig[:_]?/, ''), node) })
  return map
}

export function applyTestPose(root, pose) {
  const bones = rigBones(root)
  root.updateMatrixWorld(true)
  function aim(name, tail, vector) {
    const bone = bones.get(name), end = bones.get(tail), a = bone.getWorldPosition(new Vector3())
    const direction = end.getWorldPosition(new Vector3()).sub(a).normalize()
    const turn = new Quaternion().setFromUnitVectors(direction, new Vector3(...vector).normalize())
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(turn.multiply(bone.getWorldQuaternion(new Quaternion()))))
    root.updateMatrixWorld(true)
  }
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1
    if (['arms', 'seated'].includes(pose)) {
      aim(side + 'Arm', side + 'ForeArm', [sign * 0.4, -0.8, 0.35])
      aim(side + 'ForeArm', side + 'Hand', [sign * 0.08, -0.1, 1])
    }
    if (pose === 'shoulders') aim(side + 'Arm', side + 'ForeArm', [sign * 0.3, 1, 0.05])
    if (['knees', 'seated'].includes(pose)) {
      aim(side + 'UpLeg', side + 'Leg', [sign * 0.08, -0.15, 1])
      aim(side + 'Leg', side + 'Foot', [0, -1, -0.12])
    }
  }
  return bones
}

// Reproduce the current game's pose for inspection without modifying its solver.
export function copyDrivingPose(target, referenceRig) {
  let reference = referenceRig.bones.get('Hips')
  while (reference.parent.name !== 'Scott_coordinate_conversion') reference = reference.parent
  const originalBones = rigBones(reference)
  for (const [name, bone] of rigBones(target)) {
    const from = originalBones.get(name)
    bone.position.copy(from.position); bone.quaternion.copy(from.quaternion); bone.scale.copy(from.scale)
  }
  reference.matrixWorld.decompose(target.position, target.quaternion, target.scale)
  target.updateMatrixWorld(true)
  return reference
}
