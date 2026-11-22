import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3,DoubleSide,Mesh,MeshBasicMaterial,PlaneGeometry,Ray,Raycaster,Scene,Vector3} from 'three'
import {GallantHitscan,GALLANT_FIRE} from './GallantShot.js'
import {registerMeleeTarget} from '../player/meleeWorld.js'
import {boxCollider,cylinderCollider,registerColliders,rayColliderDistance} from '../player/collisionWorld.js'
import {registerRideSurfaces,raycastRideSurfaces} from './rideSurface.js'
import {weatheringState} from './weatheringState.js'
import {createSoilLoad,evolveSoil} from './weatheringModel.js'
import {createScottSoilLoad,evolveScottSoil} from './scottSoilModel.js'

test('Gallant uses live compatible targets, actual terrain and nearest solid obstacles; damage never passes through cover',()=>{
  const weapon=new GallantHitscan(),ray=new Ray(new Vector3(0,1,0),new Vector3(0,0,1))
  const enemy={position:new Vector3(0,0,8),radius:.4,height:1.8,health:100,state:'IDLE',hits:0,
    syncPosition(){},receiveHit(damage){this.health-=damage;this.hits++;return true}}
  const remove=registerMeleeTarget(enemy)
  try{
    const shot=weapon.fire(ray)
    assert.equal(shot.hit,enemy);assert.equal(enemy.health,100-GALLANT_FIRE.damage);assert.equal(enemy.hits,1)
    assert.ok(Math.abs(shot.point.z-7.6)<1e-8)
    const wall=registerColliders([boxCollider(new Box3(new Vector3(-1,0,3),new Vector3(1,3,4)))])
    try{const blocked=weapon.fire(ray);assert.equal(blocked.hit,null);assert.equal(blocked.solid,true);assert.equal(blocked.point.z,3);assert.ok(blocked.normal.equals(new Vector3(0,0,-1)));assert.equal(enemy.hits,1)}finally{wall()}
    const tree=registerColliders([cylinderCollider(0,4,.5,0,5)])
    try{assert.equal(weapon.fire(ray).point.z,3.5);assert.equal(enemy.hits,1)}finally{tree()}
    const scene=new Scene(),terrain=new Mesh(new PlaneGeometry(20,20).rotateX(-Math.PI/2),new MeshBasicMaterial())
    terrain.userData.rideSurface=true;scene.add(terrain);scene.updateMatrixWorld(true)
    const unregister=registerRideSurfaces(scene)
    try{
      ray.direction.set(0,-1,1).normalize()
      const ground=weapon.fire(ray);assert.equal(ground.hit,null);assert.equal(ground.solid,true);assert.ok(Math.abs(ground.point.y)<1e-7);assert.equal(ground.object,terrain);assert.ok(ground.normal.y>.99);assert.equal(enemy.hits,1)
      terrain.userData.rideSurfaceActive=false;assert.equal(weapon.cast(ray).solid,false)
    }finally{unregister();terrain.geometry.dispose();terrain.material.dispose()}
    ray.direction.set(0,0,1);enemy.health=0;enemy.state='DEAD'
    assert.equal(weapon.fire(ray).hit,null);assert.equal(enemy.hits,1)
  }finally{remove()}
})

test('solid cylinder hits handle vertical caps, grazing rays and origins already inside cover',()=>{
  const c=cylinderCollider(0,0,1,0,3),ray=new Ray(new Vector3(0,5,0),new Vector3(0,-1,0))
  assert.equal(rayColliderDistance(ray,c),2)
  ray.origin.set(0,1,0);assert.equal(rayColliderDistance(ray,c),0)
  ray.origin.set(1.1,5,0);assert.equal(rayColliderDistance(ray,c),Infinity)
  ray.origin.set(1,1,-3);ray.direction.set(0,0,1);assert.equal(rayColliderDistance(ray,c),3)
})

test('terrain-grid weapon rays match rendered triangles across oblique rays and transformed terrain',()=>{
  const geometry=new PlaneGeometry(24,24,24,24).rotateX(-Math.PI/2),p=geometry.attributes.position
  for(let i=0;i<p.count;i++)p.setY(i,Math.sin(p.getX(i)*.4)*Math.cos(p.getZ(i)*.3))
  geometry.computeBoundingBox()
  const mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide})),scene=new Scene()
  mesh.position.set(4,2,7);mesh.scale.setScalar(1.2);mesh.rotation.y=.4;mesh.userData.rideSurface=true;scene.add(mesh);scene.updateMatrixWorld(true)
  const unregister=registerRideSurfaces(scene),raycaster=new Raycaster();raycaster.far=55;raycaster.near=.001
  try{
    for(let i=0;i<120;i++){
      raycaster.ray.origin.set((i%12-6)*3,8,Math.floor(i/12)*3-9)
      raycaster.ray.direction.set(i%3===0?0:Math.sin(i)*.6,-1,i%5===0?0:Math.cos(i)*.5).normalize()
      const expected=raycaster.intersectObject(mesh,false)[0],actual=raycastRideSurfaces(raycaster)
      assert.equal(!!actual,!!expected)
      if(actual)assert.ok(Math.abs(actual.distance-expected.distance)<1e-7)
    }
  }finally{unregister();geometry.dispose();mesh.material.dispose()}
})

test('Scott stays below 25% while the bike can accumulate full dirt, including bypassed settings',()=>{
  weatheringState.set({maximum:10});assert.equal(weatheringState.snapshot().maximum,1)
  const config={...weatheringState.defaults,maximum:100,buildup:4,scottBuildup:4},bike=createSoilLoad(),scott=createScottSoilLoad()
  const state={speed:80,acceleration:60,slip:10,steer:1,handbrake:1,rearLateralVelocity:40,frontAngularSpeed:200,rearAngularSpeed:200}
  const wheel={grounded:true,surface:'dirt',radius:.4,position:new Vector3(),forward:new Vector3(0,0,1)},wheels={front:wheel,rear:wheel}
  const samples=Object.fromEntries(['boots','legs','arms','torso'].map(k=>[k,[{position:new Vector3()}]]))
  for(let i=0;i<3600;i++){
    evolveSoil(bike,wheels,state,config,1,.1,{frontRadius:.4,rearRadius:.4},1)
    evolveScottSoil(scott,samples,wheels,state,config,1,1,.1)
    for(const value of Object.values(bike))assert.ok(value>=0&&value<=1)
    for(const value of Object.values(scott))assert.ok(value>=0&&value<=.25)
  }
  assert.equal(Math.max(...Object.values(bike)),1);assert.equal(Math.max(...Object.values(scott)),.25)
  weatheringState.reset()
})
