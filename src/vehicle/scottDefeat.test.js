import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Group,Vector3,Quaternion,AnimationMixer} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ScottDefeatMotion,SCOTT_DEFEAT} from './ScottDefeatMotion.js'
import {damagePlayer,resetPlayerCombat,playerCombat,subscribePlayerHealth} from '../player/playerCombat.js'
import {BikeDefeatMotion,BIKE_DEFEAT} from './BikeDefeatMotion.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {updateScottGameplay} from './scottGameplay.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'

test('Scott health reaches zero once, ignores invalid damage, and resets at retry',()=>{
 resetPlayerCombat();let updates=0;const remove=subscribePlayerHealth(()=>updates++)
 try{
  for(const damage of [-20,NaN,Infinity,0])damagePlayer(damage)
  assert.equal(playerCombat.playerHealth,100);assert.equal(updates,0)
  damagePlayer(20,{x:1,y:0,z:2});assert.equal(playerCombat.playerHealth,80);assert.equal(playerCombat.dead,false)
  damagePlayer(1000);assert.equal(playerCombat.playerHealth,0);assert.equal(playerCombat.dead,true);const version=playerCombat.hitVersion
  damagePlayer(20);assert.equal(playerCombat.hitVersion,version)
  resetPlayerCombat();assert.equal(playerCombat.playerHealth,100);assert.equal(playerCombat.dead,false)
 }finally{remove();resetPlayerCombat()}
})

