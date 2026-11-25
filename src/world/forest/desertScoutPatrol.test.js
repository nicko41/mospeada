import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {Box3,PerspectiveCamera,Ray,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createScoutView,updateScoutLOD,SCOUT_ASSET,SCOUT_SCALE} from './invidScoutAsset.js'
import {DesertScoutPatrol,SCOUT_PATROL,SCOUT_ATTACK_DAMAGE} from './DesertScoutPatrol.js'
import {registerMeleeTarget} from '../../player/meleeWorld.js'
import {GallantHitscan} from '../../vehicle/GallantShot.js'
import {createEnergyProjectiles,launchEnergyProjectile,advanceEnergyProjectiles} from '../../vehicle/EnergyProjectiles.js'
import {boxCollider,registerColliders} from '../../player/collisionWorld.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/invid-scout.glb'),asset=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
async function fixture(sample=()=>0,random=Math.random){const source=await asset,views=Array.from({length:5},(_,i)=>createScoutView(source.scene,i)),patrol=new DesertScoutPatrol(views,sample,random),s={x:0,z:-SCOUT_PATROL.desertDistance-20,height:sample(0,-SCOUT_PATROL.desertDistance-20),speed:0},camera=new PerspectiveCamera(70,16/9,.1,4000);camera.position.set(s.x,s.height+2.2,s.z+5);camera.lookAt(s.x,s.height+1.1,s.z-8);camera.updateMatrixWorld(true);const world={bound:true,position:new Vector3(),distance:z=>-z,contains:(x,z)=>Math.abs(x)<=2400&&z<=0&&z>=-2400};return {source,views,patrol,s,camera,world}}

test('Scouts fly continuously into front and rear positions and keep both fronts after Scott turns',async()=>{
 const {patrol:p,s,camera,world}=await fixture(()=>0,()=>.5);s.yaw=Math.PI
 p.update(1/60,s,camera,world,{allowAttack:false})
 const previous=p.scouts.map(r=>r.position.clone());let maxStep=0
 const advance=seconds=>{for(let i=0;i<seconds*60;i++){p.update(1/60,s,camera,world,{allowAttack:false});for(const r of p.scouts){maxStep=Math.max(maxStep,r.position.distanceTo(previous[r.id]));previous[r.id].copy(r.position)}}}
 const bothFronts=()=>{const forward=new Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)),along=p.scouts.map(r=>r.position.clone().sub(new Vector3(s.x,s.height,s.z)).dot(forward));assert.ok(along.some(d=>d>12)&&along.some(d=>d< -12),`Both fronts are covered: ${along}`)}
 advance(25);bothFronts();s.yaw=0;advance(12);bothFronts()
 assert.ok(maxStep<1.5,`No frame relocates a visible Scout: max ${maxStep}m`);assert.equal(p.rigTestStarted,false)
 const frozen=p.scouts.map(r=>r.position.toArray());p.update(0,s,camera,world,{allowAttack:false});assert.deepEqual(p.scouts.map(r=>r.position.toArray()),frozen)
})

test('the distant right-to-left pursuit is visible from the overlook before the same five Scouts approach Scott',async()=>{
 const {patrol:p,s,camera,world}=await fixture();s.z=-SCOUT_PATROL.triggerDistance;p.update(.1,s,camera,world)
 assert.equal(p.phase,'sighting');assert.equal(p.scouts.filter(s=>s.view.root.visible).length,5)
 const roots=p.scouts.map(r=>r.view.root),start=p.scouts.map(r=>r.position.clone())
 for(const r of p.scouts){assert.ok(r.position.x>s.x+150);assert.ok(world.distance(r.position.z)>SCOUT_PATROL.desertDistance+150)}
 for(let i=0;i<80;i++)p.update(.1,s,camera,world)
 assert.equal(p.phase,'sighting');assert.equal(p.shots,0);assert.ok(p.scouts.every((r,i)=>r.position.x<start[i].x-20))
 const before=p.scouts.map(r=>r.position.clone());s.z=-SCOUT_PATROL.desertDistance-1;s.height=18
 p.update(.1,s,camera,world);assert.equal(p.phase,'entering');assert.ok(p.scouts.every((r,i)=>r.position.distanceTo(before[i])<6),'Crossing the cliff never respawns or teleports them')
 for(let i=0;i<40;i++)p.update(.1,s,camera,world);assert.equal(p.phase,'entering');assert.equal(p.shots,0,'No attack while Scott is still high above the desert')
 s.height=0;p.update(.1,s,camera,world);assert.equal(p.phase,'active');assert.ok(p.scouts.every((r,i)=>r.view.root===roots[i]))
})

