import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3,Group,PerspectiveCamera,Ray,Vector2,Vector3} from 'three'
import {GallantAimLock} from './GallantAimLock.js'
import {GallantHitscan} from './GallantShot.js'
import {registerMeleeTarget} from '../player/meleeWorld.js'
import {boxCollider,registerColliders} from '../player/collisionWorld.js'
import {CycloneShooterEncounter} from '../world/forest/CycloneShooterEncounter.js'
import {FOREST_STAGE3 as S} from '../world/forest/forestStage3Config.js'

const scout=(x,z)=>({position:new Vector3(x,0,z),height:5.2,radius:1.5,health:16,dead:false,meleeEnabled:true,view:{root:new Group()},receiveHit(){this.health--;this.dead=this.health===0;return true}})
function setup(){const camera=new PerspectiveCamera(58,16/9,.1,500);camera.position.set(0,2.86,0);camera.lookAt(0,2.86,-20);camera.updateMatrixWorld(true);return{camera,lock:new GallantAimLock(),hitscan:new GallantHitscan(),pointer:new Vector2(),state:{}}}

test('aim lock selects the Scout nearest the reticle and follows it without jumping to a competing enemy',()=>{
 const {camera,lock,hitscan,pointer,state}=setup(),a=scout(.3,-20),b=scout(2,-25),targets=[b,a]
 assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),a)
 a.position.x=4;b.position.x=0;assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),a);assert.equal(lock.point.x,4);assert.ok(lock.screen.x>0)
 assert.equal(lock.update(false,camera,pointer,targets,hitscan,state),null)
 assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),b)
 b.dead=true;assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),null,'An off-reticle survivor is not acquired when the locked target dies')
})

test('aim lock rejects hidden, offscreen, distant and occluded Scouts and clears on reset',()=>{
 const {camera,lock,hitscan,pointer,state}=setup(),a=scout(0,-20),targets=[a]
 for(const change of [()=>a.view.root.visible=false,()=>a.position.z=-70,()=>a.position.z=10,()=>a.position.x=100]){a.view.root.visible=true;a.position.set(0,0,-20);change();assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),null)}
 a.position.set(0,0,-20);a.view.root.visible=true;const remove=registerColliders([boxCollider(new Box3(new Vector3(-4,0,-12),new Vector3(4,8,-10)))])
 try{assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),null)}finally{remove()}
 assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),a);assert.equal(lock.update(false,camera,pointer,targets,hitscan,{}),null)
})

test('locked fire uses real muzzle collisions, consumes sixteen hits, and cannot shoot through cover beside Scott',()=>{
 const {camera,lock,hitscan,pointer,state}=setup(),a=scout(0,-20),targets=[a],remove=registerMeleeTarget(a),muzzle=new Vector3(2,2,0),ray=new Ray()
 try{
  assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),a)
  const wall=registerColliders([boxCollider(new Box3(new Vector3(1.3,0,-4),new Vector3(2.5,4,-2)))])
  ray.set(muzzle,lock.point.clone().sub(muzzle).normalize())
  try{assert.equal(hitscan.fire(ray).hit,null);assert.equal(a.health,16)}finally{wall()}
  for(let i=1;i<=16;i++){const hit=hitscan.fire(ray);assert.equal(hit.hit,a);assert.equal(hit.destroyed,i===16)}
  assert.equal(lock.update(true,camera,pointer,targets,hitscan,state),null)
 }finally{remove()}
})

test('violet drone lock tracks its centre, preserves three-hit fire and releases on death or a wave reset',()=>{
 const {camera,lock,hitscan,pointer,state}=setup(),encounter=new CycloneShooterEncounter(),a=encounter.drones[0],b=encounter.drones[1]
 encounter.phase='active';Object.assign(a,{spawned:true,initialized:true});a.position.set(.3,2.86,-20);b.position.set(0,2.86,-15)
 assert.equal(lock.update(true,camera,pointer,encounter.drones,hitscan,state),a,'Unspawned drones are never acquired')
 b.spawned=true;a.position.x=4;assert.equal(lock.update(true,camera,pointer,encounter.drones,hitscan,state),a)
 assert.deepEqual(lock.point.toArray(),a.position.toArray(),'Drones use their cube centre, without a Scout height offset')
 const ray=new Ray(),muzzle=new Vector3(2,2,0)
 for(let i=0;i<S.droneHealth;i++){
  encounter.fireCooldown=0;ray.set(muzzle,lock.point.clone().sub(muzzle).normalize());const shot=encounter.fire(ray,{x:0,z:0,yaw:Math.PI})
  assert.equal(shot.hit,a.id);assert.equal(a.hp,S.droneHealth-i-1);assert.equal(shot.destroyed,i===S.droneHealth-1)
 }
 assert.equal(encounter.kills,1);assert.equal(encounter.shots,S.droneHealth)
 assert.equal(lock.update(true,camera,pointer,encounter.drones,hitscan,state),b)
 encounter.reset();assert.equal(lock.update(true,camera,pointer,encounter.drones,hitscan,state),null)
})
