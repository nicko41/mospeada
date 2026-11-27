import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {AnimationMixer,Group,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {stage2PhysicsFixture} from '../../scripts/forest-stage2-physics.mjs'
import {ForestStage2Progress} from '../world/forest/forestStage2Progress.js'
import {stage2PathX} from '../world/forest/forestStage2Config.js'
import {canyonWallPoint} from '../world/forest/forestCanyon.js'
import {stage2Height} from '../world/forest/forestStage2Terrain.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {BikeDefeatMotion} from './BikeDefeatMotion.js'
import {ScottDefeatMotion} from './ScottDefeatMotion.js'
import {updateScottGameplay} from './scottGameplay.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {damagePlayer,resetPlayerCombat} from '../player/playerCombat.js'

test('canyon collision follows rendered eroded walls, catches swept fast travel and allows a high successful crossing',async()=>{
 const f=await stage2PhysicsFixture(),progress=new ForestStage2Progress()
 try{
  for(const x of [stage2PathX(-930),-45,65]){
   const wall=canyonWallPoint(x,.16,true,stage2Height),s={x,z:wall.z+5,height:wall.y-.85,airborne:true,riderMode:'mounted'}
   const hit=progress.sweepWall(s,x,wall.z-8,Math.PI)
   assert.ok(hit,`Wall collision at x=${x}`);assert.ok(hit.point.z<s.z);assert.ok(hit.normal.z>0);assert.ok(Math.abs(hit.point.y-wall.y)<1e-6);assert.ok(Math.abs(hit.point.z+930)>1,'Follows erosion rather than a flat landing edge')
   assert.equal(progress.sweepWall({...s,height:30},x,wall.z-8,Math.PI),null)
   assert.equal(progress.sweepWall({...s,airborne:false},x,wall.z-8,Math.PI),null)
  }
 }finally{f.dispose()}
})

test('Scott hits the wall then falls to the canyon floor in the same pose; pause and retry restore both actors',async()=>{
 const f=await stage2PhysicsFixture(),b=fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb'),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')
 const data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')),clips=[...asset.animations,...parseCycloneScottActions(data)],wrapper=new Group(),model=asset.scene,bones=new Map(),skins=[]
 wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
 const instance={model,sourceScene:model,bones,skins,sourceClips:asset.animations,mixer:new AnimationMixer(model),hands:[]},s=createBikeState({x:stage2PathX(-655),z:-655,yaw:Math.PI},f.rig.metrics,f.sample),runtime={state:s,vehicleRig:f.rig,scottBikeBody:f.rig.body,armorController:{active:false}}
 const wall=canyonWallPoint(s.x,.15,true,stage2Height),progress=new ForestStage2Progress();Object.assign(s,{z:wall.z+5,height:wall.y-.85,airborne:true,frontGrounded:false,rearGrounded:false,speed:40})
 runtime.canyonCrash=progress.sweepWall(s,s.x,wall.z-3,s.yaw);assert.ok(runtime.canyonCrash)
 const crash=runtime.canyonCrash;s.x=crash.point.x+crash.normal.x*1.4;s.z=crash.point.z+crash.normal.z*1.4;s.speed=0
 const pose=()=>updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60),bike=runtime.bikeDefeatMotion=new BikeDefeatMotion(f.rig,runtime),fall=instance.defeatMotion=new ScottDefeatMotion(instance,wrapper,runtime)
 resetPlayerCombat();f.rig.update(s,f.sample,bikeConfig);pose();damagePlayer(1000)
 const tick=(dt=1/60)=>{bike.advance(dt,f.sample);f.rig.update(s,f.sample,bikeConfig);bike.apply(f.sample);pose();fall.apply(dt,f.sample)}
 try{
  for(let i=0;i<40;i++)tick()
  const shoulder=new Vector3().subVectors(bones.get('mixamorigRightShoulder').getWorldPosition(new Vector3()),bones.get('mixamorigLeftShoulder').getWorldPosition(new Vector3())),spine=new Vector3().subVectors(bones.get('mixamorigSpine2').getWorldPosition(new Vector3()),bones.get('mixamorigHips').getWorldPosition(new Vector3()));assert.ok(spine.cross(shoulder).normalize().dot(crash.normal)<-.7,'Chest and face point into the wall');const hip=bones.get('mixamorigHips').getWorldPosition(new Vector3()),head=bones.get('mixamorigHead').getWorldPosition(new Vector3()),age=fall.age,position=f.rig.root.position.clone()
  assert.ok(head.y>hip.y+.3,`Head stays above hips at wall: ${head.y}, ${hip.y}`)
  const frozenPose=[...bones.values()].map(b=>b.quaternion.toArray())
  tick(0);assert.equal(fall.age,age);assert.ok(f.rig.root.position.distanceTo(position)<1e-7)
  for(let i=0;i<30;i++)tick()
  const mid=bones.get('mixamorigHips').getWorldPosition(new Vector3());assert.ok(mid.y<hip.y-2,'Scott drops after the brief splat');assert.equal(fall.contact,false)
  tick(0);assert.ok(mid.distanceTo(bones.get('mixamorigHips').getWorldPosition(new Vector3()))<1e-7,'Pause freezes Scott during his fall')
  for(let i=0;i<220;i++)tick()
  const end=bones.get('mixamorigHips').getWorldPosition(new Vector3());assert.ok(end.y<hip.y-20,'Scott falls to the bottom');assert.ok(fall.wallLanded&&fall.contact);assert.ok(bike.settled);assert.ok(runtime.defeat.ready);assert.ok(s.z>crash.point.z+4,'Bike clears the widening rock at the foot of the wall')
  const joint=name=>bones.get('mixamorig'+name).getWorldPosition(new Vector3())
  assert.ok(joint('LeftHand').distanceTo(joint('RightHand'))>1.15,'Native recovery frame leaves both arms open')
  assert.ok(joint('LeftFoot').distanceTo(joint('RightFoot'))>.55,'Native recovery frame leaves both legs open')
  assert.ok(Math.abs(joint('Head').y-end.y)<.08,'Scott rests flat on his back')
  assert.deepEqual([...bones.values()].map(b=>b.quaternion.toArray()),frozenPose,'The fall retains the existing pose without animating limbs')
  let min=Infinity;const p=new Vector3();for(const {mesh}of skins)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,p);mesh.localToWorld(p);min=Math.min(min,p.y-crash.floorAt(p.x,p.z))}assert.ok(min>-.02&&min<.04,`Scott rests on the canyon floor: ${min}`)
  fall.reset();bike.reset();runtime.canyonCrash=null;resetPlayerCombat();runtime.state=createBikeState({x:stage2PathX(-655),z:-655,yaw:Math.PI},f.rig.metrics,f.sample);f.rig.update(runtime.state,f.sample,bikeConfig);pose();assert.equal(runtime.defeat,null);assert.equal(bike.active,false)
 }finally{resetPlayerCombat();f.dispose()}
})