test('all desert routes engage, and combat remains live across the former leash and dune cutoff',async()=>{
 for(const x of [-2300,-700,0,700,2300])for(const distance of [SCOUT_PATROL.desertDistance+10,1700,2350]){
  const {patrol:p,s,camera,world}=await fixture();s.x=x;s.z=-distance;camera.position.set(x,3,s.z+5);camera.lookAt(x,1,s.z-10);camera.updateMatrixWorld(true)
  p.update(.1,s,camera,world);assert.equal(p.phase,'entering');assert.equal(p.scouts.filter(s=>s.view.root.visible).length,5)
  for(let i=0;i<35;i++)p.update(.1,s,camera,world,{allowAttack:false})
  assert.equal(p.phase,'active','No distance from spawn or dune boundary may cancel the encounter')
 }
 const {patrol:p,s,camera,world}=await fixture();s.z=-SCOUT_PATROL.triggerDistance+1;p.update(.1,s,camera,world);assert.equal(p.phase,'idle')
 s.z=-1700;s.x=2401;p.update(.1,s,camera,world);assert.equal(p.phase,'idle','Do not spawn outside the actual terrain')
 const live=await fixture();live.patrol.update(.1,live.s,live.camera,live.world)
 for(let i=0;i<650;i++){const t=Math.min(1,i/450);live.s.z=-640-1560*t;live.s.x=700*t;live.patrol.update(.1,live.s,live.camera,live.world)}
 assert.equal(live.patrol.phase,'active');assert.ok(live.patrol.shots>0);assert.ok(live.patrol.scouts.every(r=>r.meleeEnabled))
})

test('five Scouts share the one runtime GLB and original maps, measured launcher anchors and a human-relative scale',async()=>{
 const {source,views}=await fixture(),sourceMesh=source.scene.getObjectByProperty('isMesh',true)
 assert.equal(views.length,5)
 for(const v of views){const mesh=v.model.getObjectByProperty('isMesh',true);assert.equal(mesh.geometry,sourceMesh.geometry);assert.equal(mesh.material,sourceMesh.material);assert.equal(mesh.castShadow,false);assert.equal(v.muzzles.length,2);v.root.updateMatrixWorld(true);const box=new Box3().setFromObject(v.root);assert.ok(Math.abs(box.getSize(new Vector3()).y-5.2)<.015);v.muzzles.forEach((m,i)=>assert.deepEqual(m.position.toArray(),SCOUT_ASSET.launchers[i]));assert.equal(v.model.scale.x,SCOUT_SCALE)}
 const manifest=JSON.parse(fs.readFileSync('public/models/mospeada/invid-scout-manifest.json'));assert.ok(manifest.parts[0].runtimeTriangles<=80000);assert.ok(manifest.materialsUnchanged);assert.equal(manifest.embeddedImagesPreserved,3)
 const hash=crypto.createHash('sha256').update(fs.readFileSync('assets/invid/scout/invid-scout.glb')).digest('hex');assert.equal(hash,manifest.sourceSha256)
})

