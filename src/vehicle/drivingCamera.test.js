import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Group, Mesh, MeshBasicMaterial, MOUSE, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three'
import {registerRideSurfaces,raycastRideBarriers} from './rideSurface.js'
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
  assert.equal(listeners.has('pointermove'), true)
  controller.start()
  camera.position.sub(orbit.target).applyAxisAngle(new Vector3(0, 1, 0), .9).add(orbit.target)
  controller.end()
  runtime.paused = true; s.speed = 60
  const angle = Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z)
  for (let i = 0; i < 300; i++) controller.update(s, 1 / 120)
  assert.ok(Math.abs(Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z) - angle) < 1e-9)
  controller.setMode(3, s)
  assert.equal(orbit.mouseButtons.RIGHT, MOUSE.ROTATE)
  assert.equal(orbit.mouseButtons.MIDDLE, null)
  controller.dispose()
})

test('middle mouse looks behind, held dragging orbits freely, and release restores the translated driving view',()=>{
 const {camera,orbit,runtime,s,controller}=setup();runtime.state=s
 const middle=controller.middleLook,event=(x=0,y=0)=>({button:1,pointerId:7,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}})
 controller.update(s,1/60);const before=camera.position.clone().sub(orbit.target),radius=controller.radius
 middle.down(event());controller.update(s,1/60)
 assert.ok(camera.position.z>orbit.target.z+3,'The camera moves in front of Scott to see behind him');assert.equal(orbit.enabled,false)
 middle.move(event(130,40));controller.update(s,1/60)
 assert.ok(middle.gesture.dragged);assert.ok(Math.abs(camera.position.x-orbit.target.x)>1)
 s.x+=8;s.z+=12;controller.update(s,1/60);middle.up({...event(),type:'pointerup'})
 assert.ok(camera.position.clone().sub(orbit.target).distanceTo(before)<1e-9);assert.equal(s.yaw,0);assert.equal(controller.radius,radius);assert.equal(orbit.enabled,true)
 middle.down(event());middle.up({type:'blur'});assert.equal(middle.active,false)
 runtime.canyonCrash={};middle.down(event());assert.equal(middle.active,false,'A locked defeat camera cannot be rotated');controller.dispose()
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

test('non-orbit transformation keeps its viewing angle and smooth Armor framing',()=>{
  const {camera,orbit,runtime,s,controller}=setup()
  orbit.enableDamping=true;runtime.transformEntry={cameraProgress:null,framingProgress:0};s.speed=14
  for(let i=0;i<=120;i++){
    runtime.transformEntry.framingProgress=i/120;s.z+=s.speed/60
    controller.update(s,1/60)
    assert.equal(controller.transformShot,undefined);assert.equal(orbit.enabled,true)
    assert.ok(Math.abs(camera.position.x-s.x)<1e-7,'The camera stays behind instead of circling')
  }
  assert.equal(camera.fov,50);controller.dispose()
})

test('defeat camera keeps the fallen rider and the separated bike inside the frame',()=>{
  const {camera,orbit,runtime,s,controller}=setup();controller.setMode(1,s)
  runtime.scottInstance={defeatMotion:{active:true,hip:{bone:{getWorldPosition:p=>p.set(0,.2,-4)}}}}
  runtime.vehicleRig={root:{position:new Vector3(0,0,2)}};runtime.bikeDefeatMotion={active:true}
  for(let i=0;i<120;i++)assert.equal(controller.updateDefeat(1/60),true)
  camera.updateMatrixWorld(true)
  for(const z of[-5,3]){const p=new Vector3(0,.2,z).project(camera);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,'Both bodies fit inside the screen')}
  assert.ok(orbit.target.distanceTo(new Vector3(0,.6,-1))<.001)
  controller.reset(s);assert.equal(controller.radius,Math.hypot(bikeConfig.cameraDistance,bikeConfig.cameraHeight-1.05));controller.dispose()
})

