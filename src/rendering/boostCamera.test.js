import test from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,PerspectiveCamera,Raycaster,Vector2,Vector3} from 'three'
import {BoostCameraFX,cycloneBoostAllowed} from './BoostCameraFX.js'
import {boostCameraState} from './boostCameraState.js'
import {BoostProtection} from './BoostProtection.js'
import {AnimeRenderer,materialProfile} from './AnimeRenderer.js'
import {CameraImpactFX} from './CameraImpactFX.js'
import {createCameraImpactEvents} from './cameraImpactEvents.js'
import {cameraImpactState} from './cameraImpactState.js'
import {bikeConfig} from '../vehicle/bikeConfig.js'
import {createBikeState,advanceBike} from '../vehicle/bikePhysics.js'

const config=boostCameraState.defaults
const cam=()=>{const c=new PerspectiveCamera(70,1.6,.1,3000);c.updateMatrixWorld(true);return c}
const runtime=()=>({state:{riderMode:'mounted',boostCount:0,boostTime:0,speed:45,boostMode:'ground'},transformEntry:{phase:'idle'},paused:false})
function start(r,fx){fx.sample(1/60,r,config,bikeConfig,true,false);r.state.boostCount++;r.state.boostTime=.55;r.state.speed=75;fx.sample(1/60,r,config,bikeConfig,true,false)}

test('boost feedback is Cyclone-only, including airborne boost, and never changes runtime state',()=>{
 const r=runtime();assert.equal(cycloneBoostAllowed(r,true,false),true)
 for(const patch of [{armorController:{active:true}},{state:{...r.state,riderMode:'onFoot'}},{opening:{active:true}},{ending:{holding:true}},{transformEntry:{phase:'transforming'}},{defeat:{}}])assert.equal(cycloneBoostAllowed({...r,...patch},true,false),false)
 assert.equal(cycloneBoostAllowed(r,false,false),false);assert.equal(cycloneBoostAllowed(r,true,true),false)
 r.state.airborne=true;r.state.boostMode='air';r.state.boostTime=.3;r.state.speed=100
 const before=JSON.stringify(r),fx=new BoostCameraFX();fx.sample(.1,r,config,{...bikeConfig,airBoostEnabled:true},true,false)
 assert.ok(fx.blurLevel>0&&fx.fovOffset>0);assert.equal(JSON.stringify(r),before)
 // Forest enables its own air preset; the accepted mode is authoritative
 // even when the global bike defaults do not enable airborne boost.
 r.state.boostTime=0;fx.sample(.1,r,config,{...bikeConfig,airBoostEnabled:false},true,false)
 assert.equal(fx.target,(100-bikeConfig.maxSpeed)/(bikeConfig.airBoostMaxSpeed-bikeConfig.maxSpeed))
 r.armorController={active:true};fx.sample(.1,r,config,bikeConfig,true,false);assert.equal(fx.blurLevel,0);assert.equal(fx.fovOffset,0)
})

test('native boost keeps blur and FOV with the start shake disabled and retains FX at excess speed',()=>{
 const metrics={frontZ:1,rearZ:-1,frontY:.4,rearY:.4,frontRadius:.4,rearRadius:.4,wheelbase:2},flat=()=>0
 const state=createBikeState({x:0,z:0,yaw:0},metrics,flat),r={...runtime(),state},fx=new BoostCameraFX();state.speed=60;state.parked=false
 fx.sample(1/60,r,config,bikeConfig,true,false)
 advanceBike(state,{throttle:1,boost:true},1/60,metrics,flat,()=>true,bikeConfig)
 const initial=JSON.stringify(state);fx.sample(1/60,r,config,bikeConfig,true,false)
 assert.equal(fx.started,false);assert.equal(JSON.stringify(state),initial);assert.ok(fx.fovOffset>0&&fx.fovOffset<config.maxFov*.2,'The first frame must still ease into the lens change')
 let impulses=0
 for(let i=0;i<60;i++){advanceBike(state,{throttle:1,boost:false},1/60,metrics,flat,()=>true,bikeConfig);fx.sample(1/60,r,config,bikeConfig,true,false);if(fx.started)impulses++}
 assert.equal(impulses,0);assert.equal(state.boostTime,0);assert.ok(state.speed>bikeConfig.maxSpeed);assert.ok(fx.blurLevel>0&&fx.fovOffset>0)
 const prior=fx.fovOffset
 state.speed=20;fx.sample(1/60,r,config,bikeConfig,true,false);assert.ok(fx.fovOffset>0&&fx.fovOffset<prior)
 for(let i=0;i<600;i++)fx.sample(1/60,r,config,bikeConfig,true,false)
 assert.equal(fx.fovOffset,0);assert.equal(fx.blurLevel,0)
})

