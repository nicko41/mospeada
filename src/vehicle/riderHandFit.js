import { Box3, Euler, Quaternion, Vector3 } from 'three'
import { ConvexHull } from 'three/addons/math/ConvexHull.js'

// Fit the visible glove, not just its wrist bone, inside the fixed hand fairing.
export function fitRiderHands(body, rider, bones, surfaces, restFrames) {
  const skins = []
  rider.traverse(node => { if (node.isSkinnedMesh) { skins.push(node); node.skeleton.update() } })
  return ['Left', 'Right'].map(side => {
    const hand = bones.get(side + 'Hand')
    const owns = bone => { for (let b = bone; b; b = b.parent) if (b === hand) return true; return false }
    const skin = skins.find(s => s.userData.articulatedHands) || skins[0], index = skin.skeleton.bones.indexOf(hand)
    const sign = side === 'Left' ? 1 : -1
    const scale = hand.getWorldScale(new Vector3())
    const original = body.getWorldQuaternion(new Quaternion()).invert().multiply(hand.getWorldQuaternion(new Quaternion()))
    const points = [], coverPoints = []
    for (const part of skins) {
      const owned = new Set(part.skeleton.bones.map((b, i) => owns(b) ? i : -1).filter(i => i >= 0))
      const indices = part.geometry.attributes.skinIndex, weights = part.geometry.attributes.skinWeight
      for (let i = 0; i < indices.count; i++) {
      let weight = 0
      for (let j = 0; j < 4; j++) if (owned.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j)
      if (weight >= 0.7) points.push(hand.worldToLocal(part.localToWorld(part.getVertexPosition(i, new Vector3()))))
      }
    }
    for (const mesh of surfaces) {
      if (!/^(tapa-up|tapa-bottom)/.test(mesh.userData.sourcePiece)) continue
      const bounds = new Box3().setFromObject(mesh)
      if (Math.sign(bounds.getCenter(new Vector3()).x) !== sign) continue
      const positions = mesh.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) coverPoints.push(body.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(positions, i))))
    }
    const enclosure = new Box3().setFromPoints(coverPoints)
    const hull = new ConvexHull().setFromPoints(coverPoints)
    const planes = hull.faces.map(face => ({ normal: face.normal.clone(), constant: face.constant - 0.005 }))
    const gloveHull = new ConvexHull().setFromPoints(points), reduced = new Set()
    for (const face of gloveHull.faces) {
      let edge = face.edge
      do { reduced.add(edge.head().point); edge = edge.next } while (edge !== face.edge)
    }
    const center = enclosure.getCenter(new Vector3()); let fit
    const articulated = skin.userData.articulatedHands && restFrames?.has(side + 'Hand')
    const grip = surfaces.find(m => m.userData.sourcePiece === (side === 'Left' ? 'Left_Ribbed_Grip' : 'Right_Twist_Throttle'))
    const gripCenter = articulated && grip ? body.worldToLocal(new Box3().setFromObject(grip).getCenter(new Vector3())) : null
    const gripTarget = gripCenter?.clone().add(new Vector3(0, 0.025, -0.080).multiplyScalar(scale.x / 0.01))
    const candidates = []
    if (gripTarget) for (const pitch of [-0.05, 0, 0.05]) {
      const rotation = new Quaternion().setFromEuler(new Euler(pitch, -sign * Math.PI / 2, 0)).multiply(restFrames.get(side + 'Hand').orientation)
      candidates.push({ rotation, pitch })
    }
    else for (let pitch = 0.15; pitch <= 0.91; pitch += 0.1) for (let turn = 0; turn < 32; turn++) {
      const rotation = new Quaternion().setFromEuler(new Euler(Math.PI / 2 + pitch, 0, 0))
      rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, -Math.sin(pitch), Math.cos(pitch)), turn * Math.PI / 16))
      candidates.push({ rotation, pitch })
    }
    // The boxes slope down toward the front. A world-axis bounding box alone
    // allowed the fingertips to poke through that sloped roof.
    for (const { rotation, pitch } of candidates) {
      const transformed = [...reduced].map(point => point.clone().multiply(scale).applyQuaternion(rotation))
      const limits = planes.map(plane => plane.constant - Math.max(...transformed.map(point => plane.normal.dot(point))))
      const bounds = new Box3().setFromPoints(transformed), translation = gripTarget?.clone() || center.clone().sub(bounds.getCenter(new Vector3()))
      for (let iteration = 0; iteration < 65; iteration++) for (let i = 0; i < planes.length; i++) {
        const violation = planes[i].normal.dot(translation) - limits[i]
        if (violation > 0) translation.addScaledVector(planes[i].normal, -violation)
      }
      const violation = Math.max(0, ...planes.map((plane, i) => plane.normal.dot(translation) - limits[i]))
      const score = gripTarget ? violation * 1000 + translation.distanceTo(gripTarget) * 10 + Math.abs(pitch) * 0.001 : violation * 1000 + rotation.angleTo(original) * 0.001 + bounds.getCenter(new Vector3()).add(translation).distanceTo(center) * 0.1
      if (!fit || score < fit.score) fit = { rotation, translation, violation, score }
    }
    return { enclosure, enclosurePlanes: planes, orientation: fit.rotation, target: fit.translation, fitError: fit.violation, skin, skins, boneIndex: index, gripCenter, gripTarget }
  })
}
