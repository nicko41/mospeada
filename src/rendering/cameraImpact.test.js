import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,PerspectiveCamera,Raycaster,Vector2,Vector3} from 'three'
import {CameraImpactFX,CAMERA_IMPACT_LIMITS} from './CameraImpactFX.js'
import {cameraImpactState} from './cameraImpactState.js'
import {createCameraImpactEvents,cameraImpactEvents} from './cameraImpactEvents.js'
import {cameraImpactAllowed,sampleImpactPlayer,sampleImpactFocus,subscribeCameraImpactDamage} from './cameraImpactGameplay.js'
import {playerCombat,damagePlayer,resetPlayerCombat} from '../player/playerCombat.js'
import {Plano3CombatVFX} from '../vfx/Plano3CombatVFX.js'
import {AnimeRenderer} from './AnimeRenderer.js'
import {CycloneShooterEncounter} from '../world/forest/CycloneShooterEncounter.js'

const config={...cameraImpactState.defaults},player=new Vector3(),camera=()=>{const c=new PerspectiveCamera(70,1.6,.1,3000);c.updateMatrixWorld(true);return c}
const event=(x=0,kind='explosion',y=0,z=-2)=>({kind,strength:1,origin:{x,y,z}})
function pulse(events,cfg=config){const fx=new CameraImpactFX(),c=camera();fx.update(0,c,player,cfg,events);const result=fx.update(1/60,c,player,cfg);return{fx,c,result}}

test('Invid explosions shake while orb contacts and scenery explosions cannot shake',()=>{
 const near=pulse([event(0,'explosion',0,-2)]),far=pulse([event(0,'explosion',0,-12)]),outside=pulse([event(0,'explosion',0,-config.range)])
 assert.ok(near.fx.rotation.length()>far.fx.rotation.length());assert.ok(far.fx.rotation.length()>0)
 assert.equal(outside.result.camera,outside.c);assert.equal(outside.fx.slots.some(s=>s.active),false)
 for(const kind of ['enemyImpact','environmentExplosion']){
  const hit=pulse([event(2,kind)]);assert.equal(hit.result.camera,hit.c);assert.equal(hit.fx.translation.length(),0);assert.equal(hit.fx.rotation.length(),0)
  assert.equal(hit.result.blurBlend>0,kind!=='enemyImpact','Existing impact blur remains independent of shake')
  const baseline=pulse([event(2,kind)],{...config,explosionPower:1});assert.equal(hit.result.blurBlend,baseline.result.blurBlend);assert.equal(hit.result.blurPixels,baseline.result.blurPixels,'Invid power must not amplify other effects')
 }
 const explosion=event(2),alone=pulse([explosion]),withOrb=pulse([explosion,event(1,'enemyImpact')]);assert.deepEqual(withOrb.fx.translation.toArray(),alone.fx.translation.toArray());assert.deepEqual(withOrb.fx.rotation.toArray(),alone.fx.rotation.toArray())
})

test('Scott hits produce a subtle 200 ms shake independent of Invid power, preserving aim and the blur toggle',()=>{
 for(const fps of [10,30,60,120]){
  const c=camera(),fx=new CameraImpactFX(c),before=c.matrixWorld.toArray(),point=new Vector3(0,0,-50),baseline=point.clone().project(c)
  let pixels=0
  for(let i=0;i<Math.ceil(.4*fps);i++){
   const result=fx.update(1/fps,c,player,config,i===0?[event(2,'directHit')]:[])
   const p=point.clone().project(result.camera)
   pixels=Math.max(pixels,Math.hypot((p.x-baseline.x)*960,(p.y-baseline.y)*540))
   assert.ok(fx.translation.length()<.02);assert.ok(fx.rotation.length()<.005)
   assert.deepEqual(c.matrixWorld.toArray(),before)
   if(i/fps>=.2)assert.equal(result.camera,c)
  }
  assert.ok(pixels>.2&&pixels<5,`Subtle Scott hit at ${fps} FPS: ${pixels} px`)
 }
 const hit=pulse([event(2,'directHit')]),plain=pulse([event(2,'directHit')],{...config,explosionPower:1})
 assert.deepEqual(hit.fx.translation.toArray(),plain.fx.translation.toArray())
 assert.deepEqual(hit.fx.rotation.toArray(),plain.fx.rotation.toArray())
 const shakeOnly=pulse([event(2,'directHit')],{...config,blurEnabled:false})
 assert.notEqual(shakeOnly.result.camera,shakeOnly.c);assert.equal(shakeOnly.result.blurBlend,0)
 assert.equal(pulse([event(2,'directHit')],{...config,shakeEnabled:false}).fx.translation.length(),0)
})

