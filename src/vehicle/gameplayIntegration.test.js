import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createDrivingCyclone } from './createDrivingCyclone.js'
import { bikeConfig } from './bikeConfig.js'
import { createBikeState, advanceBike } from './bikePhysics.js'
import { riderMountPoint, requestRiderToggle } from './riderPresence.js'
import { parseCycloneScottActions } from './cycloneScottActions.js'
import { updateScottGameplay } from './scottGameplay.js'
import { registerRideSurfaces } from './rideSurface.js'
import { createRelaxedScottHands } from './relaxedScottHands.js'
import openingPatches from './headlightOpeningsData.js'
import { frontGeometryKey } from './frontTransformMath.js'

globalThis.self = globalThis; globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const data = JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')), flat = () => 0
async function load(file) { const b = fs.readFileSync(file); return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '') }
const assets = Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'), load('assets/scott-bernard-animated.glb')])

test('restored vehicle steers, rolls wheels and keeps axle/fork contacts at the current size without loading a rider rig', async () => {
  const [bike] = await assets, rig = createDrivingCyclone(bike.scene), sourceGeometry = new Set()
  bike.scene.traverse(n => { if (n.isMesh) sourceGeometry.add(n.geometry) })
  const opened=new Set()
  rig.surfaces.forEach(mesh=>{
    const patch=openingPatches.find(p=>p.key===frontGeometryKey(mesh))
    if(!patch){assert.ok(sourceGeometry.has(mesh.geometry));return}
    assert.ok(!sourceGeometry.has(mesh.geometry),'Only the two approved housing faces use a local geometry copy')
    assert.deepEqual(mesh.geometry.userData.openHeadlightFaces,patch.faceIds)
    assert.equal(mesh.geometry.index.count,patch.vertexCount-3*patch.removeTriangleStarts.length)
    opened.add(patch.pieceId)
  })
  assert.equal(opened.size,2)
  const s = createBikeState({ x: 0, z: 0, yaw: 0 }, rig.metrics, flat)
  for (let i = 0; i < 240; i++) { advanceBike(s, { throttle: 1, steer: .1 }, 1 / 120, rig.metrics, flat); rig.update(s, flat, bikeConfig) }
  assert.ok(s.speed > 10 && Math.hypot(s.x, s.z) > 8)
  assert.ok(Math.abs(rig.frontSpin.rotation.x) > .1 && rig.articulation.frontSteer > 0)
  assert.ok(Math.abs(rig.articulation.frontContactError) < .01)
  assert.ok(Math.abs(rig.articulation.rearContactError) < .01)
  rig.frontForks.forEach(f => assert.ok(f.state.topError < 1e-6 && f.state.bottomError < 1e-6))
  assert.equal(rig.rider, undefined)
})

test('F uses the authored left approach point and clip duration, then walking and running return to that point before mounting', async () => {
  const [bike] = await assets, rig = createDrivingCyclone(bike.scene), c = { ...bikeConfig, mountAnchor: data.keyPoses[0].pelvis, dismountDuration: data.duration }
  const s = createBikeState({ x: 5, z: 10, yaw: .7 }, rig.metrics, flat)
  const run = (input, seconds) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) advanceBike(s, input, 1 / 120, rig.metrics, flat, () => true, c, () => true) }
  requestRiderToggle(s, c); run({}, 1)
  assert.equal(s.riderMode, 'dismounting'); assert.ok(s.dismountBlend < .5)
  run({}, 2); assert.equal(s.riderMode, 'onFoot')
  const anchor = riderMountPoint(s, c.mountAnchor)
  assert.ok(Math.hypot(s.pedestrian.x - anchor.x, s.pedestrian.z - anchor.z) < 1e-8)
  run({ walkForward: 1, walkYaw: 0 }, .2); const walked = s.pedestrian.z
  run({ walkForward: 1, walkYaw: 0, run: true }, .2); assert.ok(s.pedestrian.z - walked > .4)
  assert.ok(requestRiderToggle(s, c)); assert.equal(s.riderMode, 'approaching')
  run({}, 4); assert.equal(s.riderMode, 'mounted'); assert.equal(s.pedestrian, null)
})

