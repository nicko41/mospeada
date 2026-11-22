import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Group,MeshLambertMaterial,Mesh,PerspectiveCamera,Vector3} from 'three'
import {DesertScoutPatrol,SCOUT_PATROL} from './DesertScoutPatrol.js'
import {DesertClimaxSequence} from './DesertClimaxSequence.js'
import {RandDesertEscape} from './RandDesertEscape.js'
import {DesertClimaxPlain} from './DesertClimaxPlain.js'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'
import {stage4DesertHeight} from './forestStage4Config.js'
import {stage4Grid} from './forestStage4Terrain.js'
import {sampleRideHeight,registerRideSurfaces} from '../../vehicle/rideSurface.js'
import {createBikeState,advanceBike} from '../../vehicle/bikePhysics.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {ForestStage4World} from './forestStage4World.js'

const metrics={frontZ:1,rearZ:-1,frontY:.4,rearY:.4,frontRadius:.4,rearRadius:.4,wheelbase:2}
function fixture(){
 const world={bound:true,position:new Vector3(),distance:z=>-z,contains:(x,z)=>Math.abs(x)<3000&&z<=0,requestClimax(){this.climaxPlain={ready:true}},updateClimax(){}}
 const sample=(x,z)=>stage4DesertHeight(x,z)
 const views=n=>Array.from({length:n},()=>{const root=new Group(),muzzles=[new Group(),new Group()];muzzles.forEach((m,i)=>{m.position.set(i?1:-1,4,1);root.add(m)});return{root,muzzles}})
 const opening=new DesertScoutPatrol(views(5),sample,()=>.4),climax=new DesertScoutPatrol(views(30),sample,()=>.4,{climax:true,bolts:opening.bolts}),rand=new RandDesertEscape(sample,metrics),scott={x:0,z:-1000,height:sample(0,-1000),speed:0}
 let transitions=0,wins=0;const sequence=new DesertClimaxSequence(opening,{onTransition:()=>transitions++,onVictory:()=>wins++})
 opening.start(scott,new PerspectiveCamera(),world);rand.update(.1,scott,world,true)
 const step=(dt=.05)=>{rand.update(dt,scott,world,true);sequence.update(dt,scott,world,rand,climax)}
 const down=r=>{for(let n=0;n<SCOUT_PATROL.hitsToDown;n++)r.receiveHit(10,new Vector3(0,0,-1))}
 return{world,sample,opening,climax,rand,scott,sequence,step,down,transitions:()=>transitions,wins:()=>wins}
}

test('only the fifth real kill triggers one short departure; Scott retains control/state and old shots are cleared',()=>{
 const f=fixture(),before=JSON.stringify(f.scott)
 for(let i=0;i<4;i++)f.down(f.opening.scouts[i]);f.step();assert.equal(f.sequence.phase,'opening')
 f.opening.bolts[0].active=true;f.down(f.opening.scouts[4]);assert.equal(f.opening.defeated,true);assert.ok(f.opening.bolts.every(b=>!b.active))
 f.step();assert.equal(f.sequence.phase,'departure');assert.equal(f.transitions(),1)
 let stopped=false,looked=false
 for(let i=0;i<30;i++){f.step();stopped ||=f.rand.speed<.05;looked ||=f.rand.lookWeight>.5}
 assert.ok(stopped&&looked);assert.equal(f.rand.climaxPhase,'escaping');assert.equal(f.sequence.phase,'pursuit');assert.equal(f.transitions(),1)
 assert.equal(JSON.stringify(f.scott),before,'The transition never writes Scott input, placement or physics')
 assert.equal(f.opening.scouts[4].receiveHit(10),false);assert.equal(f.opening.kills,5)
})

