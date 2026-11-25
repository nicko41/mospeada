import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {undersuitFixture} from '../../scripts/scott-v3-undersuit-fixture.mjs'
import {ScottV3ShoulderUndersuit} from './ScottV3ShoulderUndersuit.js'
import {scottV3Config} from './scottV3Config.js'

function volume(mesh){
 const a=new Vector3(),b=new Vector3(),c=new Vector3(),cross=new Vector3(),g=mesh.geometry;let sum=0
 for(let i=0;i<g.index.count;i+=3){mesh.getVertexPosition(g.index.getX(i),a);mesh.getVertexPosition(g.index.getX(i+1),b);mesh.getVertexPosition(g.index.getX(i+2),c);sum+=a.dot(cross.crossVectors(b,c))/6}
 return Math.abs(sum)
}

test('shoulder undersuit is independently removable and leaves native rig, materials and buffers untouched',async()=>{
 const f=await undersuitFixture(),native=f.visual.skins[0].mesh
 const geometry=native.geometry,arrays=Object.fromEntries(Object.entries(geometry.attributes).map(([k,a])=>[k,a.array.slice()])),material=native.material
 const bones=native.skeleton.bones.map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]),inverses=native.skeleton.boneInverses.map(m=>m.toArray())
 const extra=new ScottV3ShoulderUndersuit(native,scottV3Config.undersuit)
 try{
  assert.equal(extra.meshes.length,2);assert.equal(native.geometry,geometry);assert.equal(native.material,material)
  assert.equal(extra.material.map,material.map);assert.equal(extra.material.roughnessMap,material.roughnessMap);assert.equal(extra.material.metalnessMap,material.metalnessMap)
  for(const mesh of extra.meshes){
   assert.equal(mesh.skeleton,native.skeleton);assert.deepEqual(mesh.bindMatrix.toArray(),native.bindMatrix.toArray());assert.notEqual(mesh.geometry,geometry)
   assert.equal(mesh.geometry.index.count/3,384)
  }
  for(const [k,a]of Object.entries(arrays))assert.deepEqual(geometry.attributes[k].array,a)
  assert.deepEqual(native.skeleton.bones.map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]),bones)
  assert.deepEqual(native.skeleton.boneInverses.map(m=>m.toArray()),inverses)
  extra.setEnabled(false);assert.ok(extra.meshes.every(m=>!m.visible));assert.equal(native.visible,true)
  extra.setEnabled(true);assert.ok(extra.meshes.every(m=>m.visible))
 }finally{extra.dispose();assert.ok(extra.meshes.every(m=>m.parent===null));f.dispose()}
})

test('each sleeve has gradual normalized weights only on its native shoulder and upper arm',async()=>{
 const f=await undersuitFixture()
 try{for(const mesh of f.visual.undersuit.meshes){
  const {shoulder,arm,rings,segments}=mesh.userData.scottV3Undersuit,g=mesh.geometry,j=g.attributes.skinIndex,w=g.attributes.skinWeight
  let previous=-1
  for(let row=0;row<=rings;row++){
   const id=row*(segments+1),a=w.getY(id);assert.ok(a>=previous);previous=a
   for(let col=0;col<=segments;col++){
    const i=id+col;assert.equal(j.getX(i),shoulder);assert.equal(j.getY(i),arm)
    assert.ok(Math.abs(w.getX(i)+w.getY(i)-1)<1e-7);assert.equal(w.getZ(i)+w.getW(i),0)
   }
  }
  assert.equal(w.getY(0),0);assert.equal(w.getY(rings*(segments+1)),1)
 }}finally{f.dispose()}
})

test('added fabric retains volume through actual mounted maximum extension and two-hand aiming without changing approved poses',async()=>{
 const f=await undersuitFixture(),mesh=f.visual.skins[0].mesh,g=mesh.geometry,weights=g.attributes.skinWeight.array.slice(),positions=g.attributes.position.array.slice()
 const baseline=f.visual.undersuit.meshes.map(volume)
 try{
  for(const [point,twoHands]of [[[0,4,15],false],[[-15,2,0],false],[[-2,3,-15],false],[[0,3,15],true],[null,false]]){
   f.pose(point,twoHands)
   const pose=f.visual.retarget.records.map(r=>r.b.matrixWorld.toArray())
   f.visual.undersuit.update()
   f.visual.undersuit.setEnabled(false);f.wrapper.updateWorldMatrix(true,true)
   assert.deepEqual(f.visual.retarget.records.map(r=>r.b.matrixWorld.toArray()),pose)
   f.visual.undersuit.setEnabled(true)
   for(const [i,cloth]of f.visual.undersuit.meshes.entries()){
    const v=volume(cloth);assert.ok(v>baseline[i]*.35&&v<baseline[i]*3,'Fabric volume collapses or bulges: '+JSON.stringify({point,twoHands,i,ratio:v/baseline[i]}))
    const p=new Vector3();for(let n=0;n<cloth.geometry.attributes.position.count;n++){cloth.getVertexPosition(n,p);assert.ok(p.toArray().every(Number.isFinite))}
   }
  }
  assert.ok(f.visual.undersuit.meshes.every(m=>m.morphTargetInfluences[0]===0),'Fabric must tuck away on returning to the normal ride')
  assert.deepEqual(g.attributes.position.array,positions);assert.deepEqual(g.attributes.skinWeight.array,weights)
 }finally{f.dispose()}
})
