import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {GuardBattloidTransform} from './GuardBattloidTransform.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=JSON.parse(fs.readFileSync('public/transformations/cyclone-guard-battloid.json'))
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('public/models/mospeada/scott-bernard-animated-original.glb')])
async function fixture(){
  const [bike,source]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(source.scene),bones=new Map(),wrapper=new T.Group()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});wrapper.add(model);wrapper.scale.setScalar(1.2607598654);wrapper.updateMatrixWorld(true)
  const effect=new GuardBattloidTransform(rig,{model,bones},data)
  return{rig,model,bones,wrapper,effect,apply(p){effect.restore();effect.apply(p)}}
}

test('guards reach the authored left pose and its reflected right pose, independent of world location and mesh order',async()=>{
  const f=await fixture(),mirror=new T.Matrix4().fromArray(data.mirrorInModel)
  assert.equal(f.effect.parts.length,30)
  // Check real imported vertices, not only two transforms built from the
  // same assumed frame: the wheel parent's pivot must cancel exactly once.
  for(const p of f.effect.parts)for(const check of p.record.checkpoints){
    const point=new T.Vector3(...check.source),positions=p.mesh.geometry.attributes.position
    let distance=Infinity
    for(let i=0;i<positions.count;i++)distance=Math.min(distance,point.distanceTo(new T.Vector3().fromBufferAttribute(positions,i)))
    assert.ok(distance<1e-6,`Checkpoint must belong to actual GLB geometry: ${p.record.id}/${check.id}: ${distance}`)
  }
  for(const [x,y,z,yaw]of[[0,0,0,0],[32,4,-80,1.7]]){
    f.effect.restore();f.rig.root.position.set(x,y,z);f.rig.root.rotation.y=yaw;f.rig.root.updateMatrixWorld(true)
    f.wrapper.position.set(x,y+1,z);f.wrapper.rotation.y=yaw;f.wrapper.updateMatrixWorld(true);f.rig.surfaces.reverse();f.apply(1)
    for(const p of f.effect.parts)for(const v of p.record.checkpoints){
      const actual=new T.Vector3(...v.source).applyMatrix4(p.mesh.matrixWorld)
      const expected=new T.Vector3(...v.target).applyMatrix4(f.model.matrixWorld)
      assert.ok(actual.distanceTo(expected)<1e-6,`${p.record.id}: ${actual.distanceTo(expected)}`)
      assert.ok(p.mesh.matrixWorld.determinant()>0,'Mirror is baked into the target, not negative runtime scale')
    }
    const [left,right]=f.effect.groups
    for(const p of left.parts){
      const r=right.parts.find(r=>r.record.id===p.record.id)
      const expected=new T.Vector3(...p.record.checkpoints[0].target).applyMatrix4(mirror)
      assert.ok(expected.distanceTo(new T.Vector3(...r.record.checkpoints[0].target))<1e-8)
    }
  }
})

test('whole guards stay rigid during travel and follow the existing forearms when Scott lowers his arms',async()=>{
  const f=await fixture(),rest=f.effect.parts.map(p=>({mesh:p.mesh,geometry:p.mesh.geometry,material:p.mesh.material,parent:p.mesh.parent}))
  for(const progress of[0,.22,.23,.3,.4,.48,1]){
    f.apply(progress)
    if(progress<=.22)assert.equal(f.effect.applied,false)
    else for(const g of f.effect.groups){
      const world=g.parts[0].mesh.matrixWorld.elements
      for(const p of g.parts)assert.ok(p.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-world[i])<1e-8),'Every component uses one frame')
    }
    for(const r of rest){assert.equal(r.mesh.geometry,r.geometry);assert.equal(r.mesh.material,r.material);assert.equal(r.mesh.parent,r.parent)}
  }
  const group=f.effect.groups[0],before=group.parts[0].mesh.matrixWorld.clone()
  group.bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.7));f.wrapper.updateMatrixWorld(true);f.apply(1)
  assert.ok(group.parts[0].mesh.matrixWorld.elements.some((v,i)=>Math.abs(v-before.elements[i])>.1))
  const expected=group.bone.matrixWorld.clone().multiply(group.targetInBone).multiply(group.inversePivot)
  assert.ok(group.parts[0].mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-8))
})

test('reversal restores all original guard mechanics and leaves wheels, forks, hydraulic links and Scott untouched',async()=>{
  const f=await fixture(),keys=new Set(f.effect.parts.map(p=>p.mesh)),all=f.rig.surfaces.map(mesh=>({mesh,matrix:mesh.matrix.toArray(),auto:mesh.matrixAutoUpdate,visible:mesh.visible,parent:mesh.parent,geometry:mesh.geometry}))
  const bones=[...f.bones.values()].map(b=>({b,q:b.quaternion.toArray(),p:b.position.toArray(),s:b.scale.toArray()}))
  for(let repeat=0;repeat<3;repeat++)for(const p of[0,.22,.3,.48,1,.6,.3,0]){
    f.apply(p)
    for(const r of all.filter(r=>!keys.has(r.mesh)))assert.deepEqual(r.mesh.matrix.toArray(),r.matrix)
  }
  for(const r of all){assert.deepEqual(r.mesh.matrix.toArray(),r.matrix);assert.equal(r.mesh.matrixAutoUpdate,r.auto);assert.equal(r.mesh.parent,r.parent);assert.equal(r.mesh.visible,r.visible);assert.equal(r.mesh.geometry,r.geometry)}
  for(const r of bones){assert.deepEqual(r.b.quaternion.toArray(),r.q);assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.scale.toArray(),r.s)}
  for(const source of data.sourceFiles)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.path)).digest('hex'),source.sha256)
})