test('violet drone deaths reduce only shake amplitude, preserving explosion blur, timing and all untagged enemies',()=>{
 cameraImpactEvents.clear()
 const drone=new CycloneShooterEncounter().drones[0];drone.position.set(2,0,-2)
 const vfx=Object.assign(Object.create(Plano3CombatVFX.prototype),{visuals:new Map(),point:new Vector3(),clock:0,stats:{explosions:0},presets:{invidExplosion:{groundGap:.5,bodyOffset:.5}},emitDeathEnergy(){},impacts:{spawn:()=>({seed:1})}})
 vfx.destroyTarget(drone);const droneEvent=cameraImpactEvents.drain()[0]
 vfx.destroyTarget({position:drone.position.clone()});const normalEvent=cameraImpactEvents.drain()[0]
 assert.equal(droneEvent.shakeScale,.35);assert.equal('shakeScale' in normalEvent,false);assert.equal(droneEvent.strength,normalEvent.strength)
 const a=pulse([normalEvent]),b=pulse([droneEvent])
 for(let i=0;i<70;i++){
  assert.ok(b.fx.translation.distanceTo(a.fx.translation.clone().multiplyScalar(.35))<1e-12)
  assert.ok(b.fx.rotation.distanceTo(a.fx.rotation.clone().multiplyScalar(.35))<1e-12)
  assert.equal(b.result.blurBlend,a.result.blurBlend);assert.equal(b.result.blurPixels,a.result.blurPixels)
  a.result=a.fx.update(1/60,a.c,player,config);b.result=b.fx.update(1/60,b.c,player,config)
 }
 cameraImpactEvents.clear()
})

test('left/right and above/below sources produce opposing directional reactions',()=>{
 const left=pulse([event(-3,'explosion')]).fx,right=pulse([event(3,'explosion')]).fx
 assert.ok(left.translation.x>0&&right.translation.x<0);assert.ok(left.rotation.y>0&&right.rotation.y<0)
 const above=pulse([event(0,'explosion',3,0)]).fx,below=pulse([event(0,'explosion',-3,0)]).fx
 assert.ok(above.translation.y<0&&below.translation.y>0);assert.ok(above.rotation.x>0&&below.rotation.x<0)
})

test('presentation camera cannot change a parented gameplay camera, its projection, aiming ray or player state',()=>{
 const root=new Group(),source=camera();root.position.set(14,3,-7);root.rotation.y=.7;root.scale.setScalar(1.2);root.add(source)
 source.position.set(2,1,4);source.rotation.x=-.2;source.zoom=1.4;source.updateProjectionMatrix();source.updateWorldMatrix(true,false)
 const matrices=()=>[...source.position.toArray(),...source.quaternion.toArray(),...source.scale.toArray(),...source.matrix.toArray(),...source.matrixWorld.toArray(),...source.matrixWorldInverse.toArray(),...source.projectionMatrix.toArray()]
 const before=matrices(),ray=new Raycaster();ray.setFromCamera(new Vector2(.12,.08),source);const origin=ray.ray.origin.clone(),direction=ray.ray.direction.clone()
 const state={speed:28,yaw:.7,steer:.15,x:14,z:-7},snapshot=JSON.stringify(state),fx=new CameraImpactFX()
 fx.update(0,source,player,config,[event(3,'explosion')]);const result=fx.update(1/60,source,player,config)
 assert.notEqual(result.camera,source);assert.equal(result.camera.parent,null);assert.deepEqual(matrices(),before)
 assert.deepEqual(result.camera.projectionMatrix.toArray(),source.projectionMatrix.toArray())
 ray.setFromCamera(new Vector2(.12,.08),source);assert.deepEqual(ray.ray.origin.toArray(),origin.toArray());assert.deepEqual(ray.ray.direction.toArray(),direction.toArray())
 assert.equal(JSON.stringify(state),snapshot)
})

