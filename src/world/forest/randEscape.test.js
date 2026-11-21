import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {PerspectiveCamera,Vector3} from 'three'
import {RandDesertEscape} from './RandDesertEscape.js'
import {createRandCyclone} from '../../vehicle/createRandCyclone.js'
import {DesertScoutPatrol,SCOUT_PATROL} from './DesertScoutPatrol.js'
import {createScoutView} from './invidScoutAsset.js'
import {createEnergyProjectiles,launchEnergyProjectile,advanceEnergyProjectiles} from '../../vehicle/EnergyProjectiles.js'
import {GallantHitscan} from '../../vehicle/GallantShot.js'
import {boxCollider,registerColliders} from '../../player/collisionWorld.js'
import {Box3} from 'three'
import {RandRider} from '../../vehicle/RandRider.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {createBikeState} from '../../vehicle/bikePhysics.js'
import {createDrivingCyclone} from '../../vehicle/createDrivingCyclone.js'
import {CycloneSoilLayer} from '../../vehicle/CycloneSoilLayer.js'
import {WheelContacts} from '../../vehicle/WheelContacts.js'
import {createSoilLoad,evolveSoil} from '../../vehicle/weatheringModel.js'
import {weatheringState} from '../../vehicle/weatheringState.js'
import {equipmentSoil} from '../../vehicle/equipmentSoilLimit.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const metrics={frontZ:1,rearZ:-1,frontY:.4,rearY:.4,frontRadius:.4,rearRadius:.4,wheelbase:2}
const world={bound:true,position:new Vector3(),distance:z=>-z,contains:(x,z)=>Math.abs(x)<=2400&&z<=0&&z>=-2400}

test('Rand keeps fleeing on real terrain indefinitely, pauses exactly and stays inside the desert while Scott relocates',()=>{
 const sample=(x,z)=>.01*x+.006*z,r=new RandDesertEscape(sample,metrics),s={x:0,z:-590}
 for(let i=0;i<12000;i++){
  s.x=Math.sin(i/3000)*1800;s.z=-590-Math.min(1550,i*.2);const before=r.position.clone();r.update(1/60,s,world,true)
  if(i)assert.ok(r.position.distanceTo(before)<.5,'Continuous route, including course wraps')
  assert.ok(world.contains(r.x,r.z));assert.ok(world.distance(r.z)>620);assert.ok(Math.abs(r.height-sample(r.x,r.z))<.35,'Sprung chassis follows the terrain without rigidly copying its height');assert.ok(r.speed>14&&r.speed<23)
 }
 const before=r.position.clone(),spin=r.state.frontSpin;r.update(0,s,world,true);assert.equal(r.position.distanceTo(before),0);assert.equal(r.state.frontSpin,spin)
 r.reset();assert.equal(r.active,false);r.update(.1,s,world,false);assert.equal(r.active,false)
})

test('Rand has an editable private bike source and independent geometry/materials without adding scene lights',async()=>{
 const source=await load('public/models/mospeada/cyclone-vr052f.glb'),original=source.scene.getObjectByProperty('isMesh',true),position=original.geometry.attributes.position.array.slice(),color=original.material.color.clone(),bike=createRandCyclone(source.scene)
 try{
  assert.equal(bike.root.name,'Rand_Cyclone');assert.equal(bike.root.userData.owner,'Rand');let lights=0;bike.root.traverse(o=>{if(o.isLight)lights++});assert.equal(lights,0)
  const a=bike.surfaces.find(m=>m.userData.sourcePiece===original.userData.sourcePiece);assert.notEqual(a.geometry,original.geometry);assert.notEqual(a.material,original.material)
  a.geometry.attributes.position.setX(0,10);a.material.color.set('#ff0000');assert.deepEqual(original.geometry.attributes.position.array,position);assert.ok(original.material.color.equals(color))
  assert.ok(fs.existsSync('assets/rand-cyclone/cyclone-rand.glb'))
 }finally{bike.dispose()}
})