test('ordinary fast travel does not trigger boost FX; entry/exit are consistent at 30/60/120 FPS',()=>{
 const values=[]
 for(const fps of [30,60,120]){
  const r=runtime(),fx=new BoostCameraFX();r.state.speed=80
  fx.sample(1/fps,r,config,bikeConfig,true,false);assert.equal(fx.blurLevel,0,'Normal travel must not masquerade as a boost')
  r.state.boostCount=1;r.state.boostTime=.55
  for(let i=0;i<fps;i++)fx.sample(1/fps,r,config,bikeConfig,true,false)
  values.push([fx.blurLevel,fx.fovOffset]);assert.ok(fx.fovOffset<=config.maxFov)
 }
 for(const v of values)assert.ok(Math.abs(v[0]-values[0][0])<1e-12&&Math.abs(v[1]-values[0][1])<1e-12)
})

test('FOV expands around the actual aiming ray without moving the base camera or changing logical shooting',()=>{
 for(const pointer of [new Vector2(0,0),new Vector2(.63,-.4),new Vector2(-.7,.5)])for(const zoom of [1,1.7]){
  const source=cam(),parent=new Group();parent.position.set(12,4,-8);parent.rotation.y=.7;parent.scale.setScalar(1.2);parent.add(source)
  source.position.set(.3,1,4);source.rotation.x=-.2;source.zoom=zoom;source.setViewOffset(1920,1080,80,40,1600,900);source.updateProjectionMatrix();source.updateWorldMatrix(true,false)
  const before=JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.matrixWorld.toArray(),source.projectionMatrix.toArray()]),fx=new BoostCameraFX(source),r=runtime();start(r,fx);fx.sample(.3,r,config,bikeConfig,true,false)
  const focus=pointer.clone().multiplyScalar(.5).addScalar(.5),present=fx.compose(source,null,config,focus),a=new Raycaster(),b=new Raycaster()
  a.setFromCamera(pointer,source);b.setFromCamera(pointer,present.camera)
  assert.ok(a.ray.origin.distanceTo(b.ray.origin)<1e-12);assert.ok(a.ray.direction.distanceTo(b.ray.direction)<1e-12,'The FOV effect shifted the aim ray')
  assert.deepEqual(present.camera.matrixWorld.toArray(),source.matrixWorld.toArray())
  const aim=a.ray.at(100,new Vector3()).project(present.camera);assert.ok(Math.abs(aim.x-pointer.x)<1e-12&&Math.abs(aim.y-pointer.y)<1e-12)
  assert.equal(JSON.stringify([source.position.toArray(),source.quaternion.toArray(),source.matrixWorld.toArray(),source.projectionMatrix.toArray()]),before)
  assert.ok(present.camera.fov>source.fov&&present.camera.fov<=source.fov+config.maxFov)
 }
})

test('blur, FOV and initial shake have independent settings; pause and reset cannot replay a start impulse',()=>{
 const r=runtime(),fx=new BoostCameraFX(),source=cam();start(r,fx);const fov=fx.fovOffset,blur=fx.blurLevel
 r.paused=true;for(let i=0;i<20;i++)fx.sample(.1,r,config,bikeConfig,true,false)
 assert.equal(fx.fovOffset,fov);assert.equal(fx.blurLevel,blur);assert.equal(fx.started,false)
 r.paused=false;fx.sample(1/60,r,config,bikeConfig,true,false);assert.equal(fx.started,false)
 const onlyBlur={...config,fovEnabled:false,shakeEnabled:false};for(let i=0;i<600;i++)fx.sample(1/60,r,onlyBlur,bikeConfig,true,false)
 assert.equal(fx.fovOffset,0);assert.ok(fx.blurLevel>0);assert.equal(fx.compose(source,null,onlyBlur,new Vector2(.5,.5)).camera,source)
 const onlyFov={...config,blurEnabled:false};for(let i=0;i<600;i++)fx.sample(1/60,r,onlyFov,bikeConfig,true,false)
 assert.equal(fx.blurLevel,0);assert.ok(fx.fovOffset>0)
 fx.reset(r.state);fx.sample(1/60,r,config,bikeConfig,true,false);assert.equal(fx.started,false)
})

