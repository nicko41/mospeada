import { Matrix4, Quaternion, Vector3 } from 'three'

export function readGlbDocument(bytes) {
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim())
}

// Transfer rotations through world space; retain the new skeleton's joint offsets.
// Copying the saved local transforms directly would change limb lengths and bind axes.
export function retargetRidingPose(reference, replacement, saved) {
  const canonical = name => name.replace(/^mixamorig[:_]?/, '')
  function hierarchy(doc, pose) {
    const joints = new Set(doc.skins.flatMap(skin => skin.joints)), result = new Map()
    const byKey = new Map(pose?.pose.bones.map(bone => [bone.key, bone]) || [])
    function visit(index, key, parent) {
      const node = doc.nodes[index], data = byKey.get(key) || node
      const local = node.matrix && !byKey.has(key) ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
        new Vector3().fromArray(data.position || data.translation || [0, 0, 0]),
        new Quaternion().fromArray(data.quaternion || data.rotation || [0, 0, 0, 1]),
        new Vector3().fromArray(data.scale || [1, 1, 1]),
      )
      const world = parent.clone().multiply(local)
      if (joints.has(index)) result.set(canonical(node.name), { key, node, world })
      node.children?.forEach((child, i) => visit(child, `${key}/${i}`, world))
    }
    doc.scenes[doc.scene || 0].nodes.forEach((index, i) => visit(index, `scene/${i}`, new Matrix4()))
    return result
  }
  const originalRest = hierarchy(reference), originalPose = hierarchy(reference, saved)
  const newRest = hierarchy(replacement), rotations = new Map()
  const rotationOf = matrix => {
    const q = new Quaternion()
    matrix.decompose(new Vector3(), q, new Vector3())
    return q
  }
  for (const [name, bone] of newRest) {
    if (/Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(name) && !originalRest.has(name)) continue
    if (!originalRest.has(name) || !originalPose.has(name)) throw Error('Hueso sin pose de conducción: ' + name)
    rotations.set(name, rotationOf(originalPose.get(name).world)
      .multiply(rotationOf(originalRest.get(name).world).invert()).multiply(rotationOf(bone.world)))
  }
  const joints = new Set(replacement.skins.flatMap(skin => skin.joints)), bones = []
  const oldPoseByKey = new Map(saved.pose.bones.map(bone => [bone.key, bone]))
  function visit(index, key, parentRotation) {
    const node = replacement.nodes[index], name = canonical(node.name || '')
    let local = new Quaternion().fromArray(node.rotation || [0, 0, 0, 1])
    if (joints.has(index)) {
      if (rotations.has(name)) local = parentRotation.clone().invert().multiply(rotations.get(name)).normalize()
      const position = name === 'Hips' ? oldPoseByKey.get(originalPose.get(name).key).position : node.translation || [0, 0, 0]
      bones.push({ key, name, position: [...position], quaternion: local.toArray(), scale: [...(node.scale || [1, 1, 1])] })
    }
    const world = parentRotation.clone().multiply(local)
    node.children?.forEach((child, i) => visit(child, `${key}/${i}`, world))
  }
  replacement.scenes[replacement.scene || 0].nodes.forEach((index, i) => visit(index, `scene/${i}`, new Quaternion()))
  return { ...saved, name: 'scott-bernard-gear', source: '/models/mospeada/scott-bernard-gear.glb',
    pose: { ...saved.pose, rig: 'scott-bernard-gear', bones } }
}