test('Rand crosses the pass and descent continuously, zigzags and always proceeds forward after his glance',()=>{
 const f=fixture();f.opening.scouts.forEach(f.down);f.step()
 for(let i=0;i<30;i++)f.step()
 let crossed=false,xMin=Infinity,xMax=-Infinity,dropStart=null,dropEnd=null
 for(let i=0;i<3600;i++){
  const previous=f.rand.position.clone();f.scott.z=f.rand.z+60;f.scott.x=f.rand.x;f.scott.height=f.sample(f.scott.x,f.scott.z);f.step()
  assert.ok(f.rand.z<=previous.z+1e-8,'No course wraps or backward travel in the climax')
  assert.ok(f.rand.position.distanceTo(previous)<2.2,'No route teleport')
  assert.ok(Number.isFinite(f.rand.height));assert.ok(Math.abs(f.rand.height-f.sample(f.rand.x,f.rand.z))<1)
  const d=f.world.distance(f.rand.z)
  if(d>C.start&&dropStart===null)dropStart=f.rand.height
  if(d>C.start+C.descent+50&&dropEnd===null)dropEnd=f.rand.height
  if(d>C.start+400){crossed=true;const x=f.rand.x-climaxPathX(d);xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);assert.ok(Math.abs(x)<60)}
 }
 assert.ok(crossed&&dropStart-dropEnd>20);assert.ok(xMax-xMin>12,'Rand visibly zigzags across the broad path')
 const paused=f.rand.position.clone();f.rand.update(0,f.scott,f.world,true);assert.equal(f.rand.position.distanceTo(paused),0)
})

test('thirty distributed ground/air Scouts share the projectile pool and victory requires all thirty real deaths',()=>{
 const f=fixture();f.opening.scouts.forEach(f.down);f.step();for(let i=0;i<30;i++)f.step()
 f.scott.z=-C.start+100;f.rand.z=-C.revealDistance-10;f.rand.position.z=f.rand.z;f.step()
 assert.equal(f.sequence.phase,'battle');assert.equal(f.climax.scouts.length,30);assert.equal(f.climax.bolts,f.opening.bolts)
 assert.equal(f.climax.scouts.filter(r=>r.mode==='ground').length,10)
 assert.ok(f.climax.scouts.every(r=>r.meleeEnabled&&r.view.root.visible))
 const depths=f.climax.scouts.map(r=>-r.position.z);assert.ok(Math.max(...depths)-Math.min(...depths)>700)
 f.scott.z=-2800;f.scott.height=f.sample(f.scott.x,f.scott.z)
 for(let i=0;i<300;i++)f.climax.update(.05,f.scott,new PerspectiveCamera(),f.world,{randTarget:f.rand})
 assert.ok(f.climax.scouts.every(r=>Number.isFinite(r.position.x+r.position.y+r.position.z)))
 assert.ok(f.climax.scouts.some(r=>r.focus==='rand'));assert.ok(f.climax.scouts.some(r=>r.shots>0));assert.ok(f.climax.bolts.filter(b=>b.active).length<=SCOUT_PATROL.projectiles)
 for(let i=0;i<29;i++)f.down(f.climax.scouts[i]);f.step();assert.equal(f.sequence.phase,'battle');assert.equal(f.sequence.completed,false)
 f.down(f.climax.scouts[29]);f.step();assert.equal(f.sequence.phase,'victory');assert.equal(f.wins(),1);assert.equal(f.sequence.objective(f.rand).kills,30);assert.equal(f.sequence.completed,true)
 for(let i=0;i<40;i++)f.step();assert.equal(f.wins(),1);assert.ok(f.climax.bolts.every(b=>!b.active))
})

test('protecting Rand has a failure state and a climax retry does not replay the five-Scout fight or grant victory',()=>{
 const f=fixture();f.sequence.reset(true);f.scott.z=-C.start-30;f.step()
 assert.equal(f.opening.phase,'complete');assert.equal(f.rand.climaxPhase,'escaping')
 for(let i=0;i<13;i++){f.rand.hurtCooldown=0;f.rand.receiveHit()}
 f.step();assert.equal(f.sequence.phase,'failed');assert.equal(f.sequence.completed,false);assert.equal(f.wins(),0)
 f.climax.reset();f.sequence.reset(true);f.step();assert.equal(f.rand.dead,false);assert.equal(f.rand.health,100);assert.ok(f.opening.scouts.every(r=>!r.meleeEnabled&&!r.view.root.visible))
})

