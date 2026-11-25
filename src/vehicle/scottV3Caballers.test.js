import test from 'node:test'
import assert from 'node:assert/strict'
import {Matrix3,Vector3} from 'three'
import {v3ArmorFixture} from '../../scripts/scott-v3-armor-fixture.mjs'
import {kneeSocketPoint} from './scottKneeSockets.js'
import {scottV3Config} from './scottV3Config.js'

const maxError=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])))

test('V3 caballers keep the original waist pivots and fit their length to native knee caps without changing width',async()=>{
 const f=await v3ArmorFixture(),v=f.visual,bindings=f.articulation.bindings
 const geometry=bindings.map(b=>b.mesh.geometry),positions=geometry.map(g=>g.attributes.position.array.slice()),indices=geometry.map(g=>g.index?.array.slice()||null)
 const weights=v.skins[0].mesh.geometry.attributes.skinWeight.array.slice()
 const fit=v.fitCaballer,references=new Map()
 v.fitCaballer=function(b,weight){
  b.mesh.updateWorldMatrix(true,false)
  references.set(b.side,{waist:b.top.clone().applyMatrix4(b.mesh.matrixWorld),matrix:b.mesh.matrixWorld.clone()})
  return fit.call(this,b,weight)
 }
 try{
  assert.deepEqual(new Set(bindings.map(b=>b.side)),new Set(['Left','Right']))
  const left=v.kneeSockets.Left,right=v.kneeSockets.Right
  assert.ok(left.bindPoint[0]>.18&&right.bindPoint[0]<-.18,'Sockets must be on the exposed outer caps')
  assert.ok(Math.abs(left.bindPoint[0]+right.bindPoint[0])<.003,'Measure both sides with mirrored probes')
  assert.ok(Math.abs(left.bindPoint[1]-right.bindPoint[1])<.003)
  for(const socket of [left,right]){assert.ok(socket.weights.every(w=>w>=-1e-8&&w<=1+1e-8));assert.ok(Math.abs(socket.weights.reduce((a,b)=>a+b,0)-1)<1e-10)}
  for(const patch of [{speed:0},{speed:3,mode:'ARMOR_GROUND'},{speed:10,mode:'ARMOR_HOVER'}]){
   Object.assign(f.controller.state,patch);f.tick()
   for(const b of bindings){
    const cap=kneeSocketPoint(v.skins[0].mesh,v.kneeSockets[b.side]),connector=b.bottom.clone().applyMatrix4(b.mesh.matrixWorld)
    assert.ok(connector.distanceTo(cap)<1e-6,b.side+' connector misses the native knee cap')
    const reference=references.get(b.side),upper=b.top.clone().applyMatrix4(b.mesh.matrixWorld)
    assert.ok(upper.distanceTo(reference.waist)<1e-6,'Knee fitting lifted the original waist pivot: '+b.side)
    const axis=b.bottom.clone().sub(b.top).normalize(),width=axis.clone().cross(new Vector3(1,0,0)).normalize(),thickness=axis.clone().cross(width).normalize(),before=new Matrix3().setFromMatrix4(reference.matrix),after=new Matrix3().setFromMatrix4(b.mesh.matrixWorld)
    for(const transverse of [width,thickness])assert.ok(Math.abs(transverse.clone().applyMatrix3(before).length()-transverse.clone().applyMatrix3(after).length())<1e-6,'Width or thickness changed: '+b.side)
    const originalLength=b.bottom.clone().applyMatrix4(reference.matrix).distanceTo(reference.waist),actualLength=connector.distanceTo(upper),diagnostic=v.diagnostics.caballers.find(d=>d.side===b.side)
    assert.ok(Math.abs(actualLength/originalLength-diagnostic.longitudinalScale)<1e-8)
    assert.ok(diagnostic.waistError<1e-6)
   }
  }
  bindings.forEach((b,i)=>{assert.equal(b.mesh.geometry,geometry[i]);assert.deepEqual(b.mesh.geometry.attributes.position.array,positions[i]);assert.deepEqual(b.mesh.geometry.index?.array||null,indices[i])})
  assert.deepEqual(v.skins[0].mesh.geometry.attributes.skinWeight.array,weights)
 }finally{v.fitCaballer=fit;v.dispose()}
})

test('V3 knee correction leaves every other assembly and the native pose unchanged, and releases to V2',async()=>{
 const f=await v3ArmorFixture(),v=f.visual,legMeshes=new Set(f.articulation.bindings.map(b=>b.mesh)),other=f.articulation.records.filter(r=>!legMeshes.has(r.mesh))
 const matrices=other.map(r=>r.mesh.matrixWorld.toArray()),bones=[...v.retarget.bones].map(([name,b])=>({name,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()})),corrected=f.articulation.bindings.map(b=>b.mesh.matrixWorld.toArray()),fit=v.fitCaballer
 try{
  // Evaluate the preceding V3 path on this same static pose as a baseline.
  v.fitCaballer=function(binding,weight){const config=scottV3Config.assembly['leg'+binding.side];this.moveEquipment(binding.mesh,config.bone,config.offset,weight)}
  f.tick()
  other.forEach((r,i)=>assert.ok(maxError(r.mesh.matrixWorld.toArray(),matrices[i])<1e-9,'Unrelated assembly moved: '+r.mesh.name))
  for(const r of bones){const b=v.retarget.bones.get(r.name);assert.deepEqual(b.position.toArray(),r.p);assert.deepEqual(b.quaternion.toArray(),r.q);assert.deepEqual(b.scale.toArray(),r.s)}
  assert.ok(f.articulation.bindings.every((b,i)=>maxError(b.mesh.matrixWorld.toArray(),corrected[i])>.02),'Only the two caballers should receive the new placement')
  v.fitCaballer=fit;f.tick();assert.ok(v.diagnostics.caballers.every(r=>r.error<1e-6))
  v.restoreAttachments();f.instance.modelComparison.variant='v2';f.tick()
  assert.ok(f.articulation.diagnostics.legs.every(r=>r.error<1e-6),'V2 must keep its original raised-disc attachments')
 }finally{v.fitCaballer=fit;v.dispose()}
})