test('simultaneous barrages have bounded slots, translation and rotation and expire quickly at every frame rate',()=>{
 const burst=Array.from({length:200},(_,i)=>event(1+i*.001,'explosion'))
 for(const fps of [10,30,60,120]){
  const fx=new CameraImpactFX(),c=camera();fx.update(0,c,player,config,burst)
  for(let n=0;n<fps;n++){
   const result=fx.update(1/fps,c,player,config)
   assert.ok(fx.slots.filter(s=>s.active).length<=4);assert.ok(fx.translation.length()<=CAMERA_IMPACT_LIMITS.translation*config.explosionPower);assert.ok(fx.rotation.length()<=CAMERA_IMPACT_LIMITS.rotation*config.explosionPower)
   if(n/fps>Math.max(config.duration,config.blurDuration)*(1+(config.explosionPower-1)*.2)){assert.equal(result.camera,c);assert.equal(fx.slots.some(s=>s.active),false)}
  }
 }
 const results=[30,60,120].map(fps=>{const fx=new CameraImpactFX(),c=camera();fx.update(0,c,player,config,[event(3,'explosion')]);for(let i=0;i<fps/10;i++)fx.update(1/fps,c,player,config);return fx.translation.clone()})
 assert.ok(results.every(v=>v.distanceTo(results[0])<1e-12))
 const one=pulse(burst,{...config,maxConcurrent:1});assert.equal(one.fx.slots.filter(s=>s.active).length,1)
 const slow=new CameraImpactFX(),c=camera(),cfg={...config,blurEnabled:true}
 const birth=slow.update(.2,c,player,cfg,[event(2,'explosion')]);assert.notEqual(birth.camera,c);assert.ok(birth.blurBlend>0,'A short pulse must not disappear between slow frames')
 const expired=slow.update(Math.max(cfg.duration,cfg.blurDuration)*(1+(cfg.explosionPower-1)*.2),c,player,cfg);assert.equal(expired.camera,c);assert.equal(expired.blurBlend,0)
})

test('shake and blur toggle independently; blur is brief, close-range and excludes ordinary nearby impacts',()=>{
 const blurOnly={...config,shakeEnabled:false,blurEnabled:true}
 const direct=pulse([event(4,'directHit')],blurOnly);assert.equal(direct.result.camera,direct.c);assert.ok(direct.result.blurBlend>0);assert.equal(direct.fx.translation.length(),0)
 assert.equal(pulse([event(0,'explosion',0,-config.blurRange)],blurOnly).result.blurBlend,0)
 assert.ok(pulse([event(0,'explosion',0,-2)],blurOnly).result.blurBlend>0)
 assert.equal(pulse([event(0,'enemyImpact',0,-1)],blurOnly).result.blurBlend,0)
 assert.equal(pulse([event(0,'directHit')],{...config,blurEnabled:false}).result.blurBlend,0,'Blur toggle must still work in the high-intensity audition')
 assert.equal(direct.fx.update(config.blurDuration,direct.c,player,blurOnly).blurBlend,0)
 const disabled=direct.fx.update(0,direct.c,player,{...blurOnly,blurEnabled:false},[event(1,'directHit')]);assert.equal(disabled.camera,direct.c);assert.equal(disabled.blurBlend,0);assert.ok(direct.fx.slots.every(s=>!s.active))
})