test('a retry waits for actual wheel support before spawning Rand on a newly prepared checkpoint',()=>{
 const f=fixture();f.sequence.reset(true);f.scott.z=-2430;const source=f.rand.sample;f.rand.sample=()=>-Infinity
 f.sequence.update(.05,f.scott,f.world,f.rand,f.climax);assert.equal(f.sequence.phase,'resume')
 f.rand.sample=source;f.sequence.update(.05,f.scott,f.world,f.rand,f.climax);assert.notEqual(f.sequence.phase,'resume');assert.ok(f.rand.active)
})

test('the procedural plain recycles a fixed terrain pool, joins the desert and supports native bike physics through the descent',()=>{
 const world=new Group(),material=new MeshLambertMaterial();world.materials={desert:material}
 const entry=new Mesh(stage4Grid(-640,640,2240,C.start,16,16,stage4DesertHeight),material);entry.userData={rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'desert'};world.add(entry);const remove=registerRideSurfaces(entry)
 const plain=new DesertClimaxPlain(world)
 try{
  world.requestClimax=()=>plain;world.updateClimax=()=>{};world.startAt=d=>({x:climaxPathX(d),z:-d,yaw:Math.PI})
  assert.equal(ForestStage4World.prototype.prepareClimaxRetry.call(world,metrics),null,'Retry waits instead of creating Scott over missing collision geometry')
  world.updateClimax=(a,b)=>plain.update(a,b)
  let checkpoint=null;for(let i=0;i<150&&!checkpoint;i++)checkpoint=ForestStage4World.prototype.prepareClimaxRetry.call(world,metrics)
  assert.ok(checkpoint);assert.doesNotThrow(()=>createBikeState(checkpoint,metrics,sampleRideHeight))
  for(let i=0;i<150&&!plain.ready;i++)plain.update(C.start,C.start+60)
  for(let i=0;i<20;i++)plain.update(C.start,C.start+60)
  assert.equal(plain.rows.length,C.terrainRows);const meshes=plain.rows.flatMap(r=>r.meshes),geometries=meshes.map(m=>m.geometry)
  assert.equal(meshes.length,36)
  const bike=createBikeState({x:0,z:-C.start+40,yaw:Math.PI},metrics,sampleRideHeight);bike.speed=28
  const start=bike.height
  for(let i=0;i<1800;i++){
   if(i%10===0)plain.update(-bike.z,-bike.z+100)
   const target=climaxPathX(-bike.z+20),yaw=Math.atan2(target-bike.x,-20),error=Math.atan2(Math.sin(yaw-bike.yaw),Math.cos(yaw-bike.yaw))
   advanceBike(bike,{throttle:.25,steer:Math.max(-1,Math.min(1,error*5)),brake:0,boost:false},1/120,metrics,sampleRideHeight,()=>true,bikeConfig)
   assert.ok(Number.isFinite(bike.height));assert.ok(bike.height>-80)
  }
  assert.ok(start-bike.height>20,'Native wheels/suspension actually descend to the lower plain')
  for(let d=3000;d<18000;d+=160){for(let i=0;i<6;i++)plain.update(d,d+160);assert.ok(Number.isFinite(sampleRideHeight(climaxPathX(d),-d)))}
  assert.deepEqual(plain.rows.flatMap(r=>r.meshes).map(m=>m.geometry),geometries,'Long pursuits reuse all geometries')
  assert.ok(plain.assignments.size<=C.terrainRows)
 }finally{plain.dispose();remove();entry.geometry.dispose();material.dispose()}
})