test('boost impulse reuses the impact pool and is discarded in favor of combat without changing combat output',()=>{
 const source=cam(),player=new Vector3(),a=new CameraImpactFX(source),b=new CameraImpactFX(source),cfg=cameraImpactState.defaults
 const boost={kind:'boostStart',strength:.12,origin:{x:0,y:0,z:1}},hit={kind:'explosion',strength:1,origin:{x:3,y:0,z:1}}
 b.update(0,source,player,cfg,[boost]);a.update(0,source,player,cfg,[hit]);b.update(0,source,player,cfg,[hit,boost])
 a.update(1/60,source,player,cfg);b.update(1/60,source,player,cfg)
 assert.deepEqual(a.translation.toArray(),b.translation.toArray());assert.deepEqual(a.rotation.toArray(),b.rotation.toArray());assert.ok(!b.slots.some(s=>s.active&&s.kind==='boostStart'))
 const standalone=new CameraImpactFX(source),p=standalone.update(1/60,source,player,cfg,[boost]);assert.notEqual(p.camera,source);assert.equal(p.blurBlend,0)
 const disabled=new CameraImpactFX(source);assert.equal(disabled.update(1/60,source,player,{...cfg,shakeEnabled:false},[boost]).camera,source)
 const bus=createCameraImpactEvents();for(let i=0;i<8;i++)bus.emit('explosion',{x:i,y:0,z:0});bus.emit('boostStart',{x:0,y:0,z:1},.12);assert.ok(bus.drain().every(e=>e.kind==='explosion'))
 const r=runtime(),fx=new BoostCameraFX(source);start(r,fx);const original=p.camera.matrixWorld.toArray(),rotation=standalone.rotation.toArray()
 const composed=fx.compose(source,p,config,new Vector2(.56,.54));assert.deepEqual(composed.camera.matrixWorld.toArray(),original);assert.deepEqual(standalone.rotation.toArray(),rotation);assert.equal(composed.blurBlend,p.blurBlend)
})

test('existing hero mask stays unchanged; transparent Cyclone optics and rigid Scott accessories get additional protection',()=>{
 const rig=new Group();rig.name='Cyclone_riding_vehicle';rig.position.z=-5
 const glass=new Mesh(new BoxGeometry(.5,.5,.1),new MeshStandardMaterial({transparent:true,opacity:.4})),panel=new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial());rig.add(glass,panel)
 const scott=new Group();scott.name='Scott_original_playback';scott.position.set(2,0,-4)
 const gun=new Mesh(new BoxGeometry(.4,.2,.1),new MeshBasicMaterial());scott.add(gun)
 assert.equal(materialProfile(glass,glass.material).mask,0);assert.equal(materialProfile(panel,panel.material).mask,1);assert.equal(materialProfile(gun,gun.material).mask,0)
 const scene=new Group();scene.add(rig,scott)
 const effect=Object.assign(Object.create(AnimeRenderer.prototype),{scene,bindings:[],restore(){},variant:m=>m})
 effect.collect();assert.equal(effect.bindings.find(b=>b.object===glass).boostGroup,1);assert.equal(effect.bindings.find(b=>b.object===panel).boostGroup,0);assert.equal(effect.bindings.find(b=>b.object===gun).boostGroup,2)
 const protect=new BoostProtection(),source=cam(),rects=protect.update(effect.bindings,source,1000,800)
 for(const [object,i]of [[glass,0],[gun,1]]){
  const p=object.getWorldPosition(new Vector3()).project(source),uv=new Vector2(p.x*.5+.5,p.y*.5+.5),r=rects[i]
  assert.ok(uv.x>=r.x&&uv.x<=r.z&&uv.y>=r.y&&uv.y<=r.w)
 }
 rig.visible=false;scott.visible=false;protect.update(effect.bindings,source,1000,800);assert.ok(protect.rects.every(r=>r.x>r.z))
 glass.geometry.dispose();glass.material.dispose();panel.geometry.dispose();panel.material.dispose();gun.geometry.dispose();gun.material.dispose()
})

test('boost audition is deliberately exaggerated and settings remain bounded independently of combat',()=>{
 const previous=boostCameraState.snapshot(),impact=cameraImpactState.snapshot()
 try{
  assert.ok(config.maxFov>=12&&config.blurPixels>=40&&config.blurIntensity*config.peripheralIntensity>=.8&&config.shakeIntensity===1)
  boostCameraState.set({maxFov:90,blurPixels:99,shakeIntensity:Infinity,enterRate:NaN,blurEnabled:false})
  const s=boostCameraState.snapshot();assert.equal(s.maxFov,20);assert.equal(s.blurPixels,64);assert.equal(s.shakeIntensity,config.shakeIntensity);assert.equal(s.enterRate,config.enterRate);assert.equal(s.blurEnabled,false)
  assert.equal(cameraImpactState.snapshot(),impact)
 }finally{boostCameraState.set(previous)}
})
