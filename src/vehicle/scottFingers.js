import { Quaternion, Vector3 } from 'three'

const curlAxis = new Vector3(1, 0, 0), opposeAxis = new Vector3(0, 0, 1), q = new Quaternion()
export function createFingerController(root) {
  const fingers = []
  root.traverse(bone => {
    if (bone.isBone && bone.userData.articulatedFinger) fingers.push({ bone, rest: bone.quaternion.clone(), ...bone.userData })
  })
  return {
    fingers,
    apply(amount = 0.12) {
      for (const finger of fingers) {
        const { bone, rest, segment, digit, side } = finger
        const bend = (digit === 'Thumb' ? [0.65, 1.0, 0.85] : [0.92, 1.25, 0.95])[segment - 1] * amount
        bone.quaternion.copy(rest)
        if (digit === 'Thumb' && segment === 1) bone.quaternion.multiply(q.setFromAxisAngle(opposeAxis, (side === 'Left' ? -1 : 1) * 1.0 * amount))
        bone.quaternion.multiply(q.setFromAxisAngle(curlAxis, bend))
      }
    },
  }
}
