import { Quaternion, Vector3 } from 'three'

// Meshy's ankle-to-toe bone points down through the boot in its bind pose.
// Use the original, already-flat boot geometry instead of flattening that bone.
export function readFootSupport(source, side, runtimeScale) {
  source.updateWorldMatrix(true, true)
  const candidates = []
  source.traverse(node => { if (node.isSkinnedMesh) candidates.push(node) })
  const score = mesh => {
    const owned = new Set(mesh.skeleton.bones.map((b, i) => b.name.endsWith(side + 'Foot') || b.name.endsWith(side + 'ToeBase') ? i : -1).filter(i => i >= 0))
    let count = 0
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight
    for (let i = 0; i < indices.count; i++) for (let j = 0; j < 4; j++) if (owned.has(indices.getComponent(i, j)) && weights.getComponent(i, j) > 0.65) count++
    return count
  }
  const skin = candidates.sort((a, b) => score(b) - score(a))[0]
  skin.skeleton.update()
  const bones = skin.skeleton.bones
  const foot = bones.find(b => b.name.endsWith(side + 'Foot'))
  const toe = bones.find(b => b.name.endsWith(side + 'ToeBase'))
  const owned = new Set([bones.indexOf(foot), bones.indexOf(toe)])
  const indices = skin.geometry.attributes.skinIndex, weights = skin.geometry.attributes.skinWeight
  const orientation = foot.getWorldQuaternion(new Quaternion()), points = []
  let minimum = Infinity, soleY = Infinity
  for (let i = 0; i < indices.count; i++) {
    let weight = 0
    for (let j = 0; j < 4; j++) if (owned.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j)
    if (weight < 0.65) continue
    const world = skin.localToWorld(skin.getVertexPosition(i, new Vector3()))
    minimum = Math.min(minimum, world.y)
    const local = foot.worldToLocal(world.clone()).multiply(runtimeScale).applyQuaternion(orientation)
    soleY = Math.min(soleY, local.y)
    points.push({ index: i, y: world.y, weight })
  }
  return {
    skin,
    stanceOrientation: orientation,
    toeRestOrientation: toe.quaternion.clone(),
    soleNormal: new Vector3(0, 1, 0).applyQuaternion(orientation.clone().invert()),
    soleIndices: points.filter(p => p.y < minimum + 0.008).map(p => p.index),
    soleContactIndices: points.filter(p => p.y < minimum + 0.008 && p.weight > 0.98).map(p => p.index),
    soleOffset: -soleY + 0.004,
  }
}

export function groundFootOrientation(root, point, sample, reference) {
  const h = 0.12
  const dx = (sample(point.x + h, point.z) - sample(point.x - h, point.z)) / (2 * h)
  const dz = (sample(point.x, point.z + h) - sample(point.x, point.z - h)) / (2 * h)
  const normal = new Vector3(Number.isFinite(dx) ? -dx : 0, 1, Number.isFinite(dz) ? -dz : 0).normalize()
  const orientation = root.getWorldQuaternion(new Quaternion()).multiply(reference)
  orientation.premultiply(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal))
  return { normal, orientation }
}