test('completed motorcycle settles rear-first while its front axle keeps its flight path; driving state stays intact',async()=>{
  const [bike]=await assets,rig=createDrivingCyclone(bike.scene),s=createBikeState({x:8,z:12,yaw:.7},rig.metrics,flat)
  s.height+=3;s.frontSpring+=3;s.rearSpring+=3;s.airborne=true;s.frontGrounded=s.rearGrounded=false
  const before=JSON.stringify(s)
  rig.update(s,flat,bikeConfig)
  const rear=rig.rearAxle.getWorldPosition(new T.Vector3()),front=rig.frontAxle.getWorldPosition(new T.Vector3()),matrices=rig.surfaces.map(m=>m.matrixWorld.clone())
  for(const tilt of[.1,.3,.55,.3,0]){
    rig.update(s,flat,bikeConfig,tilt)
    assert.equal(JSON.stringify(s),before)
    assert.ok(Math.abs(rig.body.rotation.x-(s.pitch-tilt))<1e-9)
    assert.ok(rig.frontAxle.getWorldPosition(new T.Vector3()).distanceTo(front)<1e-8,'Front follows its original path instead of being lifted')
    if(tilt===.55)assert.ok(rear.y-rig.rearAxle.getWorldPosition(new T.Vector3()).y>.7,'Rear sinks under the rider')
  }
  rig.surfaces.forEach((m,i)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-matrices[i].elements[k])<1e-8)))
})

