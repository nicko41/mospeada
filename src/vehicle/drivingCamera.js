import { MathUtils, MOUSE, Spherical, Vector3 } from 'three'
import { queryColliders, overlapsFootprint } from '../player/collisionWorld.js'

// Follow the vehicle's translation immediately; smooth the view angle instead.
// Smoothing absolute position made camera lag grow by speed / response rate.
export class DrivingCamera {
  constructor(camera, orbit, runtime, config, sample) {
    Object.assign(this, { camera, orbit, runtime, config, sample })
    this.anchor = new Vector3(); this.nextAnchor = new Vector3(); this.target = new Vector3()
    this.offset = new Vector3(); this.candidate = new Vector3(); this.probe = new Vector3()
    this.spherical = new Spherical(); this.colliders = []
    this.time = 0; this.lastInput = -Infinity; this.dragging = false; this.pointer = null; this.lastPullback = 0
    this.radius = Math.hypot(config.cameraDistance, config.cameraHeight - 1.05)
    this.collisionRadius = this.radius
    this.touchPointers = new Set()
    this.down = event => { if (event.pointerType === 'touch') this.touchPointers.add(event.pointerId) }
    this.up = event => { this.touchPointers.delete(event.pointerId) }
    this.start = () => { this.dragging = true; this.lastInput = this.time }
    this.end = () => { this.dragging = false; this.lastInput = this.time; this.pointer = null }
    // OrbitControls captures the pointer only while the right button is held.
    orbit.mouseButtons ||= {}
    orbit.mouseButtons.LEFT = null
    orbit.mouseButtons.RIGHT = MOUSE.ROTATE
    orbit.rotateSpeed = 0.6
    this.zoom = () => {
      if(runtime.armorController?.active)return
      this.lastInput = this.time
      if (runtime.cameraMode !== 3) this.radius = MathUtils.clamp(orbit.getDistance() - this.lastPullback, 2.1, 8)
    }
    this.change = () => {
      if (!this.dragging || this.updating) return
      this.lastInput = this.time
      if (this.touchPointers.size > 1) this.zoom()
    }
    orbit.addEventListener('start', this.start); orbit.addEventListener('end', this.end); orbit.addEventListener('change', this.change)
    orbit.domElement.addEventListener('wheel', this.zoom)
    orbit.domElement.addEventListener('pointerdown', this.down, true)
    orbit.domElement.addEventListener('pointerup', this.up); orbit.domElement.addEventListener('pointercancel', this.up)
  }
  center(s) {
    this.nextAnchor.set(s.x, s.height + 1.05, s.z)
    if(this.runtime.transformEntry?.actorOffset)this.nextAnchor.add(this.runtime.transformEntry.actorOffset)
    return this.nextAnchor
  }
  reset(s) {
    const { config: c, camera, orbit } = this
    this.anchor.copy(this.center(s)); orbit.target.copy(this.anchor)
    this.radius = Math.hypot(c.cameraDistance, c.cameraHeight - 1.05); this.collisionRadius = this.radius
    camera.position.set(s.x - Math.sin(s.yaw) * c.cameraDistance, s.height + c.cameraHeight, s.z - Math.cos(s.yaw) * c.cameraDistance)
    this.setMode(this.runtime.cameraMode, s)
  }
  setMode(mode, s) {
    const { orbit, camera, config: c } = this
    this.dragging = false
    this.touchPointers.clear()
    const damping = orbit.enableDamping
    orbit.enableDamping = false; orbit.update(); orbit.enableDamping = damping
    this.runtime.cameraMode = mode
    orbit.enabled = true; orbit.enablePan = mode === 3
    orbit.mouseButtons.MIDDLE = mode === 3 ? MOUSE.PAN : MOUSE.DOLLY
    orbit.minDistance = mode === 3 ? 0.9 : 2.1; orbit.maxDistance = mode === 3 ? 25 : 8.6
    orbit.minPolarAngle = mode === 3 ? 0.025 : 0.20
    orbit.maxPolarAngle = mode === 3 ? Math.PI - 0.025 : Math.PI * 0.49
    this.anchor.copy(this.center(s)); orbit.target.copy(this.anchor)
    if (mode !== 3) {
      this.radius = Math.hypot(c.cameraDistance, c.cameraHeight - 1.05); this.collisionRadius = this.radius
      this.spherical.set(this.radius, Math.atan2(c.cameraDistance, c.cameraHeight - 1.05), s.yaw + [Math.PI, Math.PI / 2, -Math.PI / 2][mode])
      camera.position.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
    }
    this.pointer = null; this.lastInput = -Infinity; orbit.update()
  }
  update(s, delta) {
    const { camera, orbit, config: c, runtime } = this
    this.updating = true
    const dt = Math.min(Math.max(delta, 0), 0.1); this.time += dt
    this.offset.copy(this.center(s)).sub(this.anchor)
    camera.position.add(this.offset); orbit.target.add(this.offset); this.anchor.copy(this.nextAnchor)
    if(this.updateTransformation(s)){this.updating=false;return}
    if (runtime.cameraMode === 3) { orbit.update(delta); this.updating = false; return }
    const yaw = s.travelYaw ?? s.yaw
    this.target.set(s.x + Math.sin(yaw) * c.cameraLookAhead, s.height + 1.05, s.z + Math.cos(yaw) * c.cameraLookAhead)
    if(runtime.transformEntry?.actorOffset)this.target.add(runtime.transformEntry.actorOffset)
    this.offset.copy(this.target).sub(orbit.target).multiplyScalar(1 - Math.exp(-dt * c.cameraTargetSmoothing))
    camera.position.add(this.offset); orbit.target.add(this.offset); orbit.update(delta)
    this.spherical.setFromVector3(this.offset.copy(camera.position).sub(orbit.target))
    if (!runtime.paused && !this.dragging && Math.abs(s.speed) > 0.8 && this.time - this.lastInput > c.cameraReturnDelay) {
      const theta = yaw + [Math.PI, Math.PI / 2, -Math.PI / 2][runtime.cameraMode]
      const turn = Math.atan2(Math.sin(theta - this.spherical.theta), Math.cos(theta - this.spherical.theta))
      const blend = 1 - Math.exp(-dt * c.cameraSmoothing)
      this.spherical.theta += turn * blend
      this.spherical.phi = MathUtils.lerp(this.spherical.phi, Math.atan2(c.cameraDistance, c.cameraHeight - 1.05), blend)
    }
    this.lastPullback = Math.min(Math.abs(s.speed), 80) * c.cameraSpeedPullback + (s.boostTime || 0) / c.boostDuration * 0.10
    this.spherical.radius = this.radius + this.lastPullback
    this.candidate.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
    const ground = this.sample(this.candidate.x, this.candidate.z)
    if (Number.isFinite(ground)) this.candidate.y = Math.max(this.candidate.y, ground + 0.35)
    queryColliders(Math.min(orbit.target.x, this.candidate.x) - 0.3, Math.min(orbit.target.z, this.candidate.z) - 0.3, Math.max(orbit.target.x, this.candidate.x) + 0.3, Math.max(orbit.target.z, this.candidate.z) + 0.3, this.colliders)
    for (let i = 1; i <= 18; i++) {
      this.probe.lerpVectors(orbit.target, this.candidate, i / 18)
      if (this.colliders.some(item => this.probe.y > item.minY - 0.2 && this.probe.y < item.maxY + 0.2 && overlapsFootprint(item, this.probe.x, this.probe.z, 0.22))) {
        this.candidate.lerpVectors(orbit.target, this.candidate, Math.max(0.12, (i - 1) / 18)); break
      }
    }
    const available = this.candidate.distanceTo(orbit.target)
    this.collisionRadius = available < this.collisionRadius ? available : MathUtils.damp(this.collisionRadius, available, 10, dt)
    camera.position.copy(orbit.target).add(this.offset.copy(this.candidate).sub(orbit.target).setLength(Math.max(0.15, this.collisionRadius)))
    const floor = this.sample(camera.position.x, camera.position.z)
    if (Number.isFinite(floor)) camera.position.y = Math.max(camera.position.y, floor + 0.35)
    const minimum = orbit.minDistance
    orbit.minDistance = Math.min(minimum, camera.position.distanceTo(orbit.target))
    orbit.update(delta)
    orbit.minDistance = minimum; this.updating = false
  }
  updateTransformation(s){
    const {camera,orbit,runtime}=this,p=runtime.transformEntry?.cameraProgress
    if(p==null||p>=1){
      if(this.transformShot){
        orbit.enabled=this.transformShot.enabled;orbit.enableDamping=this.transformShot.damping
        this.transformShot=null;this.lastInput=this.time;this.collisionRadius=this.radius
      }
      return false
    }
    if(!this.transformShot){
      const damping=orbit.enableDamping,enabled=orbit.enabled
      orbit.enableDamping=false;orbit.update()
      this.spherical.setFromVector3(this.offset.copy(camera.position).sub(orbit.target))
      const theta=((this.spherical.theta-s.yaw)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)
      this.transformShot={theta,phi:this.spherical.phi,radius:this.spherical.radius,damping,enabled}
      orbit.enabled=false
    }
    const shot=this.transformShot,t=p*p*(3-2*p),arc=Math.sin(Math.PI*p)
    this.spherical.set(
      MathUtils.lerp(shot.radius,this.radius,t)+.7*arc,
      MathUtils.lerp(shot.phi,Math.atan2(this.config.cameraDistance,this.config.cameraHeight-1.05),t)-.08*arc,
      s.yaw+MathUtils.lerp(shot.theta,3*Math.PI,t))
    orbit.target.set(s.x,s.height+1.05+.15*arc,s.z)
    camera.position.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
    const floor=this.sample(camera.position.x,camera.position.z)
    if(Number.isFinite(floor))camera.position.y=Math.max(camera.position.y,floor+.35)
    orbit.update();return true
  }
  dispose() {
    const { orbit } = this
    if(this.transformShot){orbit.enabled=this.transformShot.enabled;orbit.enableDamping=this.transformShot.damping}
    orbit.removeEventListener('start', this.start); orbit.removeEventListener('end', this.end); orbit.removeEventListener('change', this.change)
    orbit.domElement.removeEventListener('wheel', this.zoom)
    orbit.domElement.removeEventListener('pointerdown', this.down, true)
    orbit.domElement.removeEventListener('pointerup', this.up); orbit.domElement.removeEventListener('pointercancel', this.up)
  }
}
