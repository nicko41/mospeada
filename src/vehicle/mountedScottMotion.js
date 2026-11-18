import * as T from 'three'
import { readFootSupport, groundFootOrientation } from './riderFootSupport.js'
import { reverseFootTarget } from './riderMotion.js'

const point = b => b.getWorldPosition(new T.Vector3())
const rotation = b => b.getWorldQuaternion(new T.Quaternion())
const smooth = t => { t = T.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t) }
function frame(axis, normal) {
  const y = axis.clone().normalize(), x = normal.clone().addScaledVector(y, -normal.dot(y)).normalize(), z = x.clone().cross(y).normalize()
  x.copy(y).cross(z)
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z))
}

// Mounted movement on the original skeleton only. These layers never run in
// the Roll_Dodge_4 crossing, or over original walking/running/crouching clips.
export class MountedScottMotion {
  constructor(instance, wrapper, rig, grips) {
    Object.assign(this, { instance, wrapper, rig, body: rig.body, root: rig.root, modified: false, activation: 0 })
    this.bones = new Map([...instance.bones].map(([name, b]) => [name.replace(/^mixamorig[:_]?/, ''), b]))
    this.originals = [...this.bones.values()].map(b => ({ b, q: b.quaternion.clone(), p: b.position.clone() }))
    this.limbs = []; this.diagnostics = {}
    wrapper.updateMatrixWorld(true)
    const bodyQInverse = rotation(this.body).invert()
    for (const side of ['Left', 'Right']) for (const leg of [false, true]) {
      const a = this.bones.get(side + (leg ? 'UpLeg' : 'Arm')), b = this.bones.get(side + (leg ? 'Leg' : 'ForeArm')), c = this.bones.get(side + (leg ? 'Foot' : 'Hand'))
      const A = point(a), B = point(b), C = point(c), normal = B.clone().sub(A).cross(C.clone().sub(B)).normalize()
      const limb = { side, leg, a, b, c, l1: A.distanceTo(B), l2: B.distanceTo(C), upper: frame(B.clone().sub(A), normal).invert().multiply(rotation(a)), lower: frame(C.clone().sub(B), normal).invert().multiply(rotation(b)), pole: this.body.worldToLocal(B.clone()), target: this.body.worldToLocal(C.clone()), orientation: bodyQInverse.clone().multiply(rotation(c)) }
      if (leg) {
        const support = readFootSupport(instance.sourceScene, side, c.getWorldScale(new T.Vector3()))
        const skin = instance.skins[0].mesh, ids = support.soleContactIndices.length ? support.soleContactIndices : support.soleIndices
        const soleWorld = ids.reduce((p, i) => p.add(skin.localToWorld(skin.getVertexPosition(i, new T.Vector3()))), new T.Vector3()).divideScalar(ids.length)
        limb.soleOffset = soleWorld.clone().sub(C).applyQuaternion(bodyQInverse)
        limb.sole = this.body.worldToLocal(soleWorld.clone())
        const stripPoints = []
        for (const mesh of rig.surfaces.filter(m => /caballero-right/.test(m.userData.sourcePiece))) {
          const vertices = mesh.geometry.attributes.position, local = []
          for (let i = 0; i < vertices.count; i++) local.push(this.body.worldToLocal(mesh.localToWorld(new T.Vector3().fromBufferAttribute(vertices, i))))
          const box = new T.Box3().setFromPoints(local)
          if (Math.sign(box.getCenter(new T.Vector3()).x) === (side === 'Left' ? 1 : -1)) stripPoints.push(...local)
        }
        if (!stripPoints.length) throw Error('No se encontró la pieza rayada junto al apoyo de ' + side)
        limb.stripBottom = new T.Box3().setFromPoints(stripPoints).min.y
        limb.sole.y = limb.stripBottom - .012
        limb.target.copy(limb.sole).sub(limb.soleOffset)
        limb.toe = this.bones.get(side + 'ToeBase'); limb.toeQ = limb.toe.quaternion.clone(); limb.soleIds = ids
      } else if (grips && instance.hands?.length) {
        // Place the compact palm on the measured grip, rather than placing the
        // wrist there and letting the oversized source fingers overshoot it.
        const hand = instance.hands[0], shape = hand.sides.find(h => h.sign === (side === 'Left' ? 1 : -1))
        const mesh = instance.skins[0].mesh, positions = mesh.geometry.attributes.position
        const saved = mesh.morphTargetInfluences.slice()
        mesh.morphTargetInfluences[0] = 0; mesh.morphTargetInfluences[1] = 1
        const palm = new T.Vector3(); let count = 0
        for (const i of hand.affected) {
          const u = shape.sign * (positions.getX(i) - shape.wrist.x) / shape.length
          const z = (positions.getZ(i) - shape.wrist.z) / shape.length
          if (u > .48 && u < .65 && z > -.1 && z < .22) {
            palm.add(this.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, new T.Vector3())))); count++
          }
        }
        if (count) {
          palm.divideScalar(count)
          const shift = new T.Vector3().fromArray(grips[side]).sub(palm)
          limb.palmIds = hand.affected.filter(i => {
            const u = shape.sign * (positions.getX(i) - shape.wrist.x) / shape.length
            return u > .36 && u < 1.01
          })
          const bounds = rig.surfaces.filter(m => /^tapa-up/.test(m.userData.sourcePiece)).map(cover => {
            const cp = cover.geometry.attributes.position, box = new T.Box3()
            for (let i = 0; i < cp.count; i++) box.expandByPoint(this.body.worldToLocal(cover.localToWorld(new T.Vector3().fromBufferAttribute(cp, i))))
            return box
          }).find(box => Math.sign(box.getCenter(new T.Vector3()).x) === shape.sign)
          if (bounds) {
            const silhouette = new T.Box3()
            for (const i of limb.palmIds) silhouette.expandByPoint(this.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, new T.Vector3()))).add(shift))
            // Centre the glove within the actual cover's lateral clearance.
            // The wrist/arm are solved with the existing two-bone controller.
            shift.x += bounds.getCenter(new T.Vector3()).x - silhouette.getCenter(new T.Vector3()).x
          }
          limb.target.add(shift)
        }
        mesh.morphTargetInfluences.splice(0, saved.length, ...saved)
      }
      this.limbs.push(limb)
    }
    this.hips = this.bones.get('Hips')
  }
  restore() {
    if (!this.modified) return
    for (const { b, q, p } of this.originals) { b.quaternion.copy(q); b.position.copy(p) }
    this.modified = false
  }
  capture() {
    for (const original of this.originals) { original.q.copy(original.b.quaternion); original.p.copy(original.b.position) }
    this.modified = true
  }
  worldRotation(bone, q) { bone.quaternion.copy(rotation(bone.parent).invert().multiply(q)); this.wrapper.updateMatrixWorld(true) }
  solve(limb, target, pole, orientation) {
    const A = point(limb.a), direction = target.clone().sub(A), requested = direction.length()
    const distance = T.MathUtils.clamp(requested, Math.abs(limb.l1 - limb.l2) + .003, limb.l1 + limb.l2 - .006)
    direction.normalize()
    const bend = pole.clone().sub(A); bend.addScaledVector(direction, -bend.dot(direction)).normalize()
    const along = (distance * distance + limb.l1 * limb.l1 - limb.l2 * limb.l2) / (2 * distance)
    const knee = A.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, limb.l1 * limb.l1 - along * along)))
    const end = A.clone().addScaledVector(direction, distance), normal = knee.clone().sub(A).cross(end.clone().sub(knee)).normalize()
    this.worldRotation(limb.a, frame(knee.clone().sub(A), normal).multiply(limb.upper))
    this.worldRotation(limb.b, frame(end.clone().sub(knee), normal).multiply(limb.lower))
    this.worldRotation(limb.c, orientation)
    return point(limb.c).distanceTo(target)
  }
  applyFeetBlend(weight) {
    if (weight <= 0) return
    this.capture()
    const bodyQ = rotation(this.body)
    for (const limb of this.limbs.filter(l => l.leg || l.palmIds)) {
      const chain = [limb.a, limb.b, limb.c, ...(limb.toe ? [limb.toe] : [])]
      const saved = chain.map(b => b.quaternion.clone())
      this.solve(limb, this.body.localToWorld(limb.target.clone()), this.body.localToWorld(limb.pole.clone()), bodyQ.clone().multiply(limb.orientation))
      if (limb.toe) limb.toe.quaternion.copy(limb.toeQ)
      chain.forEach((b, i) => { const solved = b.quaternion.clone(); b.quaternion.copy(saved[i]).slerp(solved, weight) })
    }
    this.wrapper.updateMatrixWorld(true)
    this.activation = 0
  }
  apply(s, sample, c, dt) {
    this.capture()
    this.activation = T.MathUtils.damp(this.activation, 1, 14, dt)
    const boost = s.boostBlend || 0, brake = s.brakeBlend || 0, stand = s.riderStand || 0, reverse = s.reverseBlend || 0, impact = Math.max(s.frontImpact || 0, s.rearImpact || 0)
    const hip = this.body.worldToLocal(point(this.hips)), originalHip = hip.clone()
    const forward = c.riderStandForward * stand + boost * c.boostRiderForward - (s.boostKick || 0) * c.boostRiderRecoil - (s.wheelieAngle || 0) * .025
    hip.z += forward
    let allowedStand = c.riderStandHeight * stand
    for (const limb of this.limbs.filter(l => l.leg)) {
      const origin = this.body.worldToLocal(point(limb.a)); origin.z += forward
      const target = limb.target, reach = limb.l1 + limb.l2 - .015
      const vertical = Math.sqrt(Math.max(0, reach * reach - (origin.x - target.x) ** 2 - (origin.z - target.z) ** 2))
      allowedStand = Math.min(allowedStand, Math.max(0, target.y + vertical - origin.y))
    }
    hip.y += allowedStand - boost * c.boostRiderCrouch - impact * .025 - reverse * .025
    this.hips.position.copy(this.hips.parent.worldToLocal(this.body.localToWorld(hip))); this.wrapper.updateMatrixWorld(true)
    let flex = boost * c.boostRiderLean + brake * c.brakeRiderLean + impact * .06 + stand * c.riderStandTorsoLean
    const axis = new T.Vector3(1, 0, 0).applyQuaternion(rotation(this.body))
    const spineNames = ['Spine', 'Spine1', 'Spine2'], spineBase = spineNames.map(n => this.bones.get(n).quaternion.clone())
    const applyFlex = angle => {
      spineNames.forEach((n, i) => this.bones.get(n).quaternion.copy(spineBase[i])); this.wrapper.updateMatrixWorld(true)
      for (const name of spineNames) this.worldRotation(this.bones.get(name), rotation(this.bones.get(name)).premultiply(new T.Quaternion().setFromAxisAngle(axis, angle / 3)))
    }
    const handsReach = () => this.limbs.filter(l => !l.leg).every(l => point(l.a).distanceTo(this.body.localToWorld(l.target.clone())) < l.l1 + l.l2 - .015)
    applyFlex(flex)
    if (stand > .01 && !handsReach()) {
      let low = flex, high = flex + (this.instance.hands?.length ? .65 : .3) * stand
      applyFlex(high)
      if (handsReach()) for (let i = 0; i < 9; i++) { const middle = (low + high) / 2; applyFlex(middle); if (handsReach()) high = middle; else low = middle }
      flex = high; applyFlex(flex)
    }
    // Keep the authored neck/head relationship to the moving torso. Locking
    // the head to the bike cancelled all spine flexion at the cervical joints.
    const wheelie = Math.max(0, s.wheelieAngle || 0)
    const lookUp = Math.min(Math.max(flex, 0), .18)
    const lookDown = Math.min(wheelie * .85, .70)
    const cervicalPitch = lookDown - lookUp
    const neck = this.bones.get('Neck'), head = this.bones.get('Head')
    const neckBase = neck.quaternion.clone(), headBase = head.quaternion.clone()
    this.worldRotation(neck, rotation(neck).premultiply(new T.Quaternion().setFromAxisAngle(axis, cervicalPitch * .4)))
    const headQ = rotation(head).premultiply(new T.Quaternion().setFromAxisAngle(axis, cervicalPitch * .6))
    headQ.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.sin((s.idleTime || 0) * c.idleHeadSpeed) * c.idleHeadAngle * (s.idleBlend || 0)))
    this.worldRotation(head, headQ)
    const headPose = { cervicalPitch, lookUp, lookDown, neckChange: neck.quaternion.angleTo(neckBase), headChange: head.quaternion.angleTo(headBase) }
    const bodyQ = rotation(this.body), yawRoot = this.root
    let handError = 0, footError = 0
    const feet = {}
    for (const limb of this.limbs) {
      let target = this.body.localToWorld(limb.target.clone()), orientation = bodyQ.clone().multiply(limb.orientation)
      const pole = this.body.localToWorld(limb.pole.clone())
      if (limb.leg) {
        const toeDown = .25 * smooth(wheelie / c.wheelieAngle)
        if (toeDown > 0) {
          orientation.premultiply(new T.Quaternion().setFromAxisAngle(axis, toeDown))
          const offset = limb.soleOffset.clone().applyQuaternion(bodyQ).applyAxisAngle(axis, toeDown)
          target.copy(this.body.localToWorld(limb.sole.clone())).sub(offset)
        }
        const sign = limb.side === 'Left' ? 1 : -1
        const idle = !s.airborne && stand < .05 && reverse < .05 && (s.wheelieAngle || 0) < .02 ? Math.max(s.idleBlend || 0, brake * (1 - Math.min(1, Math.abs(s.speed) / 3))) * this.activation : 0
        const dab = (limb.side === 'Left' ? s.riderDabLeft : s.riderDabRight) || 0
        let groundBlend = limb.side === 'Left' ? idle : 0
        let sole = yawRoot.localToWorld(new T.Vector3(sign * c.idleFootOffset, 0, limb.sole.z))
        if (dab > .001) { sole = yawRoot.localToWorld(new T.Vector3(sign * c.riderDabOffset, 0, c.riderDabForward)); groundBlend = Math.max(groundBlend, dab) }
        let lift = 0
        if (reverse > .001) { const step = reverseFootTarget(s, limb.side, c); sole.set(step.x, 0, step.z); lift = step.lift; groundBlend = reverse }
        const groundHeight = groundBlend > .001 ? sample(sole.x, sole.z) : NaN
        if (groundBlend > .001 && Number.isFinite(groundHeight)) {
          const support = groundFootOrientation(yawRoot, sole, sample, limb.orientation)
          sole.y = groundHeight + .004 + lift
          const offset = limb.soleOffset.clone().applyQuaternion(limb.orientation.clone().invert()).applyQuaternion(support.orientation)
          const ankle = sole.sub(offset), A = point(limb.a), reach = limb.l1 + limb.l2 - .012, vertical = ankle.y - A.y, available = Math.sqrt(Math.max(0, reach * reach - vertical * vertical)), horizontal = Math.hypot(ankle.x - A.x, ankle.z - A.z)
          if (horizontal > available && horizontal > 0) { ankle.x = A.x + (ankle.x - A.x) * available / horizontal; ankle.z = A.z + (ankle.z - A.z) * available / horizontal }
          target.lerp(ankle, groundBlend); orientation.slerp(support.orientation, groundBlend)
        } else groundBlend = 0
        // More forward knee space while standing; the feet remain on their pegs.
        pole.lerp(this.body.localToWorld(new T.Vector3(sign * Math.abs(limb.target.x), originalHip.y - .1, limb.target.z + .5)), stand)
        limb.toe.quaternion.copy(limb.toeQ)
        footError = Math.max(footError, this.solve(limb, target, pole, orientation))
        const soleWorld = this.instance.skins[0].mesh
        const contact = limb.soleIds.reduce((p, i) => p.add(soleWorld.localToWorld(soleWorld.getVertexPosition(i, new T.Vector3()))), new T.Vector3()).divideScalar(limb.soleIds.length)
        feet[limb.side] = { ankle: point(limb.c).toArray(), sole: this.body.worldToLocal(contact.clone()).toArray(), worldSole: contact.toArray(), target: target.toArray(), stripBottom: limb.stripBottom, groundBlend, toeDown }
      } else handError = Math.max(handError, this.solve(limb, target, pole, orientation))
    }
    this.diagnostics = { stand, standHeight: allowedStand, torsoFlex: flex, boost, brake, impact, handError, footError, head: headPose, feet, hip: this.body.worldToLocal(point(this.hips)).toArray() }
  }
}

export function riderFootTransition(mode, time, data) {
  const start = data.phases.seated, duration = data.duration
  if (mode === 'mounting') return smooth((time - start) / (duration - start))
  if (mode === 'dismounting') return 1 - smooth(time / (duration - start))
  return 0
}
