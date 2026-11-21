import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Box3,BoxGeometry,Matrix4,MeshLambertMaterial,PerspectiveCamera,Ray,Vector3} from 'three'
import {stage2PhysicsFixture} from '../../../scripts/forest-stage2-physics.mjs'
import {createBikeState,advanceBike} from '../../vehicle/bikePhysics.js'
import {registerRideSurfaces,sampleRideHeight} from '../../vehicle/rideSurface.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {CycloneShooterEncounter} from './CycloneShooterEncounter.js'
import {CycloneShooterCamera} from '../../vehicle/CycloneShooterCamera.js'
import {ForestStage3World} from './forestStage3World.js'
import {FOREST_STAGE3 as S,stage3PathX,stage3Height,stage3Yaw} from './forestStage3Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'

test('Plano 3 follows actual ride triangles indefinitely with a fixed resident set, clear route and brief maneuver locks',async()=>{
  const f=await stage2PhysicsFixture(),geometry=new BoxGeometry(2,6,2),material=new MeshLambertMaterial(),bounds=new Box3(new Vector3(-1,0,-1),new Vector3(1,6,1)),part={geometry,material,transform:new Matrix4()},asset={name:'test-tree',kind:'tree',bounds,parts:[part]},world=new ForestStage3World([asset],material,{near:material,far:material},new Map([[asset.name,{parts:[part]}]]))
  const remove=registerRideSurfaces(world),removeColliders=world.register(),original=world.tiles.map(t=>({geometry:t.mesh.geometry,matrices:t.batches.map(b=>b._matricesTexture.version)})),report=[]
  try{
    for(let x=-256;x<=256;x+=4)assert.ok(Math.abs(stage3Height(x,S.startZ)-stage2SurfaceHeight(x,S.startZ))<1e-7)
    for(const fps of [30,60,120]){
      world.ensureAround(S.startZ-2)
      const s=createBikeState({x:stage3PathX(S.startZ-2),z:S.startZ-2,yaw:Math.PI},f.rig.metrics,sampleRideHeight),e=new CycloneShooterEncounter();assert.ok(e.observe(s))
      let error=0,locked=0,air=0
      for(let i=0;i<fps*125;i++){
        world.ensureAround(s.z);advanceBike(s,e.drive(s,1/fps),1/fps,f.rig.metrics,sampleRideHeight);e.move(s,1/fps)
        error=Math.max(error,Math.abs(s.x-stage3PathX(s.z)));locked+=!e.canShoot?1:0;air+=s.airborne?1:0
        assert.ok(Number.isFinite(s.height)&&s.height>8&&s.height<12);assert.equal(s.blocked,false)
        assert.ok(Number.isFinite(sampleRideHeight(s.x,s.z-45)),'Rendered supporting ground is always ready ahead')
      }
      assert.ok(error<.8,`${fps} fps: ${error} m route error`);assert.ok(s.speed>13&&s.speed<15);assert.ok(s.z<S.startZ-1500)
      assert.ok(e.maneuvers>=7);assert.ok(locked/(fps*125)<.25);assert.ok(e.hitsTaken>0,'Drones threaten the rider');assert.equal(e.remaining,11,'No timeout or automatic kills')
      report.push({fps,distance:S.startZ-s.z,maxPathError:error,speed:s.speed,maneuvers:e.maneuvers,lockedFraction:locked/(fps*125),airFrames:air})
    }
    assert.equal(world.tiles.length,8);assert.ok(world.recycles>8)
    world.tiles.forEach((t,i)=>{assert.equal(t.mesh.geometry,original[i].geometry);assert.deepEqual(t.batches.map(b=>b._matricesTexture.version),original[i].matrices)})
    world.ensureAround(-4000);world.updateMatrixWorld(true)
    for(const tile of world.tiles){const next=world.tiles.find(t=>t.index===tile.index+1);if(!next)continue
      const p=tile.mesh.geometry.attributes.position,q=next.mesh.geometry.attributes.position
      for(let col=0;col<129;col++)assert.ok(Math.abs(p.getY(48*129+col)-q.getY(col))<1e-6,'No cracks at recycled chunk seams')
    }
    fs.mkdirSync('artifacts/forest-stage3',{recursive:true});fs.writeFileSync('artifacts/forest-stage3/physics.json',JSON.stringify({report,residentChunks:world.tiles.length,recycles:world.recycles},null,2)+'\n')
  }finally{remove();removeColliders();world.dispose();geometry.dispose();material.dispose();f.dispose()}
})

