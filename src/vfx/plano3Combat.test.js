import test from 'node:test'
import assert from 'node:assert/strict'
import {Color,Group,Matrix4,Object3D,PerspectiveCamera,Ray,Scene,Vector3} from 'three'
import {VFXRuntime} from './VFXRuntime.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {CycloneShooterEncounter} from '../world/forest/CycloneShooterEncounter.js'
import {stage3PathX} from '../world/forest/forestStage3Config.js'
import {SCOUT_CANNON} from './combatVFXPresets.js'

test('Scout oval energy reuses bounded combat batches and clears on exit without needing a shot or impact',()=>{
  const runtime=new VFXRuntime(),fx=runtime.register('scout-combat',new Plano3CombatVFX()),scene=new Scene();scene.add(runtime.root)
  const camera=new PerspectiveCamera(50,16/9,.1,500),weapon={root:{visible:false}},bolt={active:true,style:'scoutOval',position:new Vector3(0,3,-10),velocity:new Vector3(0,-1,30)},encounter={active:true,time:1,bolts:[bolt]}
  try{
    const geometry=fx.ovals.geometry,buffer=fx.ovals.instanceMatrix
    fx.update(1/60,encounter,weapon,camera)
    assert.equal(fx.ovals.count,1);assert.equal(fx.ovalCores.count,1);assert.equal(fx.shell.count,0,'Scout shots have no rectangular laser streak')
    const matrix=new Matrix4();fx.ovals.getMatrixAt(0,matrix);const scale=new Vector3().setFromMatrixScale(matrix)
    assert.ok(scale.z>scale.x*1.5,'Energy projectile is elongated along its trajectory')
    assert.equal(fx.stats.shots,0);assert.equal(fx.hasEffects,false)
    encounter.active=false;encounter.time=2;fx.update(1/60,encounter,weapon,camera)
    assert.equal(fx.root.visible,false);assert.equal(fx.ovals.count,0);assert.equal(fx.ovalCores.count,0);assert.equal(fx.shell.count,0)
    assert.equal(fx.ovals.geometry,geometry);assert.equal(fx.ovals.instanceMatrix,buffer)
  }finally{runtime.dispose()}
})

test('Gallant muzzle stays on the moving weapon, emits a few forward Quarks sparks and reuses every resource',()=>{
 const runtime=new VFXRuntime(),fx=runtime.register('combat',new Plano3CombatVFX()),camera=new PerspectiveCamera(),muzzle=new Vector3(0,2,0),e={active:true,time:1,bolts:[]}
 new Scene().add(runtime.root)
 const weapon={root:{visible:true},getMuzzle:p=>p.copy(muzzle)},materials=fx.systems.map(s=>s.material),pool=fx.systems[5].particles.slice(),matrix=new Matrix4(),result={hit:null,solid:false,point:new Vector3(0,2,-20)}
 try{
  fx.shot(weapon,result,e);fx.update(.1,e,weapon,camera)
  assert.equal(fx.flashMesh.count,2);assert.equal(fx.muzzleHalos.count,1,'A slow birth frame still draws the muzzle and halo')
  const sparks=fx.systems[5];assert.ok(sparks.particleNum>0&&sparks.particleNum<=6)
  for(const p of sparks.particles.slice(0,sparks.particleNum)){assert.ok(p.position.distanceTo(muzzle)<.02);assert.ok(p.velocity.z<0);assert.ok(p.life<.11)}
  for(let i=0;i<15;i++){
   muzzle.x+=.4;fx.shot(weapon,result,e);fx.update(0,e,weapon,camera)
   fx.flashMesh.getMatrixAt(0,matrix);assert.ok(new Vector3().setFromMatrixPosition(matrix).distanceTo(muzzle)<1e-5)
   fx.muzzleHalos.getMatrixAt(0,matrix);assert.ok(new Vector3().setFromMatrixPosition(matrix).distanceTo(muzzle)<1e-5)
  }
  assert.ok(sparks.particleNum<=32);assert.ok(sparks.particles.every(p=>pool.includes(p)))
  assert.deepEqual(fx.systems.map(s=>s.material),materials);assert.equal(fx.stats.hits,0);assert.equal(fx.stats.explosions,0)
  for(let i=0;i<24;i++){runtime.update(1/120);fx.update(1/120,e,weapon,camera)}
  assert.equal(sparks.particleNum,0);assert.equal(fx.flashMesh.count,0);assert.equal(fx.muzzleHalos.count,0)
  assert.equal(fx.hitFlashMaterial.map,fx.star,'The approved hit flash keeps its existing texture')
 }finally{runtime.dispose()}
})

