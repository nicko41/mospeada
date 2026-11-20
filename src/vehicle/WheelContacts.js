import { Matrix4, Vector3 } from 'three'

// Same triangle sampler/material tags as the suspension. Wheel profiles are
// measured once from the rendered tires; axle transforms include actual travel,
// lean and steering. No raycast through arbitrary scene decoration or colours.
export class WheelContacts {
  constructor(rig, sample) {
    this.rig = rig; this.sample = sample
    this.center = new Vector3(); this.axis = new Vector3(); this.radial = new Vector3(); this.p = new Vector3()
    this.wheels = {}
    for (const side of ['front', 'rear']) {
      const axle = rig[side + 'Axle'], prefix = side === 'front' ? 'Front' : 'Rear'
      const tire = rig.surfaces.find(m => m.userData.sourcePiece === prefix + '_Tire_Rubber')
      const profile = new Map(), positions = tire.geometry.attributes.position
      axle.updateWorldMatrix(true,false);tire.updateWorldMatrix(true,false)
      const toAxle = new Matrix4().copy(axle.matrixWorld).invert().multiply(tire.matrixWorld)
      for (let i = 0; i < positions.count; i++) {
        this.p.fromBufferAttribute(positions, i).applyMatrix4(toAxle)
        const x = this.p.x, radius = Math.hypot(this.p.y, this.p.z)
        profile.set(`${x.toFixed(4)},${radius.toFixed(4)}`, [x, radius])
      }
      this.wheels[side] = { axle, profile: [...profile.values()], radius: rig.metrics[side + 'Radius'], position: new Vector3(), forward: new Vector3(), normal: new Vector3(0, 1, 0), surface: null, grounded: false, gap: 0 }
    }
  }
  update(state) {
    for (const side of ['front', 'rear']) {
      const w = this.wheels[side], grade = (state.frontGround - state.rearGround) / this.rig.metrics.wheelbase || 0, bank = Math.tan(state.bank || 0)
      w.normal.set(-Math.sin(state.yaw) * grade - Math.cos(state.yaw) * bank, 1, -Math.cos(state.yaw) * grade + Math.sin(state.yaw) * bank).normalize()
      w.axle.getWorldPosition(this.center); this.axis.set(1, 0, 0).transformDirection(w.axle.matrixWorld)
      w.forward.set(0, 0, 1).transformDirection(w.axle.matrixWorld).addScaledVector(w.normal, -w.forward.dot(w.normal)).normalize()
      this.radial.copy(w.normal).addScaledVector(this.axis, -this.axis.dot(w.normal)).normalize()
      let lowest = Infinity, axial = 0, radial = 0
      for (const [x, radius] of w.profile) {
        const height = x * this.axis.dot(w.normal) - radius * this.radial.dot(w.normal)
        if (height < lowest) { lowest = height; axial = x; radial = radius }
      }
      w.position.copy(this.center).addScaledVector(this.axis, axial).addScaledVector(this.radial, -radial)
      const h = this.sample(w.position.x, w.position.z, w)
      w.gap = w.position.y - h
      w.grounded = state[side + 'Grounded'] !== false && Number.isFinite(h) && w.gap < .18
      if (Number.isFinite(h)) w.position.y = h
    }
    return this.wheels
  }
}