test('eleven drones arrive in waves 2-3-3-2-1, attack together in bursts, then restore the exit once',()=>{
  const e=new CycloneShooterEncounter(),s={x:stage3PathX(-1084),z:-1084,height:9,yaw:Math.PI,speed:14,riderMode:'mounted',frontGrounded:true,rearGrounded:true,airborne:false}
  assert.equal(e.observe({...s,z:-1070}),false);assert.equal(e.observe({...s,riderMode:'onFoot'}),false);assert.ok(e.observe(s))
  const step=seconds=>{for(let t=0;t<seconds;t+=1/120){e.drive(s,1/120);e.move(s,1/120)}}
  step(3.4);assert.equal(e.drones.filter(d=>d.spawned).length,2);assert.equal(e.canShoot,true)
  assert.ok(e.enemyShots>=6,'Both members fire three-shot bursts promptly')
  assert.ok(e.bolts.filter(b=>b.active).length>=2,'Several enemy projectiles are in flight together')
  step(10);assert.equal(e.waveIndex,0);assert.equal(e.drones.filter(d=>d.spawned).length,2,'The next wave waits until the current group is defeated');assert.ok(e.enemyShots>=24)
  const ray=new Ray(new Vector3(s.x,s.height+1,s.z)),aim=d=>ray.direction.copy(d.position).sub(ray.origin).normalize()
  aim(e.drones[0]);e.maneuver=1;assert.equal(e.fire(ray,s),null);assert.equal(e.shots,0);step(1.1)
  const sizes=[]
  for(let wave=0;wave<S.waves.length;wave++){
    while(e.waveIndex<wave||!e.canShoot)step(.1)
    step(S.spawnStagger*3);while(!e.canShoot)step(.1)
    const group=e.drones.filter(d=>d.spawned&&!d.dead);sizes.push(group.length)
    assert.equal(group.length,S.waves[wave]);assert.ok(group.every(d=>d.wave===wave))
    assert.ok(group.every(d=>[...d.position].every(Number.isFinite)),'All eleven IDs have valid formation slots')
    for(const d of group){
      while(!e.canShoot||e.fireCooldown>0)step(.01)
      for(let hit=0;hit<3;hit++){aim(d);assert.equal(e.fire(ray,s)?.hit,d.id);if(hit<2)step(.25)}
      assert.equal(d.dead,true)
    }
    if(wave<S.waves.length-1){assert.equal(e.phase,'active');assert.ok(e.nextWaveAt>e.time)}
  }
  assert.deepEqual(sizes,[2,3,3,2,1]);assert.equal(e.remaining,0)
  assert.equal(e.shots,33);assert.equal(e.phase,'exiting');assert.ok(e.exitAnchor.z<s.z);step(2)
  assert.equal(e.active,false);assert.equal(e.phase,'complete');assert.equal(e.drive(s,1/60),null);assert.equal(e.observe(s),false)
  const kills=e.kills;step(60);assert.equal(e.kills,kills);assert.equal(e.drones.length,11)
  e.reset();assert.ok(e.drones.every(d=>!d.initialized&&!d.spawned));assert.equal(e.waveIndex,-1);assert.equal(e.nextWaveAt,null);assert.ok(e.observe(s))
})

test('combat camera is close and asymmetric, keeps the route and drones visible, and releases orbit on exit',()=>{
  const camera=new PerspectiveCamera(70,16/9,.1,500),s={x:stage3PathX(-1122),z:-1122,height:9,yaw:Math.PI,travelYaw:Math.PI,speed:14},orbit={enabled:true,enableDamping:true,target:new Vector3(s.x,10,s.z),update(){camera.lookAt(this.target)}},runtime={orbit,cameraMode:0,cameraController:{config:bikeConfig,anchor:new Vector3(),center:state=>new Vector3(state.x,state.height+1.05,state.z),time:0}}
  camera.position.set(s.x,11.1,s.z+4.5);camera.lookAt(orbit.target)
  const view=new CycloneShooterCamera(camera,runtime),e=new CycloneShooterEncounter();e.phase='active'
  for(let i=0;i<180;i++){s.z-=14/60;e.time+=1/60;view.update(e,s,1/60)}
  camera.updateMatrixWorld(true)
  const rider=new Vector3(s.x,s.height+1.3,s.z).project(camera);assert.ok(rider.x<-.25&&rider.x>-.8);assert.ok(Math.abs(rider.y)<.8);assert.ok(camera.position.distanceTo(new Vector3(s.x,s.height+1.3,s.z))<3.6)
  for(const side of [-6,0,6]){const p=new Vector3(s.x+side,s.height+3,s.z-22).project(camera);assert.ok(Math.abs(p.x)<.8&&Math.abs(p.y)<.8)}
  assert.equal(orbit.enabled,false);e.phase='exiting';e.phaseTime=S.exitTime
  for(let i=0;i<90;i++)view.update(e,s,1/60)
  e.phase='complete';assert.equal(view.update(e,s,1/60),false);assert.equal(orbit.enabled,true);assert.equal(orbit.enableDamping,true);assert.equal(camera.fov,70)
  assert.ok(Number.isFinite(stage3Yaw(s.z)))
  view.started=true;runtime.cameraController=null;assert.doesNotThrow(()=>view.finish(s),'Unmount also releases the temporary camera safely')
})
