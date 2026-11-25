import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Group,Matrix4,MeshLambertMaterial,Mesh,PerspectiveCamera,Ray,Vector3} from 'three'
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
import {GallantHitscan,GALLANT_FIRE} from '../../vehicle/GallantShot.js'
import {registerMeleeTarget} from '../../player/meleeWorld.js'

const metrics={frontZ:1,rearZ:-1,frontY:.4,rearY:.4,frontRadius:.4,rearRadius:.4,wheelbase:2}
function fixture(){
 const world={bound:true,position:new Vector3(),distance:z=>-z,contains:(x,z)=>Math.abs(x)<3000&&z<=0,requestClimax(){this.climaxPlain={ready:true}},updateClimax(){}}
 const sample=(x,z)=>stage4DesertHeight(x,z)
 const views=n=>Array.from({length:n},()=>{const root=new Group(),muzzles=[new Group(),new Group()];muzzles.forEach((m,i)=>{m.position.set(i?1:-1,4,1);root.add(m)});return{root,muzzles}})
 const opening=new DesertScoutPatrol(views(5),sample,()=>.4),climax=new DesertScoutPatrol(views(C.count),sample,()=>.4,{climax:true,bolts:opening.bolts}),rand=new RandDesertEscape(sample,metrics),scott={x:0,z:-1000,height:sample(0,-1000),speed:0}
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

test('all fifteen Scouts are visible before the descent and keep their identities and positions when battle starts',()=>{
 const f=fixture();let placements=0;const start=f.climax.startClimax.bind(f.climax);f.climax.startClimax=(...args)=>{placements++;return start(...args)}
 f.opening.scouts.forEach(f.down);f.step();assert.equal(f.sequence.phase,'departure');assert.equal(f.sequence.revealed,true)
 assert.ok(f.climax.scouts.every(r=>r.view.root.visible));assert.equal(f.climax.scouts.length,15)
 const roots=f.climax.scouts.map(r=>r.view.root),homes=f.climax.scouts.map(r=>r.home.clone()),before=f.climax.scouts.map(r=>r.position.clone())
 for(let i=0;i<30;i++)f.step()
 assert.equal(f.sequence.phase,'pursuit');assert.equal(f.climax.shots,0);assert.ok(f.climax.scouts.every(r=>!r.engaged),'Distant preview does not start combat')
 assert.ok(f.climax.scouts.some((r,i)=>r.position.distanceTo(before[i])>.1),'The distant patrol is alive')
 const paused=f.climax.scouts.map(r=>r.position.toArray());f.step(0);assert.deepEqual(f.climax.scouts.map(r=>r.position.toArray()),paused)
 const visible=f.climax.scouts.map(r=>r.position.clone());f.scott.z=-C.start+100;f.rand.z=-C.revealDistance-10;f.rand.position.z=f.rand.z;f.step()
 assert.equal(f.sequence.phase,'battle');assert.equal(placements,1,'Battle reuses the earlier placement')
 for(const [i,r]of f.climax.scouts.entries()){assert.equal(r.view.root,roots[i]);assert.ok(r.home.distanceTo(homes[i])<1e-8);assert.ok(r.position.distanceTo(visible[i])<1,'No pop or relocation at the battle trigger')}
})

test('three fixed patrols activate progressively, physically arrive and count each real death once',()=>{
 const f=fixture();f.opening.scouts.forEach(f.down);f.step();for(let i=0;i<30;i++)f.step()
 f.scott.z=-C.start+100;f.rand.z=-C.revealDistance-10;f.rand.position.z=f.rand.z;f.step()
 assert.equal(f.sequence.phase,'battle');assert.equal(f.climax.scouts.length,15);assert.equal(f.climax.bolts,f.opening.bolts)
 assert.equal(f.sequence.objective(f.rand).total,15);assert.match(f.sequence.objective(f.rand).text,/15 Invid/)
 assert.equal(f.climax.scouts.filter(r=>r.mode==='ground').length,5)
 const p=f.climax,groups=[0,1,2].map(i=>p.scouts.slice(i*5,i*5+5)),camera=new PerspectiveCamera()
 assert.ok(p.scouts.every(r=>r.view.root.visible));assert.deepEqual(p.patrols.map(g=>g.activated),[true,true,false])
 assert.ok(groups[2].every(r=>!r.meleeEnabled&&r.focus===null&&r.receiveHit(10)===false))
 const before=p.scouts.map(r=>r.position.clone()),roots=p.scouts.map(r=>r.view.root)
 f.scott.z=-C.firstPatrol+40;f.scott.height=f.sample(f.scott.x,f.scott.z)
 const tick=()=>p.update(.05,f.scott,camera,f.world)
 for(let i=0;i<200;i++)tick()
 assert.ok(groups[0].every(r=>r.engaged));assert.ok(groups[1].every(r=>!r.engaged&&r.shots===0),'The first group has a head start')
 assert.ok(groups[1].every(r=>r.position.z>before[r.id].z+200),'Second patrol flies from its distant placement')
 assert.ok(groups[2].every(r=>r.position.distanceTo(before[r.id])<20&&r.shots===0&&r.focus===null))
 for(let i=0;i<1800;i++)tick()
 assert.ok(groups[1].every(r=>r.engaged));assert.ok(groups[1].some(r=>r.shots>0));assert.equal(p.patrols[2].activated,false,'No timer activates the third group')
 for(let i=0;i<4;i++)f.down(groups[0][i]);assert.equal(p.patrols[2].activated,false)
 const reserve=groups[2].map(r=>r.position.clone());f.down(groups[0][4])
 assert.equal(p.patrols[0].kills,5);assert.equal(p.patrols[2].activated,true)
 groups[2].forEach((r,i)=>assert.equal(r.position.distanceTo(reserve[i]),0,'Activation does not reposition reinforcements'))
 f.down(groups[0][4]);assert.equal(p.kills,5);assert.equal(p.patrols[0].kills,5,'A corpse cannot count twice')
 for(let i=0;i<2200;i++)tick()
 assert.ok(groups[2].every(r=>r.engaged));assert.ok(groups[2].some(r=>r.shots>0));assert.ok(p.scouts.every((r,i)=>r.view.root===roots[i]))
 assert.ok(p.scouts.filter(r=>r.focus==='scott').length>p.scouts.filter(r=>r.focus==='rand').length)
 for(let i=5;i<14;i++)f.down(p.scouts[i]);f.step();assert.equal(f.sequence.phase,'battle');assert.equal(f.sequence.completed,false)
 f.down(p.scouts[14]);f.step();assert.equal(f.sequence.phase,'victory');assert.equal(f.wins(),1);assert.equal(f.sequence.objective(f.rand).kills,15);assert.equal(f.sequence.completed,true)
 for(let i=0;i<40;i++)f.step();assert.equal(f.wins(),1);assert.ok(f.climax.bolts.every(b=>!b.active))
})

test('a full moving escort can defeat all fifteen with ranged Gallant hits while Rand survives',()=>{
 const f=fixture(),p=f.climax,camera=new PerspectiveCamera(),hitscan=new GallantHitscan(),ray=new Ray(),aim=new Vector3(),origin=new Vector3()
 f.sequence.reset(true);f.scott.z=-C.start-30;f.step()
 const remove=p.scouts.map(registerMeleeTarget);let cooldown=0,randHits=0,maxStep=0
 try{
  for(let frame=0;frame<9000&&!f.sequence.completed&&!f.rand.dead;frame++){
   f.scott.x=f.rand.x;f.scott.z=f.rand.z+20;f.scott.height=f.sample(f.scott.x,f.scott.z);f.scott.yaw=Math.PI
   f.step();const previous=p.scouts.map(r=>r.position.clone())
   p.update(.05,f.scott,camera,f.world,{randTarget:f.rand,onRandHit:()=>{randHits++;f.rand.receiveHit()}})
   for(const [i,r] of p.scouts.entries())if(!r.dead)maxStep=Math.max(maxStep,Math.hypot(r.position.x-previous[i].x,r.position.z-previous[i].z))
   cooldown-=.05
   if(cooldown<=0){
    origin.set(f.scott.x,f.scott.height+2,f.scott.z)
    const target=p.scouts.filter(r=>r.meleeEnabled&&!r.dead&&r.position.distanceTo(origin)<GALLANT_FIRE.range-3).sort((a,b)=>(a.focus==='rand'?0:1)-(b.focus==='rand'?0:1)||a.id-b.id)[0]
    if(target){aim.copy(target.position);aim.y+=target.height*.55;ray.set(origin,aim.sub(origin).normalize());hitscan.fire(ray);cooldown=GALLANT_FIRE.interval}
   }
  }
  f.step();assert.equal(f.sequence.phase,'victory');assert.equal(p.kills,15);assert.ok(p.patrols.every(g=>g.kills===5));assert.ok(f.rand.health>0)
  assert.ok(randHits>0,'Protection is still necessary');assert.ok(maxStep<4,'Refuse frame relocations during approach or combat')
  p.reset();assert.ok(p.patrols.every(g=>!g.activated&&g.kills===0));assert.ok(p.scouts.every(r=>!r.activated&&!r.engaged&&!r.meleeEnabled&&r.focus===null))
 }finally{remove.forEach(fn=>fn())}
})

test('an inactive reserve next to Rand cannot select him, shoot, swipe or hurt him',()=>{
 const f=fixture(),p=f.climax,camera=new PerspectiveCamera();p.startClimax(f.world);p.beginAmbush()
 f.rand.active=true;f.rand.x=0;f.rand.z=-C.firstPatrol;f.rand.height=f.sample(0,f.rand.z)
 for(const r of p.scouts.slice(0,10)){r.cooldown=Infinity;r.position.x+=2000;r.home.copy(r.position)}
 const reserve=p.scouts[10];reserve.position.set(f.rand.x,f.rand.height,f.rand.z);reserve.home.copy(reserve.position);reserve.mode='ground';reserve.cooldown=0
 let hits=0;for(let i=0;i<100;i++)p.update(.05,f.scott,camera,f.world,{randTarget:f.rand,onRandHit:()=>hits++})
 assert.equal(reserve.focus,null);assert.equal(reserve.shots,0);assert.equal(reserve.engaged,false);assert.equal(reserve.clawAge,Infinity);assert.equal(hits,0)
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
  const backdrop=plain.backdrop.geometry
  assert.ok(plain.backdrop.visible&&!plain.backdrop.userData.rideSurface)
  assert.equal(plain.scenery.meshes.length,4);assert.ok(plain.scenery.meshes.every(m=>m.isInstancedMesh&&!m.castShadow))
  const matrix=new Matrix4(),point=new Vector3()
  for(const mesh of [plain.scenery.rocks,plain.scenery.brush])for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);if(matrix.elements[0]===0&&matrix.elements[10]===0)continue;assert.ok(Math.abs(point.x-climaxPathX(-point.z))>=259,'Combat strip remains clear')}
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
  assert.equal(plain.backdrop.geometry,backdrop,'The background behind the riders also reuses its geometry')
  assert.ok(backdrop.boundingBox.max.z<=-C.start,'The visual backdrop stays inside the final scene')
  assert.equal(backdrop.boundingBox.min.z,-(C.start+plain.backdropSector*C.tileLength),'No sky gap between the backdrop and the collision rows')
  const edge=new Map(),back=backdrop.attributes.position
  for(let i=0;i<back.count;i++)if(back.getZ(i)===backdrop.boundingBox.min.z)edge.set(back.getX(i),back.getY(i))
  for(const mesh of plain.assignments.get(plain.backdropSector).meshes){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count&&p.getZ(i)===0;i++){assert.ok(edge.has(p.getX(i)));assert.ok(Math.abs(edge.get(p.getX(i))-p.getY(i))<.0001,'Background stitches to the actual terrain edge without slits')}}
  assert.deepEqual(plain.rows.flatMap(r=>r.meshes).map(m=>m.geometry),geometries,'Long pursuits reuse all geometries')
  assert.ok(plain.assignments.size<=C.terrainRows)
 }finally{plain.dispose();remove();entry.geometry.dispose();material.dispose()}
})
