import { Float32BufferAttribute, MathUtils, Vector3 } from 'three'

// A reversible, mesh-local morph on a private geometry instance. Meshy supplied
// wrist bones only: no finger joints, new bones, weights or clip edits are used.
// The cuff is untouched; the bend starts within the glove, beyond the wrist.
export function createRelaxedScottHands(mesh) {
  const source = mesh.geometry
  if (!mesh.isSkinnedMesh || Object.keys(source.morphAttributes).length) return null
  const p = source.attributes.position, n = source.attributes.normal
  const joints = source.attributes.skinIndex, weights = source.attributes.skinWeight
  const deltas = Array.from({length:3},()=>new Float32Array(p.count * 3))
  const normalDeltas = Array.from({length:3},()=>new Float32Array(p.count * 3)), affected = []
  const a = new Vector3(), b = new Vector3(), normal = new Vector3(), tangent = new Vector3(), bitangent = new Vector3()
  const sides = ['Left', 'Right'].map(side => {
    const joint = mesh.skeleton.bones.findIndex(bone => bone.name.endsWith(side + 'Hand'))
    if (joint < 0) return null
    const wrist = new Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[joint].clone().invert().premultiply(mesh.bindMatrixInverse))
    const sign = side === 'Left' ? 1 : -1
    let length = 0
    for (let i = 0; i < p.count; i++) for (let k = 0; k < 4; k++) {
      if (joints.array[i * 4 + k] === joint && weights.array[i * 4 + k] > .5) length = Math.max(length, sign * (p.getX(i) - wrist.x))
    }
    return { joint, wrist, sign, length, count: 0 }
  }).filter(Boolean)

  function deform(point, hand, amount, grip = false) {
    const { wrist, sign, length } = hand, u = sign * (point.x - wrist.x) / length
    const z = (point.z - wrist.z) / length
    const glove = MathUtils.smoothstep(u, .33, .52) * amount
    if (!glove) return point
    const thumb = MathUtils.smoothstep(z, .25, .37) * (1 - MathUtils.smoothstep(u, .64, .80))
    const pivot = length * MathUtils.lerp(.51, .34, thumb)
    const longitudinal = sign * (point.x - wrist.x)
    const short = longitudinal - Math.max(0, longitudinal - length * .33) * (grip ? .16 : .10)
    const d = Math.max(0, short - pivot)
    const curvature = MathUtils.lerp(((grip ? 1.65 : 1.0) + .12 * Math.sin(z * 15)) / (length * .49), grip ? 5 : 2.8, thumb)
    const angle = d * curvature
    const thickness = point.y - wrist.y
    const along = d ? pivot + Math.sin(angle) / curvature + thickness * Math.sin(angle) : short
    const down = d ? -(1 - Math.cos(angle)) / curvature + thickness * (Math.cos(angle) - 1) : 0
    point.x = MathUtils.lerp(point.x, wrist.x + sign * along, glove)
    point.y += down * glove
    // Preserve the original finger gaps; a tiny spread at the tips avoids a fan.
    point.z += ((z - .03) * .010 * MathUtils.smoothstep(u, .65, 1) - .007 * thumb) * glove
    if (grip) point.z = MathUtils.lerp(point.z, wrist.z + (point.z - wrist.z) * .82, glove)
    return point
  }

  for (let i = 0; i < p.count; i++) {
    for (const hand of sides) {
      let weight = 0
      for (let k = 0; k < 4; k++) if (joints.array[i * 4 + k] === hand.joint) weight += weights.array[i * 4 + k]
      const amount = MathUtils.smoothstep(weight, .55, .98)
      if (!amount) continue
      a.fromBufferAttribute(p, i); b.copy(a); deform(b, hand, amount)
      if (a.distanceToSquared(b) < 1e-14) continue
      affected.push(i); hand.count++
      for (let pose = 0; pose < 2; pose++) {
        const grip = pose === 1
        deform(b.copy(a), hand, amount, grip).sub(a).toArray(deltas[pose], i * 3)
        // Transform the original smooth normal with the local bend's Jacobian.
        normal.fromBufferAttribute(n, i)
        tangent.set(Math.abs(normal.y) < .9 ? 0 : 1, Math.abs(normal.y) < .9 ? 1 : 0, 0).cross(normal).normalize()
        bitangent.crossVectors(normal, tangent)
        const base = deform(a.clone(), hand, amount, grip)
        tangent.copy(deform(a.clone().addScaledVector(tangent, .00001), hand, amount, grip)).sub(base)
        bitangent.copy(deform(a.clone().addScaledVector(bitangent, .00001), hand, amount, grip)).sub(base)
        b.crossVectors(tangent, bitangent).normalize().sub(normal).toArray(normalDeltas[pose], i * 3)
      }
      // Release only the right glove while aiming. Built during loading so
      // the encounter needs no geometry upload or new shader on its first shot.
      if(hand.sign<0)for(let k=0;k<3;k++){
        deltas[2][i*3+k]=-deltas[1][i*3+k]
        normalDeltas[2][i*3+k]=-normalDeltas[1][i*3+k]
      }
    }
  }
  if (!affected.length) return null
  const geometry = source.clone()
  // All original topology, UVs, weights and bind positions remain shared/read-only.
  for (const [key, attribute] of Object.entries(source.attributes)) geometry.setAttribute(key, attribute)
  geometry.setIndex(source.index)
  geometry.name = source.name + '_relaxed_hands_variant'
  geometry.morphTargetsRelative = true
  geometry.morphAttributes.position = deltas.map((delta, i) => { const attribute = new Float32BufferAttribute(delta, 3); attribute.name = ['RelaxedHands', 'HandlebarGrip', 'RightAimingHand'][i]; return attribute })
  geometry.morphAttributes.normal = normalDeltas.map(delta => new Float32BufferAttribute(delta, 3))
  const variant = { source, geometry, affected, sides, influence: 0,
    attach() { mesh.geometry = geometry; mesh.updateMorphTargets(); this.influence = 0 },
    update(mode, dt, contactBlend = 0) {
      const target = mode === 'onFoot' || mode === 'approaching' ? 1 : 0
      this.influence = target ? MathUtils.damp(this.influence, 1, 14, dt) : 0
      mesh.morphTargetInfluences[0] = this.influence
      mesh.morphTargetInfluences[1] = mode === 'mounted' || mode === 'stopping' ? 1 : contactBlend
      mesh.morphTargetInfluences[2] = 0
    },
    dispose() { mesh.geometry = source; mesh.updateMorphTargets(); geometry.dispose() },
  }
  variant.attach()
  return variant
}