test('Rand’s actual moving Cyclone samples tire contacts and accumulates unrestricted bike soil with Scott’s existing shader',async()=>{
 const source=await load('public/models/mospeada/rand-cyclone.glb'),rig=createRandCyclone(source.scene),scott=createDrivingCyclone(source.scene),layer=new CycloneSoilLayer(rig),scottLayer=new CycloneSoilLayer(scott),contacts=new WheelContacts(rig,(x,z,w)=>{Object.assign(w,{surface:'dirt',biome:'desert',earthWeight:1});return 0}),sample=()=>0,escape=new RandDesertEscape(sample,rig.metrics),loadState=createSoilLoad(),config={...weatheringState.defaults},player={x:0,z:-800}
 layer.install();scottLayer.install()
 try{
  let grounded=0,turning=0,frontMin=Infinity,frontMax=-Infinity,rearMin=Infinity,rearMax=-Infinity
  for(let i=0;i<1200;i++){
   escape.update(.1,player,world,true);rig.update(escape.state,sample,bikeConfig)
   frontMin=Math.min(frontMin,rig.articulation.frontTravel);frontMax=Math.max(frontMax,rig.articulation.frontTravel);rearMin=Math.min(rearMin,rig.articulation.rearTravel);rearMax=Math.max(rearMax,rig.articulation.rearTravel)
   const wheels=contacts.update(escape.state)
   if(wheels.front.grounded&&wheels.rear.grounded)grounded++
   if(Math.abs(escape.state.rearLateralVelocity)>.01)turning++
   evolveSoil(loadState,wheels,escape.state,config,0,.1,rig.metrics,.7)
  }
  assert.ok(grounded>1100&&turning>100,'Real wheel positions and cornering data feed the reused responses')
  assert.ok(frontMax-frontMin>.005&&rearMax-rearMin>.005,'Existing front forks and rear swingarm visibly move through their suspension travel')
  assert.ok(frontMin>=-bikeConfig.forkExtension-.001&&frontMax<=bikeConfig.forkCompression+.001)
  assert.ok(rearMin>=-bikeConfig.rearExtension-.001&&rearMax<=bikeConfig.rearCompression+.001)
  const paused=JSON.stringify(escape.state);escape.update(0,player,world,true);assert.equal(JSON.stringify(escape.state),paused,'Pause freezes both sprung supports and the route')
  assert.ok(loadState.frontMud>.25&&loadState.rearMud>.25&&loadState.frontFilm>.25)
  layer.update(loadState,config);scottLayer.update(createSoilLoad(),config)
  assert.ok(layer.uniforms.uSoilLoad.value.x>.25);assert.equal(layer.uniforms.uBikeSoilCoverageMax.value,.79)
  assert.deepEqual(scottLayer.uniforms.uSoilLoad.value.toArray(),[0,0,0,0],'Rand’s dirt cannot overwrite Scott’s independent load')
  assert.equal(equipmentSoil(loadState.frontMud),.25,'Scott character remains capped independently')
  const scottPrograms=new Set(scottLayer.records.flatMap(r=>r.owned.map(m=>m.customProgramCacheKey())))
  for(const record of layer.records){
   for(const material of record.owned)assert.ok(scottPrograms.has(material.customProgramCacheKey()),'Rand introduces no additional coating shader program variant')
   assert.equal(record.owned[0].map,Array.isArray(record.source)?record.source[0].map:record.source.map)
  }
  const before={...loadState};escape.state.speed=0;escape.state.frontAngularSpeed=escape.state.rearAngularSpeed=0
  for(let i=0;i<120;i++)evolveSoil(loadState,contacts.wheels,escape.state,config,0,.1,rig.metrics,.7)
  assert.deepEqual(loadState,before,'A stationary bike does not keep accumulating dirt')
 }finally{layer.dispose();scottLayer.dispose();rig.dispose()}
})

test('Rand reuses stable independent sprung supports over uneven terrain at 30 and 120 FPS',()=>{
 const sample=(x,z,contact)=>{if(contact)Object.assign(contact,{surface:'dirt',biome:'desert'});return .08*Math.sin(z*.18+x*.12)+.04*Math.sin(x*.35-z*.23)},player={x:0,z:-800},results=[]
 for(const fps of [30,120]){
  const escape=new RandDesertEscape(sample,metrics);let deflection=0,vertical=0
  for(let i=0;i<fps*10;i++){
   escape.update(1/fps,player,world,true);const s=escape.state
   deflection=Math.max(deflection,Math.abs(s.frontSpring-s.frontTarget),Math.abs(s.rearSpring-s.rearTarget));vertical=Math.max(vertical,Math.abs(s.frontVelocity),Math.abs(s.rearVelocity))
   assert.ok(Number.isFinite(s.height)&&Math.abs(s.pitch)<.5)
  }
  assert.ok(deflection>.005&&vertical>.03,'Springs have real deflection/velocity instead of copying ground samples')
  results.push({height:escape.height,x:escape.x,z:escape.z,front:escape.state.frontSpring,rear:escape.state.rearSpring,pitch:escape.state.pitch})
 }
 for(const key of Object.keys(results[0]))assert.ok(Math.abs(results[0][key]-results[1][key])<1e-7,`${key} remains stable across frame rates`)
})

