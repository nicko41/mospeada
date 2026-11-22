import test from 'node:test'
import assert from 'node:assert/strict'
import {BatchedMesh,BoxGeometry,Color,DataTexture,InstancedMesh,Matrix4,MeshBasicMaterial,PerspectiveCamera,Scene,Vector3} from 'three'
import {SurfaceImpactMarks,SURFACE_MARK_LIMIT} from './SurfaceImpactMarks.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {VFXRuntime} from './VFXRuntime.js'
import {explosionFrameRect,INVID_GROUND_ATLAS} from './explosionAtlas.js'

test('world contact refines a logical collider to the visible mesh and its normal; marks follow a moved instance',()=>{
 const scene=new Scene(),g=new BoxGeometry(2,2,2),mat=new MeshBasicMaterial(),box=new InstancedMesh(g,mat,2),marks=new SurfaceImpactMarks(),matrix=new Matrix4(),point=new Vector3()
 box.name='Forest_prop_rock';box.setMatrixAt(0,new Matrix4().makeTranslation(30,0,0));box.setMatrixAt(1,new Matrix4().makeTranslation(0,0,-5));scene.add(box,marks.mesh);scene.updateMatrixWorld(true)
 try{
  const contact=marks.resolve(new Vector3(0,0,0),{point:new Vector3(0,0,-3.7)},scene)
  assert.equal(contact.object,box);assert.equal(contact.instanceId,1);assert.ok(contact.point.distanceTo(new Vector3(0,0,-4))<1e-7);assert.ok(contact.normal.equals(new Vector3(0,0,1)))
  marks.spawn(contact);marks.update(0);marks.mesh.getMatrixAt(0,matrix);point.setFromMatrixPosition(matrix);assert.ok(point.distanceTo(new Vector3(0,0,-3.993))<1e-6)
  const transform=new Matrix4().makeRotationY(.5);transform.setPosition(2,0,-5);box.setMatrixAt(1,transform);marks.update(.1);marks.mesh.getMatrixAt(0,matrix)
  const expected=new Vector3(0,0,1.007).applyMatrix4(transform);assert.ok(point.setFromMatrixPosition(matrix).distanceTo(expected)<1e-6)
  const normal=new Vector3(0,0,1).transformDirection(matrix),expectedNormal=new Vector3(0,0,1).transformDirection(transform);assert.ok(normal.distanceTo(expectedNormal)<1e-6)
 }finally{marks.dispose();box.dispose();g.dispose();mat.dispose()}
})
test('surface patches align to slopes, remain bounded through sustained fire, pause and clear without new resources',()=>{
 const marks=new SurfaceImpactMarks(),normal=new Vector3(.3,1,.2).normalize(),position=new Vector3(4,2,7),matrix=new Matrix4(),buffer=marks.mesh.instanceMatrix,material=marks.material,texture=marks.map,pool=marks.records.slice()
 try{
  for(let i=0;i<150;i++)marks.spawn({point:position,normal,object:null,instanceId:null})
  marks.update(0);assert.equal(marks.mesh.count,SURFACE_MARK_LIMIT);marks.mesh.getMatrixAt(0,matrix);assert.ok(new Vector3(0,0,1).transformDirection(matrix).distanceTo(normal)<1e-6)
  assert.ok(new Vector3().setFromMatrixPosition(matrix).distanceTo(position.clone().addScaledVector(normal,.007))<1e-6)
  const values=buffer.array.slice();marks.update(0);assert.deepEqual(buffer.array,values)
  assert.equal(marks.mesh.instanceMatrix,buffer);assert.equal(marks.material,material);assert.equal(marks.map,texture);assert.deepEqual(marks.records,pool);assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false)
  marks.update(59);assert.ok(marks.mesh.count>0);marks.update(2);assert.equal(marks.mesh.count,0);marks.spawn({point:position,normal});marks.clear();assert.equal(marks.mesh.count,0);assert.ok(marks.records.every(r=>!r.anchor))
 }finally{marks.dispose()}
})
test('batched forest props resolve their individual transform and preserve the burn across distance culling',()=>{
 const marks=new SurfaceImpactMarks(),g=new BoxGeometry(2,2,2),material=new MeshBasicMaterial({alphaTest:.2}),batch=new BatchedMesh(2,24,36,material),scene=new Scene(),geometry=batch.addGeometry(g),id=batch.addInstance(geometry)
 batch.name='Forest_prop_batched_rock';batch.setMatrixAt(id,new Matrix4().makeTranslation(0,0,-5));batch.computeBoundingBox();scene.add(batch,marks.mesh);scene.updateMatrixWorld(true)
 try{
  const contact=marks.resolve(new Vector3(),{point:new Vector3(0,0,-3.8)},scene);assert.equal(contact.object,batch);assert.equal(contact.instanceId,id);assert.ok(contact.normal.equals(new Vector3(0,0,1)))
  marks.spawn(contact);marks.update(0);assert.equal(marks.mesh.count,1);batch.setVisibleAt(id,false);marks.update(.1);assert.equal(marks.mesh.count,0);batch.setVisibleAt(id,true);marks.update(.1);assert.equal(marks.mesh.count,1)
 }finally{marks.dispose();batch.dispose();g.dispose();material.dispose()}
})
test('Gallant surface hits animate the yellow supplied atlas without stars/rings and leave a visible mark after putting the gun away',()=>{
 const sheet=new DataTexture(new Uint8Array([255,255,255,255]),1,1),runtime=new VFXRuntime(),scene=new Scene(),fx=runtime.register('combat',new Plano3CombatVFX({explosionAtlases:{terrain:sheet}})),camera=new PerspectiveCamera(),encounter={active:true,time:1,bolts:[]},weapon={root:{visible:false},getMuzzle:p=>p.set(0,2,0)},point=new Vector3(0,0,-5),normal=new Vector3(0,1,0)
 scene.add(runtime.root)
 try{
  fx.shot(weapon,{hit:null,solid:true,point,normal},encounter);fx.update(0,encounter,weapon,camera)
  assert.equal(fx.impacts.surfaceSprites.material.map,sheet);assert.equal(fx.impacts.surfaceSprites.count,1);assert.equal(fx.contactFlashes.count,0);assert.equal(fx.impacts.fire.count,0);assert.equal(fx.impacts.rings.count,0);assert.equal(fx.systems[0].particleNum,0)
  const tint=new Color();fx.impacts.surfaceSprites.getColorAt(0,tint);assert.ok(tint.r>tint.b*3&&tint.g>tint.b*3)
  assert.deepEqual(Array.from(fx.impacts.surfaceSprites.geometry.attributes.aCombatFrame.array.slice(0,4)).map(v=>+v.toFixed(6)),explosionFrameRect(0,fx.impacts.records.find(r=>r.name==='gallantImpact').mirror,INVID_GROUND_ATLAS).map(v=>+v.toFixed(6)))
  fx.update(.12,encounter,weapon,camera);assert.ok(fx.impacts.records.find(r=>r.name==='gallantImpact').frame>=4)
  fx.update(.3,encounter,weapon,camera);assert.equal(fx.impacts.surfaceSprites.count,0);assert.equal(fx.surfaceMarks.mesh.count,1)
  encounter.active=false;fx.update(.1,encounter,weapon,camera);assert.equal(fx.root.visible,false);assert.equal(fx.surfaceMarks.mesh.count,1);assert.equal(fx.surfaceMarks.mesh.parent.visible,true)
  fx.clear();assert.equal(fx.surfaceMarks.mesh.count,0)
 }finally{runtime.dispose();sheet.dispose()}
})
