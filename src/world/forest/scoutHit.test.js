import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DataTexture,Group,PerspectiveCamera,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createScoutView,SCOUT_ASSET} from './invidScoutAsset.js'
import {createScoutSquad,renderScoutSquad,disposeScoutSquad} from './scoutSquadRendering.js'
import {VFXRuntime} from '../../vfx/VFXRuntime.js'
import {Plano3CombatVFX} from '../../vfx/Plano3CombatVFX.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/invid-scout-rigged.glb'),asset=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
const state=()=>({dead:false,mode:'flight',velocity:new Vector3(),position:new Vector3(),height:5.2,radius:2.3,health:10,hitVersion:0,clawAge:Infinity})
async function views(){const a=await asset;return[createScoutView(a.scene,0,a.animations),createScoutView(a.scene,0,a.animations)]}

test('left/right arm hits turn the body toward that side and recoil only the struck arm over the native clip',async()=>{
 for(const joint of[1,2]){
  const [v,control]=await views(),s=state(),m=v.motion,c=control.motion
  try{
   m.update(s,.016,()=>0);c.update(s,.016,()=>0);const before=JSON.stringify(s)
   m.hitReaction.hit(joint,new Vector3(0,0,1),new Vector3(joint===1?.5:-.5,.2,.4))
   for(let i=0;i<5;i++){m.update(s,1/60,()=>0);c.update(s,1/60,()=>0)}
   assert.ok((m.body.rotation.y-c.body.rotation.y)*(joint===1?1:-1)>.035)
   assert.ok(m.body.position.z<c.body.position.z-.01)
   assert.ok(m.joints[joint].rotation.x>c.joints[joint].rotation.x+.08)
   for(const other of[1,2,3,4].filter(i=>i!==joint))assert.ok(m.joints[other].quaternion.angleTo(c.joints[other].quaternion)<1e-7)
   const pose=m.joints.map(j=>j.quaternion.toArray()),age=m.hitReaction.impulses[joint].age;m.update(s,0,()=>0);assert.equal(m.hitReaction.impulses[joint].age,age);assert.deepEqual(m.joints.map(j=>j.quaternion.toArray()),pose)
   for(let i=0;i<35;i++){m.update(s,1/60,()=>0);c.update(s,1/60,()=>0)}
   for(let i=0;i<5;i++){assert.ok(m.joints[i].quaternion.angleTo(c.joints[i].quaternion)<1e-7);assert.ok(m.joints[i].position.distanceTo(c.joints[i].position)<1e-7)}
   assert.equal(JSON.stringify(s),before)
  }finally{m.dispose();c.dispose()}
 }
})
test('leg hits kick that leg backward; repeated shots stay bounded and reset to the unchanged native pose',async()=>{
 const [v,control]=await views(),s=state(),m=v.motion,c=control.motion
 try{
  m.update(s,.016,()=>0);c.update(s,.016,()=>0)
  for(let i=0;i<16;i++){m.hitReaction.hit(3,new Vector3(0,0,1),new Vector3(.2,-.6,.2));m.update(s,1/60,()=>0);c.update(s,1/60,()=>0)}
  assert.ok(m.joints[3].rotation.x>c.joints[3].rotation.x+.1);assert.ok(m.joints[3].rotation.x-c.joints[3].rotation.x<.44)
  assert.ok(m.joints[4].quaternion.angleTo(c.joints[4].quaternion)<1e-7)
  assert.ok(Math.abs(m.body.rotation.y-c.body.rotation.y)<=.16)
  m.reset();c.reset();for(let i=0;i<5;i++){assert.deepEqual(m.joints[i].position.toArray(),c.joints[i].position.toArray());assert.deepEqual(m.joints[i].quaternion.toArray(),c.joints[i].quaternion.toArray())}
 }finally{m.dispose();c.dispose()}
})