test('patrol approaches from the distant right, follows terrain, lands/takes off, staggers launcher attacks and accepts Gallant impacts',async()=>{
 const f=await fixture(),{patrol:p,s,camera,world}=f,remove=p.scouts.map(registerMeleeTarget),shotTimes=p.scouts.map(()=>[]),channels=new Set();let hits=0
 try{
  p.update(1/60,s,camera,world)
  assert.equal(p.scouts.filter(r=>r.view.root.visible).length,5)
  for(const r of p.scouts){const screen=r.position.clone().project(camera);assert.ok(screen.x>0&&screen.y>0);assert.ok(r.position.distanceTo(new Vector3(s.x,s.height,s.z))>200)}
  const buffers=p.bolts.slice()
  for(let i=0;i<600;i++){
   const before=p.scouts.map(r=>r.shots);p.update(.1,s,camera,world,{onPlayerHit:()=>hits++})
   for(const r of p.scouts)if(r.shots>before[r.id]){assert.equal(r.shots,before[r.id]+1);shotTimes[r.id].push(p.time)}
   for(const b of p.bolts)if(b.active&&b.life>SCOUT_PATROL.projectileLife-.11){const r=p.scouts[b.scoutId],m=r.view.muzzles[b.launcher].getWorldPosition(new Vector3());assert.ok(m.distanceTo(b.source)<1e-6,'Shot begins on the measured moving launcher aperture');channels.add(b.launcher)}
   for(const r of p.scouts)assert.ok(new Box3().setFromObject(r.view.root).min.y>=-.001,'No part crosses flat terrain')
   assert.ok(p.bolts.filter(b=>b.active).length<=SCOUT_PATROL.projectiles);p.bolts.forEach((b,j)=>assert.equal(b,buffers[j]))
  }
  assert.ok(p.scouts.some(r=>r.landings>0&&r.takeoffs>0));assert.ok(p.scouts.some(r=>r.landings===0),'Not all Scouts land together');assert.ok(p.shots>20&&hits>0);assert.deepEqual([...channels].sort(),[0,1]);for(const times of shotTimes)for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=SCOUT_PATROL.shotSpacing-.001)
  const target=p.scouts[1],origin=new Vector3(s.x,s.height+1,s.z),aim=target.position.clone().add(new Vector3(0,1.6,0)),result=new GallantHitscan().fire(new Ray(origin,aim.sub(origin).normalize()))
  assert.ok(result.hit);assert.equal(result.destroyed,false);assert.equal(result.hit.health,15);assert.ok(result.hit.hits>0)
  const frozen=p.scouts.map(r=>r.position.toArray());p.update(0,s,camera,world);assert.deepEqual(p.scouts.map(r=>r.position.toArray()),frozen)
  s.x=2401;p.update(.1,s,camera,world);assert.equal(p.phase,'leaving');s.x=0;p.update(.1,s,camera,world);assert.equal(p.phase,'active');s.x=2401;p.update(.1,s,camera,world);for(let i=0;i<65;i++)p.update(.1,s,camera,world);assert.equal(p.phase,'complete');assert.ok(p.scouts.every(r=>!r.view.root.visible&&!r.meleeEnabled));p.reset();assert.equal(p.phase,'idle');assert.ok(p.bolts.every(b=>!b.active))
 }finally{remove.forEach(fn=>fn())}
})

test('exactly sixteen real hits down each Scout; random prone/supine bodies fall onto real terrain and remain visible but cannot attack or be hit again',async()=>{
 for(const [random,face]of [[()=>.1,'up'],[()=>.9,'down']]){
  const sample=face==='up'?()=>0:(x,z)=>.04*x+.06*z,{patrol:p,s,camera,world}=await fixture(sample,random),removers=p.scouts.map(registerMeleeTarget)
  try{
   p.update(.1,s,camera,world);const r=p.scouts[0],shooter=new GallantHitscan(),origin=new Vector3(s.x,s.height+1.4,s.z)
   r.position.set(s.x,sample(s.x,s.z-18)+6,s.z-18);p.applyView(r)
   const aim=r.position.clone().add(new Vector3(0,2.6,0)),ray=new Ray(origin,aim.sub(origin).normalize()),geometry=r.view.levels[0].geometry
   for(let hit=1;hit<=16;hit++){
    const result=shooter.fire(ray);assert.equal(result.hit,r);assert.equal(r.hits,hit);assert.equal(r.health,16-hit);assert.equal(result.destroyed,hit===16)
    if(hit<16){assert.equal(r.dead,false);assert.equal(r.meleeEnabled,true);assert.equal(r.mode,'flight')}
   }
   assert.equal(r.fallFace,face);assert.equal(r.dead,true);assert.equal(r.state,'DEAD');assert.equal(r.meleeEnabled,false);assert.equal(shooter.fire(ray).hit,null);assert.equal(r.hits,16)
   const shots=r.shots
   for(let i=0;i<240;i++)p.update(1/60,s,camera,world,{allowAttack:false})
   assert.equal(r.mode,'downed');assert.equal(r.shots,shots);assert.equal(r.view.root.visible,true);assert.equal(r.view.levels[0].geometry,geometry)
   const front=new Vector3(0,0,1).applyQuaternion(r.view.root.quaternion);assert.ok(face==='up'?front.y>.98:front.y<-.98)
   const box=new Box3().setFromObject(r.view.root);assert.ok(box.getSize(new Vector3()).y<SCOUT_ASSET.heightMetres*.8,'The model lies across the terrain instead of remaining upright')
   const pos=r.view.levels[0].geometry.attributes.position,v=new Vector3();let minGap=Infinity
   for(let i=0;i<pos.count;i+=11){v.fromBufferAttribute(pos,i).applyMatrix4(r.view.levels[0].matrixWorld);minGap=Math.min(minGap,v.y-sample(v.x,v.z))}
   assert.ok(minGap>=-.01&&minGap<.35,'The fallen body must contact the actual terrain without sinking')
   const rest=r.position.clone();for(let i=0;i<90;i++)p.update(1/60,s,camera,world,{allowAttack:false});assert.equal(r.position.distanceTo(rest),0)
   p.reset();assert.equal(r.dead,false);assert.equal(r.health,16);assert.equal(r.view.root.visible,false)
  }finally{removers.forEach(fn=>fn())}
 }
})