test('mounted defeat ejects Scott backward, coasts then drops the bike onto its right, and retries cleanly',async()=>{
 const load=async file=>{const b=fs.readFileSync(file);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
 const [bike,asset]=await Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('public/models/mospeada/scott-bernard-animated-original.glb')])
 const data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')),clips=[...asset.animations,...parseCycloneScottActions(data)]
 const flat=()=>0,rig=createDrivingCyclone(bike.scene),model=asset.scene,wrapper=new Group(),bones=new Map(),skins=[];wrapper.add(model)
 model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
 const instance={model,sourceScene:asset.scene,bones,skins,sourceClips:asset.animations,mixer:new AnimationMixer(model),hands:[]}
 const s=createBikeState({x:2,z:5,yaw:.7},rig.metrics,flat),runtime={state:s,vehicleRig:rig,scottBikeBody:rig.body,armorController:{active:false}}
 s.speed=14;s.idleBlend=0
 const pose=()=>updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60)
 resetPlayerCombat();rig.update(s,flat,bikeConfig);pose()
 const start=new Vector3(s.x,0,s.z),hipStart=bones.get('mixamorigHips').getWorldPosition(new Vector3()),forward=new Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw))
 const motion=runtime.bikeDefeatMotion=new BikeDefeatMotion(rig,runtime),fall=instance.defeatMotion=new ScottDefeatMotion(instance,wrapper,runtime)
 const tick=(dt=1/60,canMove=()=>true)=>{motion.advance(dt,flat,canMove);rig.update(s,flat,bikeConfig);motion.apply(flat);pose();fall.apply(dt,flat)}
 try{
  damagePlayer(1000)
  for(let i=0;i<20;i++)tick()
  assert.ok(new Vector3(s.x,0,s.z).sub(start).dot(forward)>.5,'Bike continues after Scott is ejected')
  assert.ok(Math.abs(rig.body.rotation.z)<1e-8,'Bike remains upright before the delayed fall')
  const position=rig.root.position.clone(),q=rig.body.quaternion.clone(),head=bones.get('mixamorigHead').getWorldPosition(new Vector3()),age=motion.age
  tick(0);assert.equal(motion.age,age);assert.ok(position.distanceTo(rig.root.position)<1e-7);assert.ok(q.angleTo(rig.body.quaternion)<1e-7);assert.ok(head.distanceTo(bones.get('mixamorigHead').getWorldPosition(new Vector3()))<1e-7)
  for(let i=0;i<200;i++)tick()
  assert.ok(motion.settled);assert.ok(runtime.defeat.ready);assert.ok(motion.age>BIKE_DEFEAT.fallDelay+BIKE_DEFEAT.fallSeconds)
  assert.ok(Math.abs(rig.body.rotation.z-Math.PI/2)<1e-7,'Bike lies on the rider right (-X)')
  const hip=bones.get('mixamorigHips').getWorldPosition(new Vector3())
  assert.ok(hip.clone().sub(hipStart).dot(forward)<-1,'Scott moves backward independently of the bike')
  assert.ok(hip.distanceTo(new Vector3(s.x,hip.y,s.z))>3,'Scott is clear of the abandoned bike')
  const p=new Vector3();let bodyMin=Infinity,bikeMin=Infinity
  for(const {mesh} of skins)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,p);mesh.localToWorld(p);bodyMin=Math.min(bodyMin,p.y)}
  for(const mesh of rig.surfaces)if(mesh.visible)for(let i=0;i<mesh.geometry.attributes.position.count;i++){p.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.localToWorld(p);bikeMin=Math.min(bikeMin,p.y)}
  assert.ok(bodyMin>=-.015&&bodyMin<.03,`Scott rests on ground: ${bodyMin}`)
  assert.ok(bikeMin>=-.015&&bikeMin<.03,`Bike rests on ground: ${bikeMin}`)
  fall.reset();motion.reset();resetPlayerCombat();runtime.state=createBikeState({x:2,z:5,yaw:.7},rig.metrics,flat);rig.update(runtime.state,flat,bikeConfig);pose()
  assert.equal(runtime.defeat,null);assert.equal(rig.body.rotation.z,0);assert.ok(bones.get('mixamorigHead').getWorldPosition(new Vector3()).y>1)
  motion.advance(1/60,flat,()=>false);assert.equal(runtime.state.x,2);assert.equal(runtime.state.z,5);assert.equal(runtime.state.speed,0)
 }finally{resetPlayerCombat()}
})

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
test('native defeat falls onto the back, respects ground and pause, and restores geometry/poses for retry',async()=>{
 const b=fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb'),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')
 const model=asset.scene,wrapper=new Group(),bones=new Map(),skins=[];wrapper.add(model);wrapper.position.y=3
 model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
 const mixer=new AnimationMixer(model),walk=asset.animations.find(c=>c.name==='Walking');mixer.clipAction(walk).play();mixer.setTime(.12);wrapper.updateMatrixWorld(true)
 const before=[...bones.values()].map(b=>({b,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()})),position=wrapper.position.clone(),geometries=skins.map(s=>s.mesh.geometry),values=asset.animations.map(c=>c.tracks.map(t=>Array.from(t.values)))
 const sourceForward=model.getObjectByName('mixamorigSpine2').getWorldQuaternion(new Quaternion()).invert(),runtime={state:{verticalVelocity:0},armorController:{active:false}},instance={model,bones,skins,sourceClips:asset.animations},fall=new ScottDefeatMotion(instance,wrapper,runtime)
 for(let i=0;i<220;i++){fall.restore();fall.apply(1/60,()=>0);assert.ok(Number.isFinite(wrapper.position.y));assert.ok(runtime.defeat.age>=0)}
 assert.equal(runtime.defeat.ready,true);assert.ok(fall.contact);assert.ok(fall.age>SCOTT_DEFEAT.retrySeconds)
 const head=bones.get('mixamorigHead').getWorldPosition(new Vector3()),hips=bones.get('mixamorigHips').getWorldPosition(new Vector3())
 assert.ok(Math.abs(head.y-hips.y)<.08,'Head and pelvis finish in a lying pose')
 const front=new Vector3(0,0,1).applyQuaternion(bones.get('mixamorigSpine2').getWorldQuaternion(new Quaternion()).multiply(sourceForward))
 assert.ok(front.y>.75,'Scott finishes face up, not face down')
 const age=fall.age,pose=head.clone();fall.restore();fall.apply(0,()=>0);assert.equal(fall.age,age);assert.ok(bones.get('mixamorigHead').getWorldPosition(new Vector3()).distanceTo(pose)<1e-7)
 assert.deepEqual(asset.animations.map(c=>c.tracks.map(t=>Array.from(t.values))),values,'No original animation values are edited')
 skins.forEach((s,i)=>assert.equal(s.mesh.geometry,geometries[i]))
 fall.reset();assert.equal(runtime.defeat,null);assert.ok(wrapper.position.distanceTo(position)<1e-7)
 for(const r of before){assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.quaternion.toArray(),r.q);assert.deepEqual(r.b.scale.toArray(),r.s)}
})