test('canyon defeat leaves actors visible, crosses the gap and tilts down after they settle',()=>{
 const {camera,orbit,runtime,s,controller}=setup(),wall=new Mesh(new PlaneGeometry(20,20),new MeshBasicMaterial()),scene=new Group()
 wall.position.set(0,2,-4);wall.userData.rideBarrier=true;scene.add(wall);const remove=registerRideSurfaces(scene)
 Object.assign(orbit,{enableDamping:true,enableRotate:true,enableZoom:true})
 const hip=new Vector3(0,2,-3.5),wrapper=new Group();runtime.state=s;runtime.scottInstance={defeatMotion:{wrapper,active:true,contact:false,hip:{bone:{getWorldPosition:p=>p.copy(hip)}}}};runtime.vehicleRig={root:new Group()};runtime.vehicleRig.root.position.set(0,1,-3);runtime.bikeDefeatMotion={active:true,settled:false}
 runtime.canyonCrash={point:new Vector3(0,2,-4),normal:new Vector3(0,0,1),floorAt:()=>-36}
 try{
  // Begin with a bad orbit on the far side of the rock.
  camera.position.set(0,3,-7);controller.updateDefeat(1/60)
  assert.equal(wrapper.visible,true);assert.equal(runtime.vehicleRig.root.visible,true)
  for(let i=0;i<90;i++)controller.updateDefeat(1/60)
  assert.equal(controller.canyonShot.phase,'conceal')
  assert.equal(wrapper.visible,true);assert.equal(runtime.vehicleRig.root.visible,true);assert.ok(camera.position.z<-930,'Camera retreats above the opposite bank');assert.ok(camera.position.y>0,'Camera keeps its flight height');assert.ok(camera.getWorldDirection(new Vector3()).z>.999,'Retreat keeps looking toward the takeoff side')
  const position=camera.position.clone(),rotation=camera.quaternion.clone(),target=orbit.target.clone();runtime.paused=true
  for(let i=0;i<60;i++)controller.updateDefeat(1/60)
  assert.ok(camera.position.distanceTo(position)<1e-9);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);assert.ok(orbit.target.distanceTo(target)<1e-9)
  for(const key of ['enabled','enableDamping','enableRotate','enablePan','enableZoom'])assert.equal(orbit[key],false)
  runtime.paused=false;hip.y=-35.8;runtime.vehicleRig.root.position.y=-36;runtime.scottInstance.defeatMotion.contact=true;runtime.bikeDefeatMotion.settled=true;controller.updateDefeat(1/60);assert.equal(wrapper.visible,true);runtime.defeat={ready:true}
  controller.updateDefeat(1/60);assert.equal(controller.canyonShot.phase,'approach');const bank=camera.position.clone()
  for(let i=0;i<30;i++)controller.updateDefeat(1/60)
  assert.ok(camera.position.z>bank.z,'Camera advances toward the edge after the fall');assert.equal(camera.position.y,bank.y);assert.ok(camera.getWorldDirection(new Vector3()).z>.999,'Approach keeps the same view toward the takeoff side')
  for(let i=0;i<150;i++)controller.updateDefeat(1/60)
  assert.equal(controller.canyonShot.phase,'settled');assert.equal(camera.position.y,bank.y,'Downward tilt keeps the camera above the bank');assert.ok(orbit.target.y<-35);assert.equal(wrapper.visible,true);assert.equal(runtime.vehicleRig.root.visible,true);assert.ok(camera.getWorldDirection(new Vector3()).y<-.99999,'Final camera points straight down');assert.ok(camera.position.y>orbit.target.y+9)
  for(const point of[hip,runtime.vehicleRig.root.position]){const projected=point.clone().project(camera);assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95,'Scott and Cyclone fit inside the final shot')}
  controller.cliffRay.ray.origin.copy(orbit.target);controller.cliffRay.ray.direction.subVectors(camera.position,orbit.target).normalize();controller.cliffRay.far=orbit.target.distanceTo(camera.position);assert.equal(raycastRideBarriers(controller.cliffRay),null)
  runtime.canyonCrash=null;controller.reset(s);assert.equal(orbit.enabled,true);assert.equal(orbit.enableDamping,true);assert.equal(orbit.enableRotate,true);assert.equal(orbit.enableZoom,true);assert.equal(controller.canyonShot,null)
 }finally{remove();wall.geometry.dispose();wall.material.dispose();controller.dispose()}
})