test('shared LODs use hysteresis without moving the model, launchers or hitbox',async()=>{
 const {views}=await fixture(),v=views[0],camera=new Vector3(),anchor=v.muzzles[0].getWorldPosition(new Vector3())
 assert.equal(v.levels.length,3)
 for(const other of views)for(let i=0;i<3;i++){assert.equal(other.levels[i].geometry,v.levels[i].geometry);assert.equal(other.levels[i].material,v.levels[i].material)}
 for(const [distance,level]of [[80,2],[35,2],[30,1],[11,1],[8,0],[13,0],[15,1]]){
  camera.set(0,0,distance*(SCOUT_ASSET.heightMetres/3.2));updateScoutLOD(v,camera);assert.equal(v.lod,level);assert.equal(v.levels.filter(m=>m.visible).length,1);assert.ok(anchor.distanceTo(v.muzzles[0].getWorldPosition(new Vector3()))<1e-8)
 }
})

test('Scouts respect sloped real-height samples during landing and body-only movement',async()=>{
 const height=(x,z)=>.03*x+.015*z,f=await fixture(height)
 for(let i=0;i<200;i++){f.patrol.update(.1,f.s,f.camera,f.world,{allowAttack:false});for(const r of f.patrol.scouts)assert.ok(r.position.y>=height(r.position.x,r.position.z)-.01)}
 assert.ok(f.patrol.scouts.some(r=>r.landings>0&&r.takeoffs>0))
})

test('pooled energy projectiles sweep the player once, expire and stop at existing world solids',()=>{
 const bolts=createEnergyProjectiles(2,'scoutOval'),s={x:0,height:0,z:5},origin=new Vector3(0,1,0),target=new Vector3(0,1,5),query=new GallantHitscan();let hits=0,blocked=0
 launchEnergyProjectile(bolts,origin,target,30,2);advanceEnergyProjectiles(bolts,s,.25,{onPlayerHit:()=>hits++});assert.equal(hits,1);assert.equal(bolts[0].active,false)
 const remove=registerColliders([boxCollider(new Box3(new Vector3(-2,0,2),new Vector3(2,3,3)))])
 try{launchEnergyProjectile(bolts,origin,target,30,2);advanceEnergyProjectiles(bolts,s,.25,{worldQuery:query,onPlayerHit:()=>hits++,onWorldHit:()=>blocked++});assert.equal(hits,1);assert.equal(blocked,1)}finally{remove()}
 launchEnergyProjectile(bolts,origin,new Vector3(5,5,0),10,.1);advanceEnergyProjectiles(bolts,s,.2);assert.ok(bolts.every(b=>!b.active))
})

