import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Box3,DataTexture,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {CuffMissiles} from './CuffMissiles.js'
import {GallantHitscan} from './GallantShot.js'
import {DesertScoutPatrol} from '../world/forest/DesertScoutPatrol.js'
import {VFXRuntime} from '../vfx/VFXRuntime.js'
import {CuffMissileVFX,MISSILE_SMOKE_LIMIT} from '../vfx/CuffMissileVFX.js'
import {boxCollider,registerColliders} from '../player/collisionWorld.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
let asset
async function setup({launchAtlas=null}={}){
 if(!asset){const b=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb');asset=new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
 const source=(await asset).scene,root=source.clone(true);root.updateMatrixWorld(true)
 const guards={groups:['Right','Left'].map(side=>({bone:{name:`mixamorig${side}ForeArm`},parts:['Upper','Lower'].map(level=>{const mesh=root.getObjectByName(`Arm_Guard_Cap_${level}${side==='Right'?'_1':''}`);return{mesh,visible:true,record:{key:mesh.name}}})}))}
 const missiles=new CuffMissiles(),state={},battle={},runtime=new VFXRuntime(),vfx=runtime.register('missiles',new CuffMissileVFX({launchAtlas})),query=new GallantHitscan(),camera=new PerspectiveCamera();new Group().add(runtime.root);missiles.sync(state,battle,guards)
 const views=Array.from({length:5},()=>{const root=new Group();return{root,muzzles:[new Group(),new Group()]}}),patrol=new DesertScoutPatrol(views,()=>0,()=>.5)
 for(const r of patrol.scouts){r.position.set(0,0,24);r.meleeEnabled=true;r.view.root.visible=true}
 let hits=0;const tick=(dt=1/120)=>{missiles.step(dt,query,vfx,()=>hits++);runtime.update(dt);vfx.present(missiles.records,camera)}
 return{missiles,state,battle,guards,runtime,vfx,query,patrol,tick,hits:()=>hits,dispose(){missiles.dispose();runtime.dispose()}}
}

test('four real cuff caps are distinct live launch anchors and follow the complete cuff transform',async()=>{
 const f=await setup(),{missiles:m,patrol:p}=f
 try{assert.equal(m.launchers.length,4);assert.equal(new Set(m.launchers.map(l=>l.mesh)).size,4);const l=m.launchers[0];l.mesh.parent.position.set(2,3,-4);l.mesh.parent.rotation.y=.7;l.mesh.parent.updateMatrixWorld(true);assert.ok(m.launch(p.scouts[0],true,f.vfx));assert.ok(m.records[0].position.distanceTo(l.mesh.localToWorld(l.local.clone()))<1e-8);assert.equal(m.remaining,3);m.present(true);assert.equal(l.mesh.visible,false);m.reset();assert.equal(l.mesh.visible,true)}finally{f.dispose()}
})

test('one guided impact kills a full-health Scout once; the path oscillates and smoke stays in world space',async()=>{
 const f=await setup(),{missiles:m,patrol:p,vfx}=f
 try{const t=p.scouts[0];assert.equal(t.health,16);assert.ok(m.launch(t,true,vfx));const samples=[];for(let i=0;i<480&&!t.dead;i++){t.position.x=Math.sin(i/120)*2;f.tick();samples.push(m.records[0].position.x)}assert.ok(t.dead);assert.equal(t.hits,1);assert.equal(p.kills,1);assert.equal(f.hits(),1);assert.ok(Math.max(...samples)-Math.min(...samples)>1);assert.ok(vfx.emitted>30);assert.ok(vfx.system.particleNum>0);assert.ok(vfx.system.particleNum<=MISSILE_SMOKE_LIMIT);for(let i=0;i<60;i++)f.tick();assert.equal(p.kills,1);assert.equal(f.hits(),1)}finally{f.dispose()}
})

test('cuff flight reaches a locked Scout beyond the old Gallant range without increasing missile speed',async()=>{
 const f=await setup(),m=f.missiles,t=f.patrol.scouts[0]
 try{
  t.position.set(0,0,210);assert.ok(m.launch(t,true,f.vfx))
  for(let i=0;i<960&&!t.dead;i++)f.tick()
  assert.equal(t.dead,true);assert.equal(m.stats.hits,1);assert.equal(m.remaining,3)
 }finally{f.dispose()}
})

test('four missiles per battle cannot be replenished by changing form, pause freezes flight, and checkpoint reset reloads',async()=>{
 const f=await setup(),{missiles:m,patrol:p}=f
 try{
  assert.equal(m.launch(null,true,f.vfx),false);assert.equal(m.launch(p.scouts[0],false,f.vfx),false);assert.equal(m.remaining,4)
  for(let i=0;i<4;i++){assert.ok(m.launch(p.scouts[i],true,f.vfx));assert.equal(m.launch(p.scouts[i],true,f.vfx),false);const before=m.records[i].position.clone(),age=m.records[i].age;f.tick(0);assert.equal(m.records[i].age,age);assert.deepEqual(m.records[i].position,before);for(let n=0;n<60;n++)f.tick();m.sync(f.state,f.battle,f.guards)}
  assert.equal(m.remaining,0);assert.equal(m.launch(p.scouts[4],true,f.vfx),false);assert.equal(m.stats.launched,4)
  m.sync({},f.battle,f.guards);assert.equal(m.remaining,4);assert.ok(m.records.every(r=>!r.active));m.launch(p.scouts[4],true,f.vfx);m.sync(m.state,{},f.guards);assert.equal(m.remaining,4)
 }finally{f.dispose()}
})

test('world cover intercepts the missile and pooled VFX reuse their buffers after repeated resets',async()=>{
 const f=await setup(),{missiles:m,patrol:p,vfx}=f,remove=registerColliders([boxCollider(new Box3(new Vector3(-10,-10,5),new Vector3(10,20,6)))])
 try{const material=vfx.material,geometry=vfx.geometry,pool=vfx.system.particles.slice(),buffer=vfx.glows.instanceMatrix;assert.ok(m.launch(p.scouts[0],true,vfx));for(let i=0;i<240;i++)f.tick();assert.equal(p.scouts[0].health,16);assert.equal(m.stats.blocked,1);assert.equal(f.hits(),0);for(let k=0;k<8;k++){m.reset();vfx.clear();m.launch(p.scouts[0],true,vfx);for(let i=0;i<45;i++)f.tick()}assert.equal(vfx.material,material);assert.equal(vfx.geometry,geometry);assert.equal(vfx.glows.instanceMatrix,buffer);assert.ok(vfx.system.particles.every(p=>pool.includes(p)));assert.ok(vfx.system.particleNum<=MISSILE_SMOKE_LIMIT)}finally{remove();f.dispose()}
})

test('a relaxed downward cuff turns toward its target before striking the ground',async()=>{
 const f=await setup(),m=f.missiles,remove=registerColliders([boxCollider(new Box3(new Vector3(-100,-5,-100),new Vector3(100,0,100)))])
 try{m.remaining=3;const l=m.launchers[1];l.mesh.parent.position.y=3;l.mesh.parent.rotation.x=Math.PI/2;l.mesh.parent.updateMatrixWorld(true);assert.ok(m.launch(f.patrol.scouts[0],true,f.vfx));let minimum=Infinity;for(let i=0;i<480&&!f.patrol.scouts[0].dead;i++){f.tick();minimum=Math.min(minimum,m.records[1].position.y)}assert.ok(f.patrol.scouts[0].dead);assert.equal(m.stats.blocked,0);assert.ok(minimum>0)}finally{remove();f.dispose()}
})

test('the flying missile is the unchanged original circular cap, with the exact departure matrix and shared material',async()=>{
 const f=await setup(),{missiles:m,vfx}=f
 try{const l=m.launchers[0],positions=l.mesh.geometry.attributes.position.array.slice();assert.ok(m.launch(f.patrol.scouts[0],true,vfx));vfx.present(m.records,new PerspectiveCamera());const cap=vfx.caps[0];assert.equal(cap.geometry,l.mesh.geometry);assert.equal(cap.material,l.mesh.material);assert.ok(cap.matrix.elements.every((n,i)=>Math.abs(n-l.mesh.matrixWorld.elements[i])<1e-8));for(let i=0;i<30;i++)f.tick();assert.deepEqual(l.mesh.geometry.attributes.position.array,positions);assert.ok(cap.matrix.elements.every(Number.isFinite));assert.equal(vfx.root.getObjectByName('Cuff_missile_red_noses'),undefined);m.reset();vfx.clear();assert.equal(cap.visible,false)}finally{f.dispose()}
})

test('a boosted launch is rendered at the live cuff for its birth frame and inherits Scott velocity',async()=>{
 for(const dt of [1/120,1/30,.1]){const f=await setup(),m=f.missiles,l=m.launchers[1],velocity=new Vector3(0,0,24);try{l.mesh.parent.position.set(3,4,5);l.mesh.parent.updateMatrixWorld(true);m.remaining=3;assert.ok(m.launch(f.patrol.scouts[0],true,f.vfx,velocity));const birth=m.records[1].position.clone(),matrix=l.mesh.matrixWorld.clone();m.step(dt,f.query,f.vfx);f.vfx.present(m.records,new PerspectiveCamera());assert.deepEqual(m.records[1].position,birth);assert.equal(m.records[1].age,0);assert.ok(f.vfx.caps[1].matrix.elements.every((n,i)=>Math.abs(n-matrix.elements[i])<1e-8));m.step(dt,f.query,f.vfx);assert.ok(m.records[1].position.z>birth.z+velocity.z*dt*.7,'The cap is not left behind by a moving cuff');assert.deepEqual(m.records[1].inheritedVelocity,velocity)}finally{f.dispose()}}
})

test('launch smoke forms a larger white ball at the cuff and follows its brief ejection while boosting',async()=>{
 const f=await setup(),m=f.missiles,l=m.launchers[0],camera=new PerspectiveCamera();try{m.launch(f.patrol.scouts[0],true,f.vfx);assert.ok(f.vfx.system.particleNum>=34);assert.ok(f.vfx.size.a>=.5);l.mesh.parent.position.z+=1;l.mesh.parent.updateMatrixWorld(true);const current=l.mesh.localToWorld(l.local.clone());f.vfx.present(m.records,camera,1/60);const ps=f.vfx.system;assert.ok(ps.particleNum>34);const newest=ps.particles[ps.particleNum-1];assert.ok(newest.position.distanceTo(current)<.3);assert.ok(newest.startColor.x>.9&&newest.startColor.z>.9);const emitted=f.vfx.emitted;f.vfx.present(m.records,camera,0);assert.equal(f.vfx.emitted,emitted);assert.ok(ps.particleNum<=MISSILE_SMOKE_LIMIT)}finally{f.dispose()}
})

test('dense smoke keeps a fresh wake inside the same pool and preserves the cuff ball when capacity is reached',async()=>{
 const f=await setup(),v=f.vfx,ps=v.system,pool=ps.particles.slice(),buffer=v.batch.geometry.attributes.offset
 try{
  f.missiles.launch(f.patrol.scouts[0],true,v)
  const cloud=ps.particles.slice(0,ps.particleNum);assert.ok(cloud.length>=42)
  for(let i=0;i<400;i++)v.puff(new Vector3(0,3,i*.65),new Vector3(0,0,1))
  assert.equal(ps.particleNum,MISSILE_SMOKE_LIMIT);assert.ok(v.recycled>0)
  assert.ok(cloud.every(p=>ps.particles.slice(0,ps.particleNum).includes(p)),'Fresh cuff smoke takes priority over old trail samples')
  assert.ok(ps.particles.slice(0,ps.particleNum).some(p=>!p.cuffLaunch&&p.position.z>399*.65-.05),'A full pool still emits at the latest missile position')
  assert.ok(ps.particles.every(p=>pool.includes(p)));assert.ok(ArrayBuffer.isView(buffer.array??buffer.data?.array));assert.equal(v.batch.geometry.attributes.offset,buffer)
  const tail=ps.particles.slice(0,ps.particleNum).find(p=>!p.cuffLaunch),before=tail.position.clone()
  f.missiles.launchers[0].mesh.parent.position.x+=100
  f.runtime.update(1/60)
  assert.ok(tail.position.distanceTo(before)<.02,'Wake remains suspended in world space instead of following the cuff')
 }finally{f.dispose()}
})

test('smoke emission/rendering leaves every missile trajectory sample exactly identical to flight with no VFX',async()=>{
 for(const dt of [1/120,1/30,.1]){
   const launchAtlas=new DataTexture(),f=await setup({launchAtlas}),control=await setup(),velocity=new Vector3(12,3,24)
  try{
   const a=f.patrol.scouts[0],b=control.patrol.scouts[0];a.position.set(4,8,100);b.position.copy(a.position)
   assert.ok(f.missiles.launch(a,true,f.vfx,velocity));assert.ok(control.missiles.launch(b,true,null,velocity))
   const snapshot=m=>m.records.map(r=>({active:r.active,age:r.age,smoke:r.smoke,position:r.position.toArray(),base:r.base.toArray(),heading:r.heading.toArray(),goal:r.goal.toArray(),previous:r.previous.toArray(),inheritedVelocity:r.inheritedVelocity.toArray()}))
   for(let i=0;i<Math.ceil(5/dt)&&!a.dead;i++){
    a.position.x=b.position.x=4+Math.sin(i*dt)*3
    f.missiles.step(dt,f.query,f.vfx);control.missiles.step(dt,control.query,null)
    const before=snapshot(f.missiles);assert.deepEqual(before,snapshot(control.missiles))
    f.runtime.update(dt);f.vfx.present(f.missiles.records,new PerspectiveCamera(),dt)
    assert.deepEqual(snapshot(f.missiles),before,'Smoke can only read missile state')
   }
   assert.equal(a.dead,true);assert.equal(b.dead,true);assert.deepEqual(f.missiles.stats,control.missiles.stats)
  }finally{f.dispose();control.dispose();launchAtlas.dispose()}
 }
})