export function frontHitTriangle(mesh,joint){
 const g=mesh.geometry,index=g.index,j=g.attributes.skinIndex,n=g.attributes.normal,p=g.attributes.position,point=new Vector3(),best=new Vector3();let score=-Infinity
 for(let f=0;f<index.count;f+=3){
  const a=index.getX(f),b=index.getX(f+1),c=index.getX(f+2)
  if(j.getX(a)!==joint||j.getX(b)!==joint||j.getX(c)!==joint||(n.getZ(a)+n.getZ(b)+n.getZ(c))/3<.15)continue
  point.fromBufferAttribute(p,a).add(new Vector3().fromBufferAttribute(p,b)).add(new Vector3().fromBufferAttribute(p,c)).divideScalar(3)
  const value=joint===1?point.x*3+point.z:joint===2?-point.x*3+point.z:joint>=3?-point.y*3+point.z:point.y+point.z
  if(value>score){score=value;mesh.getVertexPosition(a,best);best.add(mesh.getVertexPosition(b,new Vector3())).add(mesh.getVertexPosition(c,new Vector3())).divideScalar(3)}
 }
 return mesh.localToWorld(best)
}
test('real mesh ray contacts identify the hit limb and leave four bounded burn marks attached to animated source coordinates',async()=>{
 const [v,other]=await views(),runtime=new VFXRuntime(),fx=runtime.register('test',new Plano3CombatVFX()),s=state(),unhit=state(),scene=new Group(),squad=createScoutSquad(scene,[v,other])
 s.view=v;unhit.view=other;other.root.position.x=10;squad.scouts=[s,unhit];v.root.visible=other.root.visible=true;v.motion.sync();other.motion.sync()
 const mesh=v.levels[0],g=mesh.geometry,positions=g.attributes.position.array.slice(),material=mesh.material,from=new Vector3(),weapon={root:{visible:true},getMuzzle:p=>p.copy(from)},context={active:true,time:1,bolts:[]}
 try{
  for(const joint of[1,2,3,4,0,1,3]){
   v.motion.hitReaction.reset();v.motion.sync();const point=frontHitTriangle(mesh,joint);from.copy(point).add(new Vector3(0,0,8));s.hitVersion++
   fx.shot(weapon,{hit:s,point,destroyed:false},context)
   assert.equal(fx.contactJoint,joint,'Surface triangle selects the actual rigid limb')
   assert.equal(v.motion.hitReaction.lastJoint,joint)
  }
  const visual=fx.scoutVisual(s);assert.equal(visual.scorches.length,4);assert.equal(visual.scorches.filter(m=>m.radius>0).length,4);assert.equal(visual.emissive,0);assert.equal(visual.tint.getHex(),0xffffff)
  const mark=visual.scorches[(visual.scorchCursor-1)%4],bind=mark.position.clone(),before=bind.clone().applyMatrix4(v.motion.matrices[3]).applyMatrix4(mesh.matrixWorld)
  v.motion.joints[3].rotation.x+=.3;v.root.position.x+=2;v.motion.sync();const after=bind.clone().applyMatrix4(v.motion.matrices[3]).applyMatrix4(mesh.matrixWorld);assert.ok(after.distanceTo(before)>1);assert.deepEqual(mark.position,bind)
  fx.update(0,context,weapon,new PerspectiveCamera());assert.ok(visual.hitRecord.position.distanceTo(after)<1e-6,'Sprite and glow follow both the rig joint and whole Scout translation')
  renderScoutSquad(squad,new Vector3(0,3,8),fx)
  assert.ok(squad.uniforms.uScoutHitPoint.value.slice(0,4).every(p=>p.w>0));assert.ok(squad.uniforms.uScoutHitPoint.value.slice(4,8).every(p=>p.w===0),'Other Invids never inherit the mark')
  assert.equal(mesh.material,material);assert.deepEqual(g.attributes.position.array,positions);assert.equal(g.getAttribute('aScoutHitId'),undefined,'Original shared geometry stays untouched')
  s.hitVersion=0;renderScoutSquad(squad,new Vector3(0,3,8),fx);assert.ok(squad.uniforms.uScoutHitPoint.value.every(p=>p.w===0),'Checkpoint reset clears surviving enemies too')
  fx.clear();renderScoutSquad(squad,new Vector3(0,3,8),fx);assert.ok(squad.uniforms.uScoutHitPoint.value.every(p=>p.w===0))
 }finally{runtime.dispose();disposeScoutSquad(squad)}
})
test('Scout liquid starts on the struck rig joint and a lethal hit emits one larger splash at the real animated head',async()=>{
 const [v,other]=await views(),sheet=new DataTexture(new Uint8Array([40,58,51,255]),1,1),runtime=new VFXRuntime(),fx=runtime.register('test',new Plano3CombatVFX({explosionAtlases:{blood:[sheet,sheet]},bloodRandom:()=>0})),s=state(),from=new Vector3(),weapon={root:{visible:false},getMuzzle:p=>p.copy(from)},context={active:true,time:1,bolts:[]},camera=new PerspectiveCamera()
 s.view=v;v.root.visible=true;v.root.position.set(7,2,-8);v.root.rotation.y=.2;v.motion.sync()
 try{
  const point=frontHitTriangle(v.levels[0],1);from.copy(point).add(new Vector3(0,0,8));fx.shot(weapon,{hit:s,point,destroyed:false},context);fx.update(0,context,weapon,camera)
  const splash=fx.impacts.bloodRecords.find(r=>r.age<r.life);assert.equal(splash.anchor,v);assert.equal(splash.joint,1);const before=splash.position.clone();v.root.position.x+=2;v.motion.sync();fx.update(.05,context,weapon,camera);assert.ok(splash.position.x>before.x+1.9)
  fx.clear();s.dead=true;fx.shot(weapon,{hit:s,point,destroyed:true},context);fx.update(0,context,weapon,camera)
  const active=fx.impacts.bloodRecords.filter(r=>r.age<r.life);assert.equal(active.length,1);assert.equal(active[0].deathSlot,true);assert.equal(active[0].anchor,null)
  const head=new Vector3().fromArray(SCOUT_ASSET.head).applyMatrix4(v.motion.matrices[0]).applyMatrix4(v.levels[0].matrixWorld),width=SCOUT_ASSET.headWidth*v.levels[0].getWorldScale(new Vector3()).x;assert.ok(active[0].position.distanceTo(head)<1e-7);assert.ok(active[0].size>=width*.95&&active[0].size<=width,'The full splash is almost the measured head width, rather than a whole-body effect')
  const count=fx.impacts.stats.bloodSpawned;for(let i=0;i<10;i++)fx.scoutVisual(s);assert.equal(fx.impacts.stats.bloodSpawned,count,'Observing a dead Scout cannot roll or spawn the splash again')
 }finally{runtime.dispose();sheet.dispose();v.motion.dispose();other.motion.dispose()}
})