test('a short prefire blink precedes each moving-cannon shot, cancels on suppression and preserves faster staggered cadence',async()=>{
 const {patrol:p,s,camera,world}=await fixture(()=>0,()=>.5),dt=1/120
 p.phase='active';p.previousPlayer.set(s.x,s.height,s.z)
 for(const r of p.scouts){r.position.set((r.id-2)*6,2,s.z-32);r.yaw=0;r.cooldown=Infinity;r.meleeEnabled=true;r.view.root.visible=true;p.applyView(r)}
 const r=p.scouts[1];r.cooldown=0
 p.update(dt,s,camera,world);assert.equal(r.charging,true);assert.equal(p.shots,0)
 const remaining=r.chargeLeft;p.update(0,s,camera,world);assert.equal(r.chargeLeft,remaining,'Pause freezes prefire')
 p.update(dt,s,camera,world,{allowAttack:false});assert.equal(r.charging,false);assert.equal(p.shots,0)
 let elapsed=0,blinkAt=null,firstAt=null;const shotTimes=[]
 for(let i=0;i<3000;i++){
  const before=p.shots;p.update(dt,s,camera,world);elapsed+=dt
  if(r.charging&&blinkAt===null)blinkAt=elapsed
  if(p.shots>before){
   firstAt??=elapsed;shotTimes.push(elapsed)
   const b=p.bolts.find(b=>b.active&&b.life>SCOUT_PATROL.projectileLife-dt*1.1)
   assert.ok(b);assert.ok(b.source.distanceTo(r.view.muzzles[b.launcher].getWorldPosition(new Vector3()))<1e-6)
   assert.ok(Math.abs(b.velocity.length()-SCOUT_PATROL.projectileSpeed)<1e-6)
   assert.ok(r.cannonFlash[b.launcher]>0,'The actual launching barrel keeps its post-release glow')
  }
 }
 assert.ok(firstAt-blinkAt>=.04&&firstAt-blinkAt<=.08,'White blink lasts only a fraction of a second BEFORE release')
 assert.ok(shotTimes.length>=10,'A Scout applies sustained pressure instead of its old 3.4+ second cadence')
 for(let i=1;i<shotTimes.length;i++)assert.ok(shotTimes[i]-shotTimes[i-1]>=SCOUT_PATROL.shotSpacing)
 r.cooldown=0;p.shotGate=0;p.update(dt,s,camera,world);assert.equal(r.charging,true)
 for(let i=0;i<SCOUT_PATROL.hitsToDown;i++)p.receiveHit(r,new Vector3(0,0,-1))
 assert.equal(r.charging,false);p.reset();assert.ok(p.scouts.every(r=>!r.charging&&r.chargeLeft===0))
})

test('Scout lead brings a lateral moving target much closer to the central round than the former aim',async()=>{
 const {patrol:p,s,camera,world}=await fixture(()=>0,()=>.5),dt=1/120,vx=14
 p.phase='active';p.previousPlayer.set(s.x-vx*dt,s.height,s.z)
 for(const r of p.scouts){r.cooldown=Infinity;r.position.set(s.x+(r.id-2)*6,3,s.z-40);r.meleeEnabled=true;r.view.root.visible=true;p.applyView(r)}
 const r=p.scouts[1];r.yaw=Math.atan2(s.x-r.position.x,s.z-r.position.z);r.cooldown=0;r.charging=true;r.chargeLeft=dt;r.burstRemaining=5;r.burstSpread=.8;p.applyView(r)
 p.update(dt,s,camera,world)
 const b=p.bolts.find(b=>b.active&&b.scoutId===r.id);assert.ok(b);assert.equal(b.burstRound,3)
 const target=new Vector3(s.x,s.height+.8,s.z),velocity=new Vector3(vx,0,0),oldTime=b.source.distanceTo(target)/42,oldAim=target.clone().addScaledVector(velocity,oldTime*.35),oldVelocity=oldAim.sub(b.source).normalize().multiplyScalar(42)
 const miss=shot=>{const relative=shot.clone().sub(velocity),delta=target.clone().sub(b.source),t=Math.max(0,delta.dot(relative)/relative.lengthSq());return delta.addScaledVector(relative,-t).length()}
 assert.ok(miss(b.velocity)<miss(oldVelocity)*.6,'Predictive aiming reduces the former lateral miss without perfect tracking')
 const pulse=r.cannonFlash.slice();p.update(0,s,camera,world);assert.deepEqual(r.cannonFlash,pulse,'Pause freezes both barrel pulses')
 p.stopCombat();assert.ok(r.cannonFlash.every(t=>t===0))
})

test('overlapping Scout volleys cannot stack damage on Scott, and pause and retry preserve the damage window',async()=>{
 const {patrol:p,s,camera,world}=await fixture(()=>0,()=>.5),dt=1/60,source=new Vector3(s.x,s.height+1,s.z-1),target=new Vector3(s.x,s.height+1,s.z)
 p.phase='active';p.previousPlayer.set(s.x,s.height,s.z);for(const r of p.scouts)r.cooldown=Infinity
 let hits=0;const options={allowAttack:false,onPlayerHit:()=>hits++},volley=()=>{for(let i=0;i<30;i++)launchEnergyProjectile(p.bolts,source,target,SCOUT_PATROL.projectileSpeed,1)}
 volley();p.update(dt,s,camera,world,options);assert.equal(hits,1);assert.ok(p.bolts.every(b=>!b.active),'Every overlapping orb is still consumed by its real collision')
 const cooldown=p.playerHurtCooldown;p.update(0,s,camera,world,options);assert.equal(p.playerHurtCooldown,cooldown)
 volley();p.update(dt,s,camera,world,options);assert.equal(hits,1,'A second volley cannot immediately remove more health')
 for(let i=0;i<120;i++){volley();p.update(dt,s,camera,world,options)}
 assert.ok(hits*SCOUT_ATTACK_DAMAGE<=40,'Even relentless overlapping volleys cannot kill a full-health Scott in two seconds')
 p.reset();assert.equal(p.playerHurtCooldown,0);assert.ok(p.scouts.every(r=>r.health===16))
})

