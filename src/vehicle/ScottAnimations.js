import { AnimationMixer, MathUtils, Quaternion, Vector3 } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const canonical = name => name.replace(/^mixamorig[:_]?/, '')
export class ScottAnimations {
  constructor(source, clips) {
    this.probe = clone(source); this.bones = new Map(); this.rest = new Map(); this.pose = new Map()
    const meshes = []
    this.probe.traverse(node => { if (node.isBone) this.bones.set(canonical(node.name), node); if (node.isMesh) meshes.push(node) })
    meshes.forEach(mesh => mesh.removeFromParent())
    this.probe.updateMatrixWorld(true)
    for (const [name, bone] of this.bones) { this.rest.set(name, bone.getWorldQuaternion(new Quaternion())); this.pose.set(name, new Quaternion()) }
    this.restHipY = this.bones.get('Hips').getWorldPosition(new Vector3()).y
    this.mixer = new AnimationMixer(this.probe)
    this.actions = new Map()
    for (const clip of clips) {
      const copy = clip.clone()
      // Translation of the actor is owned by movement/collision code. Retain
      // authored hip bob; joint offsets and bone lengths always stay original.
      copy.tracks = copy.tracks.filter(track => track.name.endsWith('.quaternion') || /Hips\.position$/.test(track.name))
      const action = this.mixer.clipAction(copy).play(); action.paused = true; action.weight = 0
      this.actions.set(clip.name, { action, duration: clip.duration })
    }
    this.walkName = this.actions.has('walking_2_inplace') ? 'walking_2_inplace' : 'Walking'
    this.crouchTime = 0; this.crouchHipDrop = 0
    const squat = this.actions.get('air_squat')
    if (squat) {
      let minimum = Infinity
      squat.action.weight = 1
      for (let i = 0; i <= 100; i++) {
        squat.action.time = squat.duration * i / 100; this.mixer.update(0); this.probe.updateMatrixWorld(true)
        const height = this.bones.get('Hips').getWorldPosition(new Vector3()).y
        if (height < minimum) { minimum = height; this.crouchTime = squat.action.time }
      }
      squat.action.time = this.crouchTime; this.mixer.update(0); this.probe.updateMatrixWorld(true)
      const up = new Vector3(0, 1, 0).applyQuaternion(this.bones.get('Spine').getWorldQuaternion(new Quaternion()))
      this.drivingLean = MathUtils.clamp(Math.atan2(up.z, up.y), 0.25, 0.55)
      this.crouchHipDrop = minimum - this.restHipY
      squat.action.weight = 0
    }
    this.mixer.update(0)
  }
  sample(p) {
    const moving = p.motionBlend ?? (p.moving ? 1 : 0), running = p.runBlend || 0, crouch = p.crouchBlend || 0
    for (const entry of this.actions.values()) entry.action.weight = 0
    const phase = ((p.phase || 0) / (Math.PI * 2)) % 1
    for (const [name, weight] of [[this.walkName, moving * (1 - running) * (1 - crouch)], ['Running', moving * running * (1 - crouch)], ['air_squat', crouch]]) {
      const entry = this.actions.get(name)
      if (entry) { entry.action.weight = weight; entry.action.time = name === 'air_squat' ? this.crouchTime : phase * entry.duration }
    }
    this.mixer.update(0); this.probe.updateMatrixWorld(true)
    for (const [name, bone] of this.bones) bone.getWorldQuaternion(this.pose.get(name))
    return { orientations: this.pose, hipDelta: MathUtils.clamp(this.bones.get('Hips').getWorldPosition(new Vector3()).y - this.restHipY, -0.45, 0.06), armWeight: Math.min(1, moving + crouch) }
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.probe) }
}
