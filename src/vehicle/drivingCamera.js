import { MathUtils, MOUSE, Raycaster, Spherical, Vector3 } from 'three'
import {raycastRideBarriers} from './rideSurface.js'
import { queryColliders, overlapsFootprint } from '../player/collisionWorld.js'
import {armorConfig} from './armorPhysics.js'
import {armorCameraWeight,cameraFraming,setCameraFov,smoothCamera} from './cameraFraming.js'
import {MiddleMouseLook} from './MiddleMouseLook.js'

// Follow the vehicle's translation immediately; smooth the view angle instead.
// Smoothing absolute position made camera lag grow by speed / response rate.
export class DrivingCamera {
  constructor(camera, orbit, runtime, config, sample) {
    Object.assign(this, { camera, orbit, runtime, config, sample })
    this.anchor = new Vector3(); this.nextAnchor = new Vector3(); this.target = new Vector3()
    this.offset = new Vector3(); this.candidate = new Vector3(); this.probe = new Vector3()
    this.spherical = new Spherical(); this.colliders = []
    this.cliffRay=new Raycaster()
    this.time = 0; this.lastInput = -Infinity; this.dragging = false; this.pointer = null; this.lastPullback = 0
    this.frameWeight=0
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
    this.middleLook=new MiddleMouseLook(camera,orbit,runtime)
    this.zoom = () => {
      if(runtime.armorController?.active||this.canyonShot)return
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
    this.nextAnchor.set(s.x, s.height + MathUtils.lerp(1.05,cameraFraming.armorTargetHeight,this.frameWeight), s.z)
    if(this.runtime.transformEntry?.actorOffset)this.nextAnchor.add(this.runtime.transformEntry.actorOffset)
    return this.nextAnchor
  }
  reset(s) {
    const { config: c, camera, orbit } = this
    this.finishCanyonDefeat();this.finishTransformation();this.finishArmorReturn();this.frameWeight=0;setCameraFov(camera,cameraFraming.cycloneFov)
    this.anchor.copy(this.center(s)); orbit.target.copy(this.anchor)
    this.radius = Math.hypot(c.cameraDistance, c.cameraHeight - 1.05); this.collisionRadius = this.radius
    camera.position.set(s.x - Math.sin(s.yaw) * c.cameraDistance, s.height + c.cameraHeight, s.z - Math.cos(s.yaw) * c.cameraDistance)
    this.setMode(this.runtime.cameraMode, s)
  }
  setMode(mode, s) {
    const { orbit, camera, config: c } = this
    this.middleLook.cancel()
    this.dragging = false
    this.touchPointers.clear()
    const damping = orbit.enableDamping
    orbit.enableDamping = false; orbit.update(); orbit.enableDamping = damping
    this.runtime.cameraMode = mode
    orbit.enabled = true; orbit.enablePan = mode === 3
    orbit.mouseButtons.MIDDLE = null
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
    this.frameWeight=armorCameraWeight(runtime)
    setCameraFov(camera,MathUtils.lerp(cameraFraming.cycloneFov,cameraFraming.armorFov,this.frameWeight)+(s.airBoostBlend||0)*1.2*(1-this.frameWeight))
    this.offset.copy(this.center(s)).sub(this.anchor)
    camera.position.add(this.offset); orbit.target.add(this.offset); this.anchor.copy(this.nextAnchor)
    if(this.updateTransformation(s)){this.updating=false;return}
    if (runtime.cameraMode === 3&&!this.middleLook.active) { orbit.update(delta); this.updating = false; return }
    const yaw = s.travelYaw ?? s.yaw
    const lookAhead=c.cameraLookAhead*(1-this.frameWeight)*(this.middleLook.active?0:1),aimHeight=MathUtils.lerp(1.05,cameraFraming.armorTargetHeight,this.frameWeight)
    this.target.set(s.x + Math.sin(yaw) * lookAhead, s.height + aimHeight, s.z + Math.cos(yaw) * lookAhead)
    if(runtime.transformEntry?.actorOffset)this.target.add(runtime.transformEntry.actorOffset)
    this.offset.copy(this.target).sub(orbit.target).multiplyScalar(1 - Math.exp(-dt * c.cameraTargetSmoothing))
    camera.position.add(this.offset); orbit.target.add(this.offset); orbit.update(delta)
    this.spherical.setFromVector3(this.offset.copy(camera.position).sub(orbit.target))
    if(this.middleLook.active){this.spherical.theta=this.middleLook.theta(yaw);this.spherical.phi=this.middleLook.phi;this.lastInput=this.time}
    if (!this.middleLook.active&&!runtime.paused && !this.dragging && Math.abs(s.speed) > 0.8 && this.time - this.lastInput > c.cameraReturnDelay) {
      const theta = yaw + [Math.PI, Math.PI / 2, -Math.PI / 2][runtime.cameraMode]
      const turn = Math.atan2(Math.sin(theta - this.spherical.theta), Math.cos(theta - this.spherical.theta))
      const blend = 1 - Math.exp(-dt * c.cameraSmoothing)
      this.spherical.theta += turn * blend
      this.spherical.phi = MathUtils.lerp(this.spherical.phi, MathUtils.lerp(Math.atan2(c.cameraDistance,c.cameraHeight-1.05),Math.PI/2-cameraFraming.armorPitch,this.frameWeight), blend)
    }
    this.lastPullback = (Math.min(Math.abs(s.speed), 80) * c.cameraSpeedPullback + (s.boostTime || 0) / c.boostDuration * 0.10+(s.airBoostBlend||0)*.08)*(1-this.frameWeight)
    this.spherical.radius = MathUtils.lerp(this.radius,armorConfig.cameraDistance,this.frameWeight) + this.lastPullback
    orbit.maxPolarAngle=MathUtils.lerp(Math.PI*.49,Math.PI*.60,this.frameWeight)
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
  updateDefeat(delta){
    const {runtime,camera,orbit}=this,fall=runtime.scottInstance?.defeatMotion
    if(!fall?.active)return false
    this.middleLook.cancel()
    this.finishTransformation();this.finishArmorReturn()
    if(runtime.canyonCrash)return this.updateCanyonDefeat(runtime.canyonCrash)
    const dt=Math.min(.1,Math.max(0,delta)),hip=fall.hip.bone.getWorldPosition(this.probe),bike=runtime.vehicleRig.root.position
    this.target.copy(hip)
    if(runtime.bikeDefeatMotion?.active&&!runtime.canyonCrash)this.target.lerp(bike,.5)
    this.target.y=hip.y+.4
    this.spherical.setFromVector3(this.offset.copy(camera.position).sub(orbit.target))
    const distance=runtime.bikeDefeatMotion?.active&&!runtime.canyonCrash?hip.distanceTo(bike):0
    this.spherical.radius=MathUtils.damp(this.spherical.radius,Math.max(this.radius,4+distance*.65),5,dt)
    if(!this.dragging)this.spherical.phi=MathUtils.damp(this.spherical.phi,1.05,5,dt)
    orbit.target.lerp(this.target,1-Math.exp(-dt*6))
    camera.position.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
    const floor=this.sample(camera.position.x,camera.position.z)
    if(Number.isFinite(floor))camera.position.y=Math.max(camera.position.y,floor+.35)
    setCameraFov(camera,cameraFraming.cycloneFov);orbit.update(delta);return true
  }
  updateCanyonDefeat(crash){
    const {camera,orbit}=this
    if(!this.canyonShot||this.canyonShot.crash!==crash){
      this.finishCanyonDefeat()
      const controls={};for(const key of ['enabled','enableDamping','enableRotate','enablePan','enableZoom'])controls[key]=orbit[key]
      // Flush any pending orbit inertia before recording the final safe view.
      orbit.enableDamping=false;orbit.update()
      this.target.copy(crash.point).addScaledVector(crash.normal,.6)
      this.offset.copy(crash.normal).setY(0).normalize();this.candidate.copy(camera.position)
      const ground=this.sample(this.candidate.x,this.candidate.z)
      if(this.probe.subVectors(this.candidate,crash.point).dot(this.offset)<1||Number.isFinite(ground)&&this.candidate.y<ground+.35)this.candidate.copy(this.target).addScaledVector(this.offset,this.radius).add(new Vector3(0,1.4,0))
      this.cliffRay.ray.origin.copy(this.target);this.cliffRay.ray.direction.subVectors(this.candidate,this.target);this.cliffRay.far=this.cliffRay.ray.direction.length();this.cliffRay.ray.direction.normalize()
      const hit=raycastRideBarriers(this.cliffRay)
      if(hit)this.candidate.copy(this.target).addScaledVector(this.cliffRay.ray.direction,Math.max(.2,hit.distance-.35))
      camera.position.copy(this.candidate);camera.lookAt(this.target);setCameraFov(camera,cameraFraming.cycloneFov)
      this.canyonShot={crash,controls,position:camera.position.clone(),rotation:camera.quaternion.clone(),target:this.target.clone()}
    }
    for(const key of Object.keys(this.canyonShot.controls))orbit[key]=false
    camera.position.copy(this.canyonShot.position);camera.quaternion.copy(this.canyonShot.rotation);orbit.target.copy(this.canyonShot.target);camera.updateMatrixWorld(true)
    return true
  }
  finishCanyonDefeat(){if(this.canyonShot){Object.assign(this.orbit,this.canyonShot.controls);this.canyonShot=null}}
  updateTransformation(s){
    const {camera,orbit,runtime}=this,p=runtime.transformEntry?.cameraProgress
    if(this.returnShot&&runtime.transformEntry?.returnFlight){
      const shot=this.returnShot,t=smoothCamera(runtime.transformEntry.returnProgress??1),yaw=s.travelYaw??s.yaw
      const theta=s.yaw+[Math.PI,Math.PI/2,-Math.PI/2,Math.PI][runtime.cameraMode],turn=Math.atan2(Math.sin(theta-shot.theta),Math.cos(theta-shot.theta))
      this.spherical.set(MathUtils.lerp(shot.radius,this.radius,t),MathUtils.lerp(shot.phi,Math.atan2(this.config.cameraDistance,this.config.cameraHeight-1.05),t),shot.theta+turn*t)
      this.target.set(Math.sin(yaw)*this.config.cameraLookAhead,1.05,Math.cos(yaw)*this.config.cameraLookAhead)
      orbit.target.copy(shot.target).lerp(this.target,t).add(this.nextAnchor.set(s.x,s.height,s.z))
      camera.position.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
      const floor=this.sample(camera.position.x,camera.position.z)
      if(Number.isFinite(floor))camera.position.y=Math.max(camera.position.y,floor+.35)
      orbit.maxPolarAngle=Math.PI*.60;orbit.update()
      if(t===1)this.finishArmorReturn()
      return true
    }
    this.finishArmorReturn()
    if(p==null||p>=1){
      this.finishTransformation()
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
      MathUtils.lerp(shot.radius,armorConfig.cameraDistance,t),
      MathUtils.lerp(shot.phi,Math.PI/2-cameraFraming.armorPitch,t),
      s.yaw+MathUtils.lerp(shot.theta,3*Math.PI,t))
    orbit.target.set(s.x,s.height+MathUtils.lerp(1.05,cameraFraming.armorTargetHeight,t)+.08*arc,s.z)
    if(runtime.transformEntry?.actorOffset)orbit.target.add(runtime.transformEntry.actorOffset)
    camera.position.copy(orbit.target).add(this.offset.setFromSpherical(this.spherical))
    const floor=this.sample(camera.position.x,camera.position.z)
    if(Number.isFinite(floor))camera.position.y=Math.max(camera.position.y,floor+.35)
    orbit.maxPolarAngle=Math.PI*.60;orbit.update();return true
  }
  finishTransformation(){
    if(!this.transformShot)return
    this.orbit.enabled=this.transformShot.enabled;this.orbit.enableDamping=this.transformShot.damping
    this.orbit.maxPolarAngle=this.runtime.cameraMode===3?Math.PI-.025:MathUtils.lerp(Math.PI*.49,Math.PI*.60,this.frameWeight)
    this.transformShot=null;this.lastInput=this.time;this.collisionRadius=this.radius
  }
  beginArmorReturn(s){
    this.finishTransformation()
    this.spherical.setFromVector3(this.offset.copy(this.camera.position).sub(this.orbit.target))
    this.returnShot={radius:this.spherical.radius,theta:this.spherical.theta,phi:this.spherical.phi,target:this.orbit.target.clone().sub(new Vector3(s.x,s.height,s.z)),enabled:true,damping:this.orbit.enableDamping}
    this.frameWeight=1;this.anchor.copy(this.center(s));this.orbit.enableDamping=false;this.orbit.enabled=false
  }
  finishArmorReturn(){
    if(!this.returnShot)return
    this.orbit.enabled=this.returnShot.enabled;this.orbit.enableDamping=this.returnShot.damping
    this.orbit.maxPolarAngle=this.runtime.cameraMode===3?Math.PI-.025:Math.PI*.49
    this.returnShot=null;this.collisionRadius=this.radius;this.lastInput=this.time
  }
  dispose() {
    const { orbit } = this
    this.middleLook.dispose()
    this.finishCanyonDefeat()
    if(this.transformShot){orbit.enabled=this.transformShot.enabled;orbit.enableDamping=this.transformShot.damping}
    if(this.returnShot){orbit.enabled=this.returnShot.enabled;orbit.enableDamping=this.returnShot.damping}
    orbit.removeEventListener('start', this.start); orbit.removeEventListener('end', this.end); orbit.removeEventListener('change', this.change)
    orbit.domElement.removeEventListener('wheel', this.zoom)
    orbit.domElement.removeEventListener('pointerdown', this.down, true)
    orbit.domElement.removeEventListener('pointerup', this.up); orbit.domElement.removeEventListener('pointercancel', this.up)
  }
}