test('Scott and Rand each receive eight alternating downward rounds, a real pause, and ground strikes around their bodies',async()=>{
 for(const focus of ['scott','rand']){
  const {patrol:p,s,camera,world}=await fixture(()=>0,()=>.5),dt=1/120,rand={active:true,x:10,z:s.z+5,height:0,speed:0,vx:0,vy:0,vz:0,forward:new Vector3(0,0,-1)}
  p.phase='active';p.previousPlayer.set(s.x,s.height,s.z)
  for(const r of p.scouts){r.cooldown=Infinity;r.position.set(s.x+(r.id-2)*6,3,s.z-32);r.meleeEnabled=true;r.view.root.visible=true;p.applyView(r)}
  const r=p.scouts[focus==='rand'?SCOUT_PATROL.randPursuerId:1],target=focus==='rand'?rand:s
  r.position.set(target.x+(focus==='rand'?9:20),3,target.z+(focus==='rand'?25:-39));r.yaw=Math.atan2(target.x-r.position.x,target.z-r.position.z);r.cooldown=0;p.applyView(r)
  p.worldQuery.castWorld=(ray,max)=>{const distance=ray.direction.y<0?-ray.origin.y/ray.direction.y:Infinity;return {solid:distance>=0&&distance<=max,distance,point:ray.at(Math.min(distance,max),new Vector3())}}
  const rounds=[];let groundHits=0,actorHits=0
  const options={randTarget:focus==='rand'?rand:null,onImpact:()=>groundHits++,onPlayerHit:()=>actorHits++,onRandHit:()=>actorHits++}
  for(let i=0;i<1800&&r.shots<16;i++){
   const before=r.shots;p.update(dt,s,camera,world,options)
   if(r.shots>before){
    const bolt=p.bolts.find(b=>b.active&&b.scoutId===r.id&&b.life>SCOUT_PATROL.projectileLife-dt*1.1)
    assert.ok(bolt);rounds.push({time:p.time,side:bolt.launcher,round:bolt.burstRound,burst:bolt.burstId,vy:bolt.velocity.y,target:bolt.targetId})
   }
  }
  assert.equal(rounds.length,16);assert.equal(r.burstRemaining,0)
  assert.deepEqual(rounds.map(b=>b.round),[0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7])
  assert.deepEqual(rounds.map(b=>b.burst),[...Array(8).fill(1),...Array(8).fill(2)])
  assert.ok(rounds.every(b=>b.vy<0&&b.target===focus),'Shots descend from the elevated cannons toward each low rider')
  for(let i=1;i<16;i++)assert.notEqual(rounds[i].side,rounds[i-1].side,'Every round alternates the actual launcher')
  for(const start of [0,8])assert.ok(rounds[start+7].time-rounds[start].time<1,'Eight-round machine-gun burst finishes in under a second')
  assert.ok(rounds[8].time-rounds[7].time>=2.4&&rounds[8].time-rounds[7].time<3,'A visible recovery separates complete bursts')
  for(let i=0;i<180;i++)p.update(dt,s,camera,world,{...options,allowAttack:false})
  assert.ok(groundHits>=8,'Most rounds produce real ground contacts instead of vanishing in the air')
  assert.ok(actorHits>0,'The burst can still hit its intended rider')
  const shots=r.shots;r.cooldown=0;r.yaw=Math.atan2(target.x-r.position.x,target.z-r.position.z);p.shotGate=0;p.update(dt,s,camera,world,options);assert.equal(r.burstRemaining,8)
  for(let i=0;i<SCOUT_PATROL.hitsToDown;i++)p.receiveHit(r,new Vector3(0,0,-1))
  for(let i=0;i<60;i++)p.update(dt,s,camera,world,options)
  assert.equal(r.shots,shots);assert.equal(r.burstRemaining,0,'Death cancels the remaining burst')
 }
})