test('exactly one Scout chases and shoots Rand while four retain Scott; his pooled shots can hit Rand and obey cover',async()=>{
 const asset=await load('public/models/mospeada/invid-scout.glb'),views=Array.from({length:5},(_,i)=>createScoutView(asset.scene,i)),sample=()=>0,p=new DesertScoutPatrol(views,sample),r=new RandDesertEscape(sample,metrics),s={x:0,z:-650,height:0,speed:0},camera=new PerspectiveCamera(70,16/9,.1,4000);camera.position.set(0,3,-645);camera.lookAt(0,1,-680);camera.updateMatrixWorld(true)
 const channels=new Set();let randHits=0
 for(let i=0;i<1000;i++){
  r.update(.1,s,world,true);p.update(.1,s,camera,world,{randTarget:r,onRandHit:()=>randHits++})
  assert.equal(p.scouts.filter(s=>s.focus==='rand').length,1);assert.equal(p.scouts[SCOUT_PATROL.randPursuerId].focus,'rand');assert.equal(p.scouts[SCOUT_PATROL.randPursuerId].mode,'flight')
  for(const b of p.bolts)if(b.active){channels.add(b.targetId);if(b.targetId==='rand')assert.equal(b.scoutId,SCOUT_PATROL.randPursuerId)}
 }
 assert.ok(p.scouts[SCOUT_PATROL.randPursuerId].shots>0);assert.ok(channels.has('rand')&&channels.has('scott'));assert.ok(randHits>0)
 const bolts=createEnergyProjectiles(1),player={x:10,height:0,z:5},target={active:true,x:0,height:0,z:5};let playerHits=0,secondaryHits=0,blocked=0
 launchEnergyProjectile(bolts,new Vector3(0,1,0),new Vector3(0,1,5),30,2);advanceEnergyProjectiles(bolts,player,.25,{secondaryTarget:target,onPlayerHit:()=>playerHits++,onSecondaryHit:()=>secondaryHits++});assert.equal(secondaryHits,1);assert.equal(playerHits,0)
 const remove=registerColliders([boxCollider(new Box3(new Vector3(-2,0,2),new Vector3(2,3,3)))])
 try{launchEnergyProjectile(bolts,new Vector3(0,1,0),new Vector3(0,1,5),30,2);advanceEnergyProjectiles(bolts,player,.25,{worldQuery:new GallantHitscan(),secondaryTarget:target,onSecondaryHit:()=>secondaryHits++,onWorldHit:()=>blocked++});assert.equal(secondaryHits,1);assert.equal(blocked,1)}finally{remove()}
})

test('Rand uses the inherited Scott riding base without character-specific posture corrections or source edits',async()=>{
 const [bike,rand,scott]=await Promise.all(['rand-cyclone','rand-casual-rigged','scott-bernard-animated-original'].map(n=>load('public/models/mospeada/'+n+'.glb'))),rig=createRandCyclone(bike.scene),sourceBone=scott.scene.getObjectByName('mixamorigHead'),sourceQ=sourceBone.quaternion.clone(),sourceSkin=rand.scene.getObjectByProperty('isSkinnedMesh',true),originalPositions=sourceSkin.geometry.attributes.position.array.slice(),rider=new RandRider(rand.scene,scott.scene,JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')),rig),s=createBikeState({x:0,z:0,yaw:0},rig.metrics,()=>0)
 try{
  s.speed=19;s.idleBlend=0;rig.update(s,()=>0,bikeConfig)
  for(let i=0;i<60;i++)rider.update(s,1/60,bikeConfig,()=>0)
  assert.equal(rider.clip.name,'Cyclone_RidingPose');assert.equal(rider.anatomy,undefined);assert.equal(rider.instance.mountedAnatomy,undefined)
  for(const name of ['Spine','Spine1','Spine2','Neck','Head']){const bone=rider.instance.bones.get('mixamorig'+name),base=rider.base.find(p=>p.b===bone);assert.ok(bone.quaternion.angleTo(base.q)<.001,'Keeps the inherited riding rotation instead of substituting a Rand pose')}
  assert.ok(sourceBone.quaternion.equals(sourceQ));assert.deepEqual(sourceSkin.geometry.attributes.position.array,originalPositions)
  for(const [name,bone]of rider.instance.bones){const ref=rand.scene.getObjectByName(name);assert.ok(bone.position.distanceTo(ref.position)<1e-6,'Joint lengths remain unchanged')}
  for(let i=0;i<60;i++){
    s.boostBlend=Math.sin(i/59*Math.PI);s.brakeBlend=i>40?.5:0;rider.update(s,1/60,bikeConfig,()=>0)
    for(const bone of rider.instance.bones.values())assert.ok(bone.quaternion.toArray().every(Number.isFinite),'Shared riding motion stays finite')
  }
 }finally{rider.dispose();rig.dispose()}
})