test('queue copies reused FX vectors, deduplicates one contact and drops excess or malformed events',()=>{
 const bus=createCameraImpactEvents(),p=new Vector3(1,2,3)
 bus.emit('explosion',p,.4);bus.emit('explosion',p,.8);p.set(90,90,90)
 assert.deepEqual(bus.drain(),[{kind:'explosion',origin:{x:1,y:2,z:3},strength:.8}])
 for(let i=0;i<100;i++)bus.emit('enemyImpact',{x:i,y:0,z:0},.5)
 bus.emit('directHit',null);bus.emit('explosion',{x:NaN,y:0,z:0});bus.emit('muzzle',p)
 const pending=bus.drain();assert.equal(pending.length,8);assert.ok(pending.some(e=>e.kind==='directHit'))
 const generation=bus.generation,runtime={state:{}};const unbind=bus.bind(runtime);assert.equal(bus.runtime,runtime);assert.ok(bus.generation>generation);unbind();assert.equal(bus.runtime,null)
 const stop=bus.bind({state:{x:0,z:0,height:0}})
 for(let i=0;i<12;i++)bus.emit('explosion',{x:100+i,y:0,z:0},1)
 bus.emit('explosion',{x:2,y:0,z:0},.2);bus.emit('directHit',{x:300,y:0,z:0})
 const prioritized=bus.drain();assert.ok(prioritized.some(e=>e.origin.x===2));assert.ok(prioritized.some(e=>e.kind==='directHit'));stop()
})

test('accepted health hits emit visual feedback without changing damage rules; reset clears old impacts',()=>{
 const previous={...playerCombat,hitSource:{...playerCombat.hitSource}},bus=createCameraImpactEvents();let resets=0
 resetPlayerCombat();const stop=subscribeCameraImpactDamage(bus,()=>resets++)
 try{
  const hp=playerCombat.playerHealth,version=playerCombat.hitVersion
  for(const damage of [0,-1,NaN,Infinity])damagePlayer(damage,{x:3,y:1,z:0})
  assert.equal(bus.drain().length,0);assert.equal(playerCombat.hitVersion,version)
  damagePlayer(10,{x:3,y:1,z:0},{kind:'scout-projectile'})
  assert.equal(playerCombat.playerHealth,hp-10);assert.equal(playerCombat.hitVersion,version+1)
  assert.deepEqual(bus.drain(),[{kind:'directHit',origin:{x:3,y:1,z:0},strength:1}])
  bus.emit('explosion',player);resetPlayerCombat();assert.equal(resets,1);assert.equal(bus.drain().length,0)
 }finally{stop();Object.assign(playerCombat,previous)}
})

test('pause, cinematics, defeat and loading suppress feedback; listener follows Scott rather than an orbiting camera',()=>{
 const r={state:{x:4,height:2,z:-10,riderMode:'mounted'},transformEntry:{phase:'idle'}}
 assert.equal(cameraImpactAllowed(r,true,false),true)
 for(const extra of [{paused:true},{opening:{active:true}},{ending:{holding:true}},{defeat:{}},{canyonCrash:{}},{transformEntry:{phase:'transforming'}}])assert.equal(cameraImpactAllowed({...r,...extra},true,false),false)
 assert.equal(cameraImpactAllowed(r,false,false),false);assert.equal(cameraImpactAllowed(r,true,true),false)
 assert.equal(cameraImpactAllowed({...r,transformEntry:{phase:'complete'}},true,false),true)
 assert.deepEqual(sampleImpactPlayer(r,new Vector3()).toArray(),[4,2.9,-10])
 r.state={...r.state,riderMode:'onFoot',pedestrian:{x:30,z:50,ground:3}};assert.deepEqual(sampleImpactPlayer(r,new Vector3()).toArray(),[30,3.9,50])
 const hip=new Group();hip.position.set(8,4,12);r.scottInstance={bones:new Map([['mixamorigHips',hip]])};assert.deepEqual(sampleImpactPlayer(r,new Vector3()).toArray(),[8,4,12])
 r.gallant={mounted:true,pointer:new Vector2(.2,-.3)};assert.deepEqual(sampleImpactFocus(r,new Vector2()).toArray(),[.6,.35]);r.gallant.mounted=false;assert.deepEqual(sampleImpactFocus(r,new Vector2()).toArray(),[.5,.5])
 const fx=pulse([event(0,'directHit')]).fx;fx.reset();assert.ok(fx.slots.every(s=>!s.active));assert.equal(fx.translation.length(),0)
})