test('three real aimed hits produce two hit bursts followed by exactly one pooled drone explosion',()=>{
  const runtime=new VFXRuntime(),fx=runtime.register('combat',new Plano3CombatVFX()),scene=new Scene();scene.add(runtime.root)
  const e=new CycloneShooterEncounter(),s={x:stage3PathX(-1084),z:-1084,height:9,yaw:Math.PI,speed:14,riderMode:'mounted',frontGrounded:true,rearGrounded:true,airborne:false},camera=new PerspectiveCamera(58,16/9,.1,500),muzzle=new Vector3(s.x+.5,10.6,s.z-1),weapon={root:{visible:true},getMuzzle:p=>p.copy(muzzle)},ray=new Ray(new Vector3(s.x,10,s.z))
  camera.position.set(s.x,11,s.z+3);camera.lookAt(s.x,10,s.z-15);e.observe(s)
  const tick=(seconds)=>{for(let t=0;t<seconds;t+=1/120){e.drive(s,1/120);e.move(s,1/120);runtime.update(1/120);fx.update(1/120,e,weapon,camera)}}
  try{
    tick(2);const d=e.drones[0],pools=fx.systems.map(ps=>ps.particles.slice()),geometries=[fx.flashMesh.geometry,fx.shell.geometry]
    for(let n=1;n<=3;n++){
      ray.direction.copy(d.position).sub(ray.origin).normalize();const result=e.fire(ray,s);assert.equal(result.hp,3-n);assert.equal(result.destroyed,n===3);assert.equal(d.dead,n===3)
      fx.shot(weapon,result,e);fx.update(0,e,weapon,camera)
      assert.equal(fx.stats.hits,n);assert.equal(fx.stats.explosions,n===3?1:0);assert.ok(fx.muzzleLife>0)
      const matrix=new Matrix4();fx.flashMesh.getMatrixAt(0,matrix);assert.ok(new Vector3().setFromMatrixPosition(matrix).distanceTo(muzzle)<1e-3,'Flash originates at Gallant muzzle')
      const color=new Color();fx.shell.getColorAt(0,color);assert.ok(color.r>color.b*2&&color.g>color.b*2,'Player trace is yellow')
      if(n===3)assert.ok(fx.systems[1].particleNum>0)
      else{assert.equal(fx.systems[0].particleNum,0);assert.ok(fx.impacts.hitGlows.count>0)}
      if(n<3)tick(.25)
    }
    assert.ok(fx.impacts.hotCore.count>0&&fx.systems[4].particleNum>0,'Third hit starts the destruction core and fireball')
    for(const [i,ps]of fx.systems.entries()){assert.ok(ps.particleNum<=(i?96:48));assert.ok(ps.particles.every(p=>pools[i].includes(p)),'Quarks reuses its preallocated particles')}
    tick(2.1);assert.equal(fx.systems.reduce((n,ps)=>n+ps.particleNum,0),0);assert.equal(fx.flashMesh.count,0);assert.equal(fx.blastMesh.count,0)
    assert.deepEqual([fx.flashMesh.geometry,fx.shell.geometry],geometries)
    e.phase='complete';fx.update(1/60,e,weapon,camera);assert.equal(fx.root.visible,false);assert.equal(fx.shell.count,0)
    e.reset();fx.update(0,e,weapon,camera);assert.equal(fx.stats.shots,0)
  }finally{runtime.dispose()}
})

test('enemy lasers have purple shells and pale cores, stay on the actual bolt trajectory, and pause without advancing',()=>{
  const fx=new Plano3CombatVFX(),camera=new PerspectiveCamera(),weapon={root:{visible:false}},bolt={active:true,position:new Vector3(2,3,-12),velocity:new Vector3(0,-2,52)},e={active:true,time:2,bolts:[bolt]}
  try{
    fx.update(0,e,weapon,camera);assert.equal(fx.shell.count,1);assert.equal(fx.core.count,1)
    const color=new Color();fx.shell.getColorAt(0,color);assert.ok(color.b>color.g*3&&color.r>color.g*3)
    fx.core.getColorAt(0,color);assert.ok(color.r>.7&&color.b>.7)
    const matrix=new Matrix4();fx.core.getMatrixAt(0,matrix);const center=new Vector3().setFromMatrixPosition(matrix),expected=bolt.position.clone().addScaledVector(bolt.velocity,-.055/2);assert.ok(center.distanceTo(expected)<1e-5)
    const before=fx.core.instanceMatrix.array.slice();fx.update(0,e,weapon,camera);assert.deepEqual(fx.core.instanceMatrix.array,before)
    bolt.active=false;fx.update(.1,e,weapon,camera);assert.equal(fx.core.count,0)
  }finally{fx.systems.forEach(ps=>ps.dispose());fx.dispose()}
})

