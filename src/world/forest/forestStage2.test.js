import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {stage2PhysicsFixture,simulateStage2} from '../../../scripts/forest-stage2-physics.mjs'
import {FOREST_STAGE2 as S,stage2PathX,stage2Checkpoint} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
import {forestBaseSurfaceHeight} from './forestLayout.js'
import {ForestStage2Progress} from './forestStage2Progress.js'
import {createBikeState} from '../../vehicle/bikePhysics.js'
import {generateStage2FoliageWorld} from './forestStage2Foliage.js'
import {ForestFoliageWorldManager,sectorDistance} from './ForestFoliageWorldManager.js'
import {MeshLambertMaterial,PerspectiveCamera,Vector3} from 'three'
import {FOLIAGE_WORLD} from './forestFoliageWorldConfig.js'

test('Plano 2 uses the actual rendered terrain and original Cyclone: staged jumps, empty canyon and safe retries',async()=>{
  const f=await stage2PhysicsFixture(),report={metrics:f.rig.metrics,width:S.canyon.lipZ-S.canyon.landingZ,cases:[]}
  try{
    for(let x=-95;x<=95;x+=1.73)assert.ok(Math.abs(f.sample(x,-400)-forestBaseSurfaceHeight(x,-400))<2e-6)
    for(let z=S.canyon.landingZ+2;z<S.canyon.lipZ-2;z+=4)for(const x of [-80,0,stage2PathX(z),80])assert.equal(f.sample(x,z),-Infinity)
    for(let z=-1118;z<-401;z+=2.7){const x=stage2PathX(z)+7.2,a=f.sample(x,z),b=stage2SurfaceHeight(x,z);if(Number.isFinite(a))assert.ok(Math.abs(a-b)<2e-6);else assert.equal(b,-Infinity)}
    for(let i=0;i<500;i++){const x=Math.sin(i*7.13)*255,z=-401-(i*17.31)%718,a=f.sample(x,z),b=stage2SurfaceHeight(x,z);if(Number.isFinite(a))assert.ok(Math.abs(a-b)<3e-6,`Irregular-bank contact at ${x}, ${z}`);else assert.equal(b,-Infinity)}
    const first=simulateStage2(f,{startZ:-475,speed:30,first:true});assert.ok(first.landed&&first.airBoostCount===0);assert.ok(first.flightSeconds>.5&&first.flightSeconds<2);assert.ok(first.final.front&&first.final.rear&&Math.abs(first.final.vy)<1);report.first=first
    for(const pulse of [null,...Array.from({length:26},(_,i)=>-748-i*2)]){
      const result=simulateStage2(f,{startZ:-730,speed:60,groundPulseZ:pulse});assert.equal(result.landed,false,`Ground-only pulse at ${pulse}`);assert.equal(result.airBoostCount,0);report.cases.push({pulse,...result,rows:undefined})
    }
    const ideal=simulateStage2(f,{startZ:-740,speed:80,idealGroundLimit:true});assert.equal(ideal.landed,false);assert.ok(ideal.landingRange<report.width);report.idealGroundBound=ideal
    for(const fps of [30,60,120])for(const delay of [.05,.2,.35]){const result=simulateStage2(f,{airDelay:delay,fps});assert.ok(result.landed,`Air boost at ${delay}s/${fps}fps`);assert.ok(result.final.front&&result.final.rear&&Math.abs(result.final.vy)<1,'Landing stays settled on the run-out');assert.equal(result.airBoostCount,1);report.cases.push({fps,delay,...result,rows:undefined})}
    const spam=simulateStage2(f,{airDelay:.05,spam:true});assert.equal(spam.airBoostCount,1);assert.ok(spam.landed);report.air=spam
    const progress=new ForestStage2Progress(),start=stage2Checkpoint();progress.observe({...spam.final,z:-650,height:3.2,frontGrounded:true,rearGrounded:true});assert.deepEqual(progress.checkpoint,start)
    const failed=simulateStage2(f);assert.equal(failed.landed,false);assert.ok(progress.needsRecovery({height:failed.final.y}));let restored;progress.recover(p=>{restored=createBikeState(p,f.rig.metrics,f.sample)});assert.equal(progress.recoveries,1);assert.equal(restored.speed,0);assert.equal(restored.z,start.z);assert.equal(restored.yaw,start.yaw);assert.ok(restored.frontGrounded&&restored.rearGrounded);assert.equal(restored.airBoostUsed,false)
    report.retry={x:restored.x,z:restored.z,height:restored.height,speed:restored.speed,recoveries:progress.recoveries}
    const fastApproach=new ForestStage2Progress();fastApproach.observe({z:-670,height:14,frontGrounded:false,rearGrounded:false});assert.deepEqual(fastApproach.checkpoint,start,'A long boosted first jump still arms a safe ground checkpoint')
    fs.mkdirSync('artifacts/forest-stage2',{recursive:true});fs.writeFileSync('artifacts/forest-stage2/physics.json',JSON.stringify(report,null,2)+'\n')
  }finally{f.dispose()}
})

test('Plano 2 foliage is seeded, remains outside the canyon and prepares every view before boost-speed arrival',()=>{
  const world=generateStage2FoliageWorld(),camera=new PerspectiveCamera(70,16/9,.1,400),actor=new Vector3(),materials={density:{value:.65},near:new MeshLambertMaterial(),far:new MeshLambertMaterial(),contact:new MeshLambertMaterial()},manager=new ForestFoliageWorldManager(world,materials,null,camera)
  manager.warm=()=>{}
  assert.ok(world.total>40000&&world.total<130000)
  for(const s of world.sectors)for(let i=0;i<s.count;i++){const x=s.x+s.matrices[i*16+12],z=s.z+s.matrices[i*16+14],h=s.matrices[i*16+13];assert.ok(Number.isFinite(h));assert.ok(Number.isFinite(stage2SurfaceHeight(x,z)));assert.ok(Math.abs(x-stage2PathX(z))>1.3999)}
  try{
    for(let n=0;n<850;n++){
      actor.set(stage2PathX(-n*1.32),0,-n*1.32);camera.position.copy(actor).add(new Vector3(0,2,4));camera.rotation.y=n*.4;camera.updateMatrixWorld();manager.update(actor,camera,1/60)
      for(const s of world.sectors)if(sectorDistance(s,actor.x,actor.z)<FOLIAGE_WORLD.maxDistance+2)assert.ok(manager.resident.has(s.id))
    }
    assert.equal(manager.latePrepares,0);const prepared=manager.prepared,versions=[...manager.resident.values()].map(s=>s.near.instanceMatrix.version)
    for(let n=0;n<80;n++){camera.rotation.y=n*.4;camera.updateMatrixWorld();manager.update(actor,camera,1/60)}
    assert.equal(manager.prepared,prepared);assert.deepEqual([...manager.resident.values()].map(s=>s.near.instanceMatrix.version),versions)
    fs.writeFileSync('artifacts/forest-stage2/vegetation.json',JSON.stringify({groups:world.total,sectors:world.sectors.length,latePrepares:manager.latePrepares,gpuMB:manager.gpuMemoryBytes()/1048576},null,2)+'\n')
  }finally{manager.dispose()}
})
