import test from 'node:test'
import assert from 'node:assert/strict'
import {Color,Group,Matrix4,Object3D,PerspectiveCamera,Ray,Scene,Vector3} from 'three'
import {VFXRuntime} from './VFXRuntime.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {CycloneShooterEncounter} from '../world/forest/CycloneShooterEncounter.js'
import {stage3PathX} from '../world/forest/forestStage3Config.js'

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
      assert.ok(fx.systems[n===3?1:0].particleNum>0)
      if(n<3)tick(.25)
    }
    assert.ok(fx.blastMesh.count>0,'Third hit has a visible expanding blast')
    for(const [i,ps]of fx.systems.entries()){assert.ok(ps.particleNum<=(i?96:48));assert.ok(ps.particles.every(p=>pools[i].includes(p)),'Quarks reuses its preallocated particles')}
    tick(1.4);assert.equal(fx.systems.reduce((n,ps)=>n+ps.particleNum,0),0);assert.equal(fx.flashMesh.count,0);assert.equal(fx.blastMesh.count,0)
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

test('two solid white prefire circles follow the rotated moving head apertures and disappear at release/death',()=>{
  const fx=new Plano3CombatVFX(),camera=new PerspectiveCamera(),root=new Group(),muzzles=[new Object3D(),new Object3D()],weapon={root:{visible:false}}
  muzzles[0].position.set(-1,4,.5);muzzles[1].position.set(1,4,.5);root.add(...muzzles)
  const scout={dead:false,charging:true,chargeLeft:.06,view:{root,muzzles}},e={active:true,time:1,bolts:[],scouts:[scout]},matrix=new Matrix4()
  try{
    for(const x of [0,8]){
      root.position.set(x,2,-15);root.rotation.y=.6;root.updateMatrixWorld(true);fx.update(0,e,weapon,camera)
      assert.equal(fx.cannonFlashes.count,2);assert.equal(fx.flashMesh.count,0,'Enemy charge never uses a star flash')
      for(let i=0;i<2;i++){
        fx.cannonFlashes.getMatrixAt(i,matrix)
        const position=new Vector3().setFromMatrixPosition(matrix),origin=muzzles[i].getWorldPosition(new Vector3())
        assert.ok(Math.abs(position.distanceTo(origin)-.055)<1e-5,'Circle sits just outside the real aperture')
      }
    }
    scout.chargeLeft=0;fx.update(0,e,weapon,camera);assert.equal(fx.cannonFlashes.count,0)
    scout.chargeLeft=.06;scout.dead=true;fx.update(0,e,weapon,camera);assert.equal(fx.cannonFlashes.count,0)
  }finally{fx.systems.forEach(ps=>ps.dispose());fx.dispose()}
})
