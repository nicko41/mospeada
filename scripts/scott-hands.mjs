import { CapsuleGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Only the glove geometry is replaced. The authored wrist bones, cuff and all
// other character surfaces remain; new phalanges are children of those wrists.
export function buildArticulatedHands(doc, bindWorld) {
  const joints = doc.skins[0].joints, inverse = [], hands = [], positions = [], normals = [], weights = [], indices = [], skinIndices = []
  const matrixOf = (p, q) => new Matrix4().compose(p, q, new Vector3(0.01, 0.01, 0.01))
  function bone(name, parent, world, extra) {
    const local = bindWorld.get(parent).clone().invert().multiply(world), p = new Vector3(), q = new Quaternion(), scale = new Vector3()
    local.decompose(p, q, scale)
    const node = doc.nodes.length
    doc.nodes.push({ name, translation: p.toArray(), rotation: q.toArray(), scale: scale.toArray(), extras: { articulatedFinger: true, ...extra } })
    ;(doc.nodes[parent].children ||= []).push(node)
    const joint = joints.length; joints.push(node); bindWorld.set(node, world)
    inverse.push(world.clone().invert().toArray())
    return { node, joint }
  }
  function geometry(g, transform, joint) {
    const offset = positions.length / 3, p = new Vector3(), n = new Vector3(), rotation = new Quaternion().setFromRotationMatrix(transform)
    for (let i = 0; i < g.attributes.position.count; i++) {
      p.fromBufferAttribute(g.attributes.position, i).applyMatrix4(transform); positions.push(...p)
      n.fromBufferAttribute(g.attributes.normal, i).applyQuaternion(rotation).normalize(); normals.push(...n)
      skinIndices.push(joint, 0, 0, 0); weights.push(1, 0, 0, 0)
    }
    if (g.index) for (const i of g.index.array) indices.push(offset + i)
    else for (let i = 0; i < g.attributes.position.count; i++) indices.push(offset + i)
    g.dispose()
  }
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const wristNode = joints.find(n => doc.nodes[n].name.endsWith(side + 'Hand')), wristJoint = joints.indexOf(wristNode)
    const wrist = new Vector3().setFromMatrixPosition(bindWorld.get(wristNode)), distal = new Vector3(sign, -0.025, 0).normalize()
    const width = new Vector3(0, 0, 1), up = new Vector3(0, 1, 0)
    const palmRotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(sign, 0, 0), up, new Vector3(0, 0, sign)))
    const palmCentre = wrist.clone().addScaledVector(distal, 0.029)
    const palm = new RoundedBoxGeometry(0.084, 0.035, 0.084, 4, 0.012)
    for (let i = 0; i < palm.attributes.position.count; i++) {
      const x = palm.attributes.position.getX(i), t = (x + 0.042) / 0.084
      palm.attributes.position.setZ(i, palm.attributes.position.getZ(i) * (0.72 + 0.30 * Math.sin(t * Math.PI * 0.7)))
    }
    palm.computeVertexNormals()
    geometry(palm, new Matrix4().compose(palmCentre, palmRotation, new Vector3(1, 1, 1)), wristJoint)
    const cuffRotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), distal)
    geometry(new CapsuleGeometry(0.022, 0.025, 4, 12), new Matrix4().compose(wrist.clone().addScaledVector(distal, -0.005), cuffRotation, new Vector3(1, 1, 1)), wristJoint)
    const fingers = []
    for (const [name, lateral, total, radius, spread] of [
      ['Index', 0.029, 0.075, 0.0092, 0.035], ['Middle', 0.009, 0.083, 0.0098, 0],
      ['Ring', -0.012, 0.077, 0.0091, -0.025], ['Pinky', -0.031, 0.061, 0.0080, -0.085],
      ['Thumb', 0.044, 0.077, 0.011, 0],
    ]) {
      let point = wrist.clone().addScaledVector(distal, name === 'Thumb' ? 0.012 : 0.065).addScaledVector(width, lateral)
      const direction = name === 'Thumb' ? distal.clone().multiplyScalar(0.65).addScaledVector(width, 0.76).normalize() : distal.clone().addScaledVector(width, spread).normalize()
      const curlAxis = direction.clone().cross(up.clone().negate()).normalize(), palmward = curlAxis.clone().cross(direction).normalize()
      let rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(curlAxis, direction, palmward)), parent = wristNode
      const segments = []
      for (let segment = 0; segment < 3; segment++) {
        const length = total * [0.43, 0.33, 0.24][segment]
        rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), [0.07, 0.10, 0.08][segment]))
        const world = matrixOf(point, rotation), entry = bone(`mixamorig:${side}Hand${name}${segment + 1}`, parent, world, { side, digit: name, segment: segment + 1 })
        const r = radius * (1 - segment * 0.12)
        // Overlapping round knuckles keep flexed fingers closed at their joints.
        const g = new CapsuleGeometry(r, Math.max(0.004, length - r * 1.2), 4, 10)
        const centre = point.clone().add(new Vector3(0, length * 0.5, 0).applyQuaternion(rotation))
        geometry(g, new Matrix4().compose(centre, rotation, new Vector3(1, 1, 1)), entry.joint)
        segments.push({ ...entry, name: doc.nodes[entry.node].name, length })
        point.add(new Vector3(0, length, 0).applyQuaternion(rotation)); parent = entry.node
      }
      fingers.push({ digit: name, segments, tip: point.toArray() })
    }
    hands.push({ side, wristNode, wristJoint, fingers })
  }
  return { positions, normals, weights, indices, skinIndices, inverse, hands }
}
