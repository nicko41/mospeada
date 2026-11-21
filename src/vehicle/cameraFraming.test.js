import test from 'node:test'
import assert from 'node:assert/strict'
import {PerspectiveCamera,Raycaster,Vector2,Vector3} from 'three'
import {DrivingCamera} from './drivingCamera.js'
import {ArmorCamera} from './ArmorCamera.js'
import {bikeConfig} from './bikeConfig.js'
import {armorConfig} from './armorPhysics.js'
import {cameraFraming} from './cameraFraming.js'

test('Armor has the larger heroic projection; both transformation handoffs change framing and FOV continuously',()=>{
  globalThis.document={pointerLockElement:null}
  const camera=new PerspectiveCamera(65,16/9,.1,220),canvas={addEventListener(){},removeEventListener(){}}
  const orbit={domElement:canvas,target:new Vector3(),enabled:true,enableDamping:true,addEventListener(){},removeEventListener(){},update(){camera.lookAt(this.target)},getDistance(){return camera.position.distanceTo(this.target)}}
  const s={x:0,z:0,height:0,yaw:0,travelYaw:0,speed:0,boostTime:0},runtime={state:s,cameraMode:0,paused:false}
  const driver=new DrivingCamera(camera,orbit,runtime,bikeConfig,()=>0);runtime.cameraController=driver;driver.reset(s)
  const projection=()=>{camera.updateMatrixWorld(true);return Math.abs(new Vector3(0,2.4,0).project(camera).y-new Vector3(0,0,0).project(camera).y)}
  for(let i=0;i<120;i++)driver.update(s,1/60)
  const cycloneSize=projection(),chosenRadius=driver.radius
  assert.equal(camera.fov,cameraFraming.cycloneFov)
  const entry=runtime.transformEntry={cameraProgress:0,actorOffset:new Vector3(),phase:'transforming'}
  let fov=camera.fov
  for(let i=0;i<=120;i++){entry.cameraProgress=i/120;driver.update(s,1/60);assert.ok(camera.fov<=fov+1e-7);fov=camera.fov}
  assert.equal(driver.radius,chosenRadius,'Transform framing must preserve the chosen Cyclone zoom')
  const a={x:0,y:0,z:0,yaw:0,boostBlend:0};runtime.armorController={active:true,state:a}
  const armor=new ArmorCamera(camera,orbit,runtime,()=>0),before=camera.position.clone();armor.activate(a)
  assert.ok(camera.position.distanceTo(before)<1e-9,'Activating the Armor camera cannot snap position')
  for(let i=0;i<150;i++)armor.update(a,1/60)
  assert.ok(Math.abs(camera.fov-cameraFraming.armorFov)<.001)
  assert.ok(Math.abs(armor.distance-armorConfig.cameraDistance)<.001)
  assert.ok(projection()>cycloneSize*1.7,'Armor must read clearly larger without any model scale changes')
  assert.ok(camera.position.y<a.y+cameraFraming.armorTargetHeight&&camera.getWorldDirection(new Vector3()).y>0,'A slightly lower camera looks upward at Armor')
  runtime.gallant={active:true,aiming:true,firing:false}
  for(let i=0;i<90;i++)armor.update(a,1/60)
  camera.updateMatrixWorld(true)
  assert.ok(new Vector3(a.x,a.y+cameraFraming.armorTargetHeight,a.z).project(camera).x<-.2,'Aiming places Scott left of the centred sight line')
  assert.ok(armor.target.clone().project(camera).length()<1.1,'Aim focus remains within the view')
  armor.move({movementX:65,movementY:-18});armor.update(a,1/60)
  const sight=new Raycaster();sight.setFromCamera(new Vector2(0,0),camera)
  assert.ok(sight.ray.direction.dot(camera.getWorldDirection(new Vector3()))>.999999,'Centred shots use the current camera rotation, without a one-frame aim lag')
  runtime.gallant.aiming=false
  for(let i=0;i<90;i++)armor.update(a,1/60)
  assert.ok(armor.aimOffset<.00001,'Releasing aim restores the original Armor framing')
  armor.move({movementX:0,movementY:-230})
  assert.ok(armor.pitch<-.6,'Armor mouse aim must move beyond the former -0.1-radian ceiling')
  for(let i=0;i<100;i++)armor.update(a,1/60)
  assert.ok(camera.getWorldDirection(new Vector3()).y>.25,'The actual camera can aim upward at flying Scouts')
  assert.ok(camera.position.y>=.35,'Expanded upward aim still respects the terrain floor')
  armor.move({movementX:0,movementY:10000});assert.equal(armor.pitch,1.25)
  armor.move({movementX:0,movementY:-10000});assert.equal(armor.pitch,-1.1)
  runtime.armorController.active=false;armor.deactivate();entry.returnFlight=true;entry.returnProgress=0;entry.cameraProgress=null
  const start=camera.position.clone();driver.update(s,0);assert.ok(camera.position.distanceTo(start)<1e-8,'The reverse shot starts from the exact current Armor view')
  fov=camera.fov
  for(let i=0;i<=120;i++){entry.returnProgress=i/120;driver.update(s,1/60);assert.ok(camera.fov>=fov-1e-7);fov=camera.fov}
  assert.equal(camera.fov,cameraFraming.cycloneFov);assert.equal(orbit.enabled,true);assert.equal(orbit.enableDamping,true)
  const end=camera.position.clone();entry.returnFlight=false;entry.phase='idle';driver.update(s,1/60)
  assert.ok(camera.position.distanceTo(end)<.1,'Returning to gameplay cannot pop back into another frame')
  driver.setMode(3,s);entry.cameraProgress=.3;driver.update(s,1/60);entry.cameraProgress=null;driver.update(s,1/60)
  assert.ok(orbit.maxPolarAngle>Math.PI-.03,'Inspection mode retains its full vertical orbit after the cinematic')
  armor.dispose();driver.dispose();delete globalThis.document
})