test('mounted Scott has lower soles, fixed jump supports, boost/brake/dab movements and unmodified Roll_Dodge_4 transitions', async () => {
  const [bike, scott] = await assets, rig = createDrivingCyclone(bike.scene), wrapper = new T.Group(), scene = new T.Scene()
  const floor = new T.Mesh(new T.PlaneGeometry(200, 200).rotateX(-Math.PI / 2)); floor.userData.rideSurface = true
  const model = clone(scott.scene); wrapper.add(model); scene.add(floor, rig.root, wrapper)
  const unregister = registerRideSurfaces(scene), bones = new Map(), skins = []
  model.traverse(n => { if (n.isBone) bones.set(n.name, n); if (n.isSkinnedMesh) skins.push({ mesh: n }) })
  const hands = skins.map(skin => createRelaxedScottHands(skin.mesh)).filter(Boolean)
  const instance = { model, sourceScene: scott.scene, bones, skins, hands, mixer: new T.AnimationMixer(model), clip: null }
  const clips = [...scott.animations, ...parseCycloneScottActions(data)], authored = { data }
  const runtime = { state: createBikeState({ x: 0, z: 0, yaw: 0 }, rig.metrics, flat), paused: false, vehicleRig: rig, scottBikeBody: rig.body }
  const s = runtime.state; s.speed = 15; s.idleBlend = 0
  const update = () => { rig.update(s, flat, bikeConfig); updateScottGameplay(instance, authored, clips, runtime, wrapper, 1 / 60) }
  const offsets = new Map([...bones].map(([n, b]) => [n, { position: b.position.clone(), scale: b.scale.clone() }]))
  try {
    for (let i = 0; i < 30; i++) update()
    assert.equal(skins[0].mesh.morphTargetInfluences[1], 1)
    for (const shape of hands[0].sides) {
      const mesh = skins[0].mesh, glove = new T.Box3(), covers = []
      for (const cover of rig.surfaces.filter(m => /^tapa-up/.test(m.userData.sourcePiece))) {
        const box = new T.Box3(), p = cover.geometry.attributes.position
        for (let i = 0; i < p.count; i++) box.expandByPoint(rig.body.worldToLocal(cover.localToWorld(new T.Vector3().fromBufferAttribute(p, i))))
        if (Math.sign(box.getCenter(new T.Vector3()).x) === shape.sign) covers.push(box)
      }
      const joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight
      for (const i of hands[0].affected) if ([0, 1, 2, 3].some(k => joints.array[i * 4 + k] === shape.joint && weights.array[i * 4 + k] > .6)) {
        glove.expandByPoint(rig.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, new T.Vector3()))))
      }
      assert.ok(glove.min.x > covers[0].min.x && glove.max.x < covers[0].max.x, JSON.stringify({ glove, cover: covers[0] }))
      assert.ok(glove.max.y < covers[0].max.y && glove.max.z < covers[0].max.z)
    }
    let d = instance.mountedMotion.diagnostics
    for (const foot of Object.values(d.feet)) assert.ok(foot.sole[1] < foot.stripBottom && foot.sole[1] > foot.stripBottom - .03)
    const supports = structuredClone(d.feet)
    const head = bones.get('mixamorigHead'), neck = bones.get('mixamorigNeck')
    const gazeAxis = new T.Vector3(0, 0, 1).applyQuaternion(rig.body.getWorldQuaternion(new T.Quaternion())).applyQuaternion(head.getWorldQuaternion(new T.Quaternion()).invert())
    s.airborne = true; s.frontGrounded = false; s.rearGrounded = false; s.riderStand = 1; s.height = 2
    update(); d = instance.mountedMotion.diagnostics
    assert.ok(d.standHeight > .15 && d.standHeight <= bikeConfig.riderStandHeight)
    assert.ok(d.handError < .01 && d.footError < .01, JSON.stringify(d))
    assert.ok(d.head.neckChange < .08 && d.head.headChange < .12, 'Jump adds at most a small cervical lift instead of cancelling torso flex')
    const headAtPeak = head.quaternion.clone(), neckAtPeak = neck.quaternion.clone()
    for (let i = 0; i < 20; i++) update()
    assert.ok(head.quaternion.angleTo(headAtPeak) < 1e-5 && neck.quaternion.angleTo(neckAtPeak) < 1e-5, 'Head corrections do not accumulate')
    for (const side of ['Left', 'Right']) assert.ok(new T.Vector3().fromArray(d.feet[side].sole).distanceTo(new T.Vector3().fromArray(supports[side].sole)) < .005)
    s.airborne = false; s.frontGrounded = true; s.rearGrounded = true; s.riderStand = 0; s.height = 0; s.wheelieAngle = bikeConfig.wheelieAngle
    update(); d = instance.mountedMotion.diagnostics
    assert.ok(d.head.lookDown > .6 && d.head.neckChange < .3 && d.head.headChange < .43)
    const wheelieGaze = gazeAxis.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion()))
    assert.ok(Math.abs(wheelieGaze.y) < .25 && wheelieGaze.z > .95, 'Wheelie looks toward the road without snapping the neck')
    for (const side of ['Left', 'Right']) {
      assert.ok(d.feet[side].toeDown > .2 && d.feet[side].toeDown <= .25)
      assert.ok(new T.Vector3().fromArray(d.feet[side].sole).distanceTo(new T.Vector3().fromArray(supports[side].sole)) < .005, side + ' sole stays on the peg while toes pitch down')
    }
    assert.ok(d.handError < .01 && d.footError < .01)
    s.wheelieAngle = 0
    s.airborne = false; s.frontGrounded = true; s.rearGrounded = true; s.riderStand = 0; s.height = 0; s.boostBlend = 1; s.boostKick = 1
    update(); assert.ok(instance.mountedMotion.diagnostics.boost > .9); assert.ok(instance.mountedMotion.diagnostics.handError < .01)
    s.boostBlend = 0; s.boostKick = 0; s.speed = 0; s.idleBlend = 1
    for (let i = 0; i < 40; i++) update()
    assert.ok(Math.abs(instance.mountedMotion.diagnostics.feet.Left.worldSole[1] - .004) < .01, JSON.stringify(instance.mountedMotion.diagnostics))
    s.speed = 8; s.idleBlend = 0; s.lean = -.3; s.riderDabLeft = 1; s.brakeBlend = 1
    update(); d = instance.mountedMotion.diagnostics; assert.ok(d.feet.Left.groundBlend > .99 && d.handError < .01)
    // Enter the original corrected crossing: the mounted layer must restore its
    // previous changes before the mixer, then leave all four right-leg tracks alone.
    s.riderMode = 'mounting'; s.dismountBlend = 1 - 1.3 / data.duration; s.pedestrian = { x: .5, z: -.5, ground: 0, yaw: 0 }
    update()
    const mount = clips.find(c => c.name === 'Cyclone_Mount')
    for (const name of data.rightLegCorrection.localBones) {
      const expected = mount.tracks.find(t => t.name === name + '.quaternion').createInterpolant().evaluate(1.3)
      bones.get(name).quaternion.toArray().forEach((q, i) => assert.ok(Math.abs(q - expected[i]) < 1e-6))
    }
    for (const [name, b] of bones) { assert.ok(b.scale.distanceTo(offsets.get(name).scale) < 1e-10); if (!name.endsWith('Hips')) assert.ok(b.position.distanceTo(offsets.get(name).position) < 1e-10) }
    assert.equal(skins[0].mesh.geometry.attributes.skinWeight, hands[0].source.attributes.skinWeight)
    assert.equal(skins[0].mesh.geometry.attributes.position, hands[0].source.attributes.position)
  } finally { unregister(); hands.forEach(hand => hand.dispose()) }
})