test('real VFX entry points publish Invid explosions but orb/ground/claw contacts never request camera feedback',()=>{
 cameraImpactEvents.clear()
 const fx=Object.assign(Object.create(Plano3CombatVFX.prototype),{emitDeathEnergy(){},impacts:{spawn(){}},impactDust:{burst(){}},sampleGround:()=>0,contactNormal:new Vector3()})
 fx.emit(new Vector3(1,1,1),true,null,'invidExplosion',.6);assert.equal(cameraImpactEvents.drain()[0].kind,'explosion')
 fx.emit(new Vector3(1,1,1),false,null,'invidHit');assert.equal(cameraImpactEvents.drain().length,0)
 fx.emit(new Vector3(1,1,1),true,null,'invidExplosion',.25,{cameraShake:false});assert.equal(cameraImpactEvents.drain()[0].kind,'environmentExplosion')
 fx.enemyWorldImpact(new Vector3(1,0,1));assert.equal(cameraImpactEvents.drain().length,0)
 fx.clawGroundImpact(new Vector3(1,0,1));assert.equal(cameraImpactEvents.drain().length,0)
 fx.emit=()=>{};fx.axis=new Vector3(0,1,0);fx.enemyImpact(new Vector3(1,2,1));assert.equal(cameraImpactEvents.drain().length,0);cameraImpactEvents.clear()
})

test('render-only camera is passed to the scene draw and renderer cleanup still runs on failure',()=>{
 const logical=camera(),presented=camera(),scene={background:null},prior={},target={textures:[{},{}]},calls=[]
 const renderer={autoClear:true,getRenderTarget:()=>prior,getClearColor:c=>c.set(0),getClearAlpha:()=>1,setRenderTarget:t=>calls.push(t),setClearColor(){},clear(){},getContext:()=>({COLOR:0,clearBufferfv(){}}),render(s,c){assert.equal(c,presented);throw Error('simulated render failure')}}
 let restored=false
 const effect=Object.assign(Object.create(AnimeRenderer.prototype),{camera:logical,scene,renderer,zero:new Float32Array(4),apply(){},restore(){restored=true}})
 const pose=logical.matrixWorld.toArray()
 assert.throws(()=>effect.drawSceneTarget(target,presented),/simulated/);assert.equal(effect.camera,logical);assert.deepEqual(logical.matrixWorld.toArray(),pose);assert.equal(restored,true);assert.equal(calls.at(-1),prior)
})

test('combat audition enables strong shake and blur while still clamping invalid settings',()=>{
 const previous=cameraImpactState.snapshot()
 try{
  cameraImpactState.reset();assert.equal(cameraImpactState.snapshot().blurEnabled,true);assert.ok(cameraImpactState.snapshot().duration>=.5&&config.intensity===1&&config.range>=100)
  cameraImpactState.set({intensity:900,duration:8,damping:NaN,maxConcurrent:200,blurPixels:200});const s=cameraImpactState.snapshot()
  assert.equal(s.intensity,1);assert.equal(s.duration,.7);assert.equal(s.damping,config.damping);assert.equal(s.maxConcurrent,4);assert.equal(s.blurPixels,24)
 }finally{cameraImpactState.set(previous)}
})

test('high-intensity audition produces conspicuous close explosions at every frame rate',()=>{
 const player=new Vector3(),point=new Vector3(0,0,-50)
 for(const fps of [10,30,60,120])for(const origin of [[2,0,-2],[0,-.8,-2],[0,.8,-2]]){
  const c=camera(),fx=new CameraImpactFX(c),baseline=point.clone().project(c);let pixels=0
  for(let n=0;n<Math.ceil(config.duration*fps)+2;n++){
   const result=fx.update(1/fps,c,player,config,n===0?[event(origin[0],'explosion',origin[1],origin[2])]:[])
   const projected=point.clone().project(result.camera)
   pixels=Math.max(pixels,Math.hypot((projected.x-baseline.x)*960,(projected.y-baseline.y)*540))
  }
  assert.ok(pixels>=25,`Violent Invid destruction must be unmistakable at ${fps} FPS; got ${pixels} px`)
  assert.ok(pixels<200,`Accumulation remains bounded in audition: ${pixels} px`)
 }
})