test('bright cannon glow follows only the firing aperture and remains briefly after release',()=>{
  const fx=new Plano3CombatVFX(),camera=new PerspectiveCamera(),root=new Group(),muzzles=[new Object3D(),new Object3D()],weapon={root:{visible:false}}
  muzzles[0].position.set(-1,4,.5);muzzles[1].position.set(1,4,.5);root.add(...muzzles)
  const scout={dead:false,side:0,cannonFlash:new Float32Array(2),charging:true,chargeLeft:.06,view:{root,muzzles}},e={active:true,time:1,bolts:[],scouts:[scout]},matrix=new Matrix4()
  try{
    for(const x of [0,8]){
      root.position.set(x,2,-15);root.rotation.y=.6;root.updateMatrixWorld(true);fx.update(0,e,weapon,camera)
      assert.equal(fx.cannonFlashes.count,1);assert.equal(fx.flashMesh.count,0,'Enemy charge never uses a star flash')
      for(const side of [0,1]){
        scout.side=side;fx.update(0,e,weapon,camera);fx.cannonFlashes.getMatrixAt(0,matrix)
        const position=new Vector3().setFromMatrixPosition(matrix),origin=muzzles[side].getWorldPosition(new Vector3())
        assert.ok(Math.abs(position.distanceTo(origin)-.055)<1e-5,'Circle sits just outside the real aperture')
      }
    }
    scout.chargeLeft=0;fx.update(0,e,weapon,camera);assert.equal(fx.cannonFlashes.count,0)
    scout.charging=false;scout.cannonFlash[0]=SCOUT_CANNON.duration;fx.update(0,e,weapon,camera);assert.equal(fx.cannonHalos.count,1)
    fx.cannonHalos.getMatrixAt(0,matrix);assert.ok(new Vector3().setFromMatrixScale(matrix).x>2,'Large soft glow surrounds the aperture')
    const glow=new Color();fx.cannonHalos.getColorAt(0,glow);assert.ok(glow.r>3&&glow.b>2,'HDR halo remains bright in daylight')
    assert.ok(fx.impacts.lights.some(light=>light.intensity>5),'The muzzle also illuminates the nearby head with an existing light slot')
    assert.equal(fx.cannonHaloMaterial.depthTest,true,'Glow cannot paint through Scott')
    scout.cannonFlash[0]=0
    scout.chargeLeft=.06;scout.dead=true;fx.update(0,e,weapon,camera);assert.equal(fx.cannonFlashes.count,0)
  }finally{fx.systems.forEach(ps=>ps.dispose());fx.dispose()}
})

test('all thirty Scouts can show both cannon afterglows without allocating new render resources',()=>{
 const fx=new Plano3CombatVFX(),camera=new PerspectiveCamera(),weapon={root:{visible:false}},root=new Group(),muzzles=[new Object3D(),new Object3D()];root.add(...muzzles);root.updateMatrixWorld(true)
 const scouts=Array.from({length:30},()=>({dead:false,charging:false,cannonFlash:[.13,.1],view:{root,muzzles}})),e={active:true,time:1,bolts:[],scouts},buffer=fx.cannonHalos.instanceMatrix,material=fx.cannonHaloMaterial
 try{for(let i=0;i<60;i++)fx.update(1/60,e,weapon,camera);assert.equal(fx.cannonFlashes.count,60);assert.equal(fx.cannonHalos.count,60);assert.equal(fx.cannonHalos.instanceMatrix,buffer);assert.equal(fx.cannonHaloMaterial,material);fx.clear();assert.equal(fx.cannonHalos.count,0)}finally{fx.systems.forEach(ps=>ps.dispose());fx.dispose()}
})
