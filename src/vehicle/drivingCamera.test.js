import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, MOUSE, PerspectiveCamera, Vector3 } from 'three'
import { DrivingCamera } from './drivingCamera.js'
import { bikeConfig } from './bikeConfig.js'
import { boxCollider, registerColliders } from '../player/collisionWorld.js'

function setup() {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 220), listeners = new Map()
  const canvas = { addEventListener(k, fn) { listeners.set(k, fn) }, removeEventListener(k) { listeners.delete(k) } }
  const orbit = { domElement: canvas, target: new Vector3(), addEventListener() {}, removeEventListener() {},
    update() { camera.lookAt(this.target) }, getDistance() { return camera.position.distanceTo(this.target) } }
  const runtime = { cameraMode: 0, paused: false }, s = { x: 0, z: 0, height: 0, yaw: 0, travelYaw: 0, speed: 0, boostTime: 0 }
  const controller = new DrivingCamera(camera, orbit, runtime, bikeConfig, () => 0)
  controller.reset(s)
  return { camera, orbit, runtime, s, controller, listeners }
}

test('camera follows the armored rider departure without dragging back to the unfinished bike',()=>{
  const f=setup();f.runtime.transformEntry={actorOffset:new Vector3(0,2.4,7.5),cameraProgress:1}
  for(let i=0;i<60;i++)f.controller.update(f.s,1/60)
  assert.ok(f.orbit.target.z>7);assert.ok(f.orbit.target.y>3)
  f.runtime.transformEntry.actorOffset.set(0,0,0)
  for(let i=0;i<100;i++)f.controller.update(f.s,1/60)
  assert.ok(Math.abs(f.orbit.target.z)<.5);f.controller.dispose()
})

test('Cyclone keeps its wider contextual frame at road and boost speeds without accumulating positional lag', () => {
  for (const speed of [0, 20, 60, 80]) {
    const { camera, s, controller } = setup(); s.speed = speed
    for (let i = 0; i < 360; i++) { s.z += speed / 120; controller.update(s, 1 / 120) }
    const behind = s.z - camera.position.z
    assert.ok(behind > 4 && behind < 4.8, `${speed} m/s: ${behind} m behind`)
    assert.ok(camera.position.distanceTo(new Vector3(s.x, s.height + 1, s.z)) < 5.5)
    controller.dispose()
  }
})

test('right-drag controls the camera without hover/left-drag look and works while paused', () => {
  const { camera, orbit, runtime, s, controller, listeners } = setup()
  assert.equal(orbit.enabled, true)
  assert.equal(orbit.mouseButtons.RIGHT, MOUSE.ROTATE)
  assert.equal(orbit.mouseButtons.LEFT, null)
  assert.equal(listeners.has('pointermove'), false)
  controller.start()
  camera.position.sub(orbit.target).applyAxisAngle(new Vector3(0, 1, 0), .9).add(orbit.target)
  controller.end()
  runtime.paused = true; s.speed = 60
  const angle = Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z)
  for (let i = 0; i < 300; i++) controller.update(s, 1 / 120)
  assert.ok(Math.abs(Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z) - angle) < 1e-9)
  controller.setMode(3, s)
  assert.equal(orbit.mouseButtons.RIGHT, MOUSE.ROTATE)
  assert.equal(orbit.mouseButtons.MIDDLE, MOUSE.PAN)
  controller.dispose()
})

test('manual view is held briefly before smooth recentering, and chosen zoom survives acceleration', () => {
  const { camera, orbit, s, controller, listeners } = setup(); s.speed = 20
  controller.start()
  camera.position.sub(orbit.target).applyAxisAngle(new Vector3(0, 1, 0), 1.2).add(orbit.target)
  controller.end()
  const angle = Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z)
  for (let i = 0; i < 120; i++) controller.update(s, 1 / 120)
  assert.ok(Math.abs(Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z) - angle) < 1e-9)
  for (let i = 0; i < 360; i++) controller.update(s, 1 / 120)
  const returned = Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z)
  assert.ok(Math.abs(Math.atan2(Math.sin(returned - Math.PI), Math.cos(returned - Math.PI))) < 0.01)
  const chosen = controller.radius
  controller.dragging = true; camera.position.sub(orbit.target).setLength(1.4).add(orbit.target)
  controller.change(); controller.dragging = false
  assert.equal(controller.radius, chosen, 'Rotating near a wall must not overwrite the chosen zoom')
  camera.position.sub(orbit.target).setLength(2.7).add(orbit.target); controller.zoom()
  const zoom = controller.radius
  s.speed = 80; for (let i = 0; i < 120; i++) controller.update(s, 1 / 120)
  assert.ok(Math.abs(controller.radius - zoom) < 1e-9 && orbit.getDistance() < 3.3)
  controller.dispose()
})

test('camera retracts before an obstruction and recovers its close follow distance afterward', () => {
  const { camera, orbit, s, controller } = setup()
  const unregister = registerColliders([boxCollider(new Box3(new Vector3(-2, 0, -2.2), new Vector3(2, 3, -1.8)))])
  try {
    controller.update(s, 1 / 60)
    assert.ok(camera.position.z > -1.6 && orbit.getDistance() < 2.1)
  } finally { unregister() }
  for (let i = 0; i < 180; i++) controller.update(s, 1 / 120)
  assert.ok(orbit.getDistance() > 4.5 && orbit.getDistance() < 4.8)
  assert.ok(camera.position.y >= 0.35)
  controller.dispose()
})

test('transformation camera makes a full orbit, passes the front and returns behind without changing the chosen zoom',()=>{
  const {camera,orbit,runtime,s,controller}=setup(),radius=controller.radius
  orbit.enableDamping=true;runtime.transformEntry={cameraProgress:0};s.speed=14
  let last=Math.PI,turn=0,front=false
  for(let i=0;i<120;i++){
    runtime.transformEntry.cameraProgress=i/120;s.z+=s.speed/60;s.height=2*Math.sin(i/120*Math.PI)
    controller.update(s,1/60)
    const theta=Math.atan2(camera.position.x-s.x,camera.position.z-s.z)
    turn+=Math.atan2(Math.sin(theta-last),Math.cos(theta-last));last=theta
    if(camera.position.z>s.z+3)front=true
    assert.equal(orbit.enabled,false)
  }
  assert.ok(turn>6.2&&front);assert.equal(controller.radius,radius)
  runtime.transformEntry.cameraProgress=1;controller.update(s,1/60)
  assert.equal(orbit.enabled,true);assert.equal(orbit.enableDamping,true);assert.ok(camera.position.z<s.z-3)
  runtime.transformEntry.cameraProgress=0;controller.update(s,1/60)
  runtime.transformEntry.cameraProgress=null;controller.update(s,1/60)
  assert.equal(orbit.enabled,true);assert.equal(orbit.enableDamping,true)
  controller.dispose()
})
