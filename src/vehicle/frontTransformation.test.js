import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createDrivingCyclone } from './createDrivingCyclone.js'
import { FrontBattloidTransform } from './FrontBattloidTransform.js'
import { frontTransformState as store } from './frontTransformState.js'
import { fitPieceTransform } from './frontTransformMath.js'
import { parseCycloneScottActions } from './cycloneScottActions.js'
import openingPatches from './headlightOpeningsData.js'
import { frontGeometryKey, sampleFrontSequence } from './frontTransformMath.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=JSON.parse(fs.readFileSync('public/transformations/cyclone-front-battloid.json'))
async function load(p){const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const bike=load('public/models/mospeada/cyclone-vr052f.glb'),scott=load('public/models/mospeada/scott-bernard-animated-original.glb')
async function fixture(){
  const rig=createDrivingCyclone((await bike).scene),model=clone((await scott).scene),bones=new Map(),wrapper=new T.Group()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)})
  wrapper.add(model);wrapper.scale.setScalar(1.2607598654177716);wrapper.position.set(.8,.2,-.3);wrapper.updateMatrixWorld(true)
  return{rig,wrapper,model,bones,effect:new FrontBattloidTransform(rig,{bones,model},data)}
}

test('front endpoints match authored vertex IDs in the common Scott frame, independent of mesh order and world placement',async()=>{
  const f=await fixture(),boneState=[...f.bones.values()].map(b=>b.matrix.toArray()),other=f.rig.surfaces.filter(m=>m.userData.assembly!==data.assembly).map(m=>({mesh:m,matrix:m.matrix.toArray(),geometry:m.geometry})),geometry=f.rig.surfaces.map(m=>m.geometry)
  f.rig.surfaces.reverse() // Deliberately scramble the mesh enumeration.
  f.effect=new FrontBattloidTransform(f.rig,{bones:f.bones,model:f.model},data)
  const pieces=new Map(data.pieces.map(p=>[p.id,p]))
  const frame=new T.Matrix4().makeTranslation(...data.referenceFrame.position).scale(new T.Vector3().setScalar(data.referenceFrame.scale))
  const reference=frame.clone().multiply(new T.Matrix4().fromArray(data.referenceTransform))
  const editorToRaw=reference.invert().multiply(frame)
  const bindPosition=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(data.referenceBind))
  const baked=new T.Matrix4().fromArray(data.importMatrix).multiply(new T.Matrix4().fromArray(data.originalAssemblyMatrix))
  for(const [x,y,z,yaw]of[[0,0,0,0],[57,3,-81,1.9]]){
    f.effect.restore();f.rig.root.position.set(x,y,z);f.rig.root.rotation.y=yaw;f.rig.root.updateMatrixWorld(true)
    f.wrapper.position.set(x+.8,y+.2,z-.3);f.wrapper.rotation.y=yaw;f.wrapper.updateMatrixWorld(true)
    f.effect.apply(1)
    for(const p of f.effect.parts){
      assert.equal(p.mesh.visible,p.visible&&p.record.visible)
      if(!p.target)continue
      for(const id of p.record.pieceIds)for(const v of pieces.get(id).checkpoints){
        const actual=new T.Vector3(...v.source).applyMatrix4(baked).applyMatrix4(p.mesh.matrixWorld)
        const offset=new T.Vector3().setFromMatrixPosition(f.effect.anchor.matrixWorld).sub(bindPosition.clone().applyMatrix4(f.model.matrixWorld))
        const expected=new T.Vector3(...v.target).applyMatrix4(editorToRaw).applyMatrix4(f.model.matrixWorld).add(offset)
        assert.ok(actual.distanceTo(expected)<1e-6,`${id}/${v.id}: ${actual.distanceTo(expected)}`)
      }
    }
    f.effect.restore()
  }
  assert.deepEqual([...f.bones.values()].map(b=>b.matrix.toArray()),boneState)
  for(const p of other){assert.deepEqual(p.mesh.matrix.toArray(),p.matrix);assert.equal(p.mesh.geometry,p.geometry)}
  assert.ok(f.rig.surfaces.every(m=>geometry.includes(m.geometry)))
  assert.equal(f.effect.parts.length,111)
})

test('the riding spine cannot pitch the authored armor down; model/world orientation still follows Scott',async()=>{
  const f=await fixture(),actions=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
  const mixer=new T.AnimationMixer(f.model),clip=parseCycloneScottActions(actions).find(c=>c.name==='Cyclone_RidingPose')
  mixer.clipAction(clip).play();mixer.update(0)
  const pieces=new Map(data.pieces.map(p=>[p.id,p])),reference=new T.Matrix4().fromArray(data.referenceTransform).invert()
  const bindPosition=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(data.referenceBind))
  const baked=new T.Matrix4().fromArray(data.importMatrix).multiply(new T.Matrix4().fromArray(data.originalAssemblyMatrix))
  for(const yaw of[0,1.7]){
    f.effect.restore();f.wrapper.rotation.set(-.18,yaw,.12);f.wrapper.position.set(23,2,-41);f.wrapper.updateMatrixWorld(true)
    f.effect.apply(1)
    const offset=new T.Vector3().setFromMatrixPosition(f.effect.anchor.matrixWorld).sub(bindPosition.clone().applyMatrix4(f.model.matrixWorld))
    for(const part of f.effect.parts){
      if(!part.target)continue
      for(const id of part.record.pieceIds){
        const points=pieces.get(id).checkpoints
        for(const v of points){
          const actual=new T.Vector3(...v.source).applyMatrix4(baked).applyMatrix4(part.mesh.matrixWorld)
          const expected=new T.Vector3(...v.target).applyMatrix4(reference).applyMatrix4(f.model.matrixWorld).add(offset)
          assert.ok(actual.distanceTo(expected)<1e-6,`${id}: extra animated-spine rotation`)
        }
      }
    }
  }
  f.effect.restore();mixer.stopAllAction()
})

test('interpolation is reversible without drift and preserves original matrices, parents, visibility and geometry',async()=>{
  const f=await fixture(),before=f.effect.parts.map(p=>({mesh:p.mesh,parent:p.mesh.parent,matrix:p.mesh.matrix.toArray(),auto:p.mesh.matrixAutoUpdate,visible:p.mesh.visible,geometry:p.mesh.geometry,positions:p.mesh.geometry.attributes.position.array.slice()}))
  for(let loop=0;loop<4;loop++){
    for(const progress of[.1,.5,.9,1,.7,.3,0]){f.effect.restore();f.effect.apply(progress);for(const p of f.effect.parts)assert.ok(p.mesh.matrix.elements.every(Number.isFinite))}
  }
  for(const p of before){assert.equal(p.mesh.parent,p.parent);assert.deepEqual(p.mesh.matrix.toArray(),p.matrix);assert.equal(p.mesh.matrixAutoUpdate,p.auto);assert.equal(p.mesh.visible,p.visible);assert.equal(p.mesh.geometry,p.geometry);assert.deepEqual(p.mesh.geometry.attributes.position.array,p.positions)}
})

test('opening choreography turns complete light modules in place before separating only the named cover groups',async()=>{
  const f=await fixture(),start=new Map(f.effect.parts.map(p=>[p.record.key,p.mesh.matrix.clone()]))
  f.effect.apply(0,{turn:1,separate:0})
  for(const group of f.effect.motionGroups.filter(g=>g.role==='hinge')){
    const from=new T.Vector3().setFromMatrixPosition(group.sourceBody),current=new T.Vector3().setFromMatrixPosition(group.current)
    assert.ok(from.distanceTo(current)<1e-9,'Headlight pivot must not translate during its early turn')
    assert.ok(new T.Quaternion().setFromRotationMatrix(group.current).angleTo(new T.Quaternion().setFromRotationMatrix(group.sourceBody))>.2)
  }
  for(const p of f.effect.parts.filter(p=>p.target&&!p.motionGroup))assert.ok(p.mesh.matrix.elements.every((v,i)=>Math.abs(v-start.get(p.record.key).elements[i])<1e-9))
  f.effect.restore();f.effect.apply(0,{turn:1,separate:1})
  const separating=f.effect.parts.filter(p=>p.record.sequenceRole==='separation')
  assert.ok(separating.length>20)
  for(const p of separating){
    const from=new T.Vector3().setFromMatrixPosition(start.get(p.record.key)),actual=new T.Vector3().setFromMatrixPosition(p.mesh.matrix)
    assert.ok(actual.distanceTo(from)>.01)
  }
  for(const p of f.effect.parts.filter(p=>p.target&&!p.motionGroup&&p.record.sequenceRole!=='separation'))assert.ok(p.mesh.matrix.elements.every((v,i)=>Math.abs(v-start.get(p.record.key).elements[i])<1e-9))
  f.effect.restore();f.effect.apply(1);const final=f.effect.parts.map(p=>p.mesh.matrix.clone())
  f.effect.restore();f.effect.apply(1,{turn:1,separate:1})
  for(let i=0;i<final.length;i++)assert.deepEqual(f.effect.parts[i].mesh.matrix.elements,final[i].elements)
  f.effect.restore();f.effect.apply(0,{turn:0,separate:0})
  for(const p of f.effect.parts)assert.deepEqual(p.mesh.matrix.elements,start.get(p.record.key).elements)
})

test('headlights stay pinned to CHEST through rotation, lateral separation, travel and reversal',async()=>{
  const f=await fixture(),baked=new T.Matrix4().fromArray(data.importMatrix).multiply(new T.Matrix4().fromArray(data.originalAssemblyMatrix))
  const hinges=f.effect.motionGroups.filter(g=>g.role==='hinge')
  assert.equal(hinges.length,2)
  for(const [progress,turn,separate]of[[0,0,0],[0,.5,0],[0,1,.5],[0,1,1],[.2,1,1],[.6,1,1],[.999999,1,1],[1,1,1],[.6,1,1],[0,0,0]]){
    f.effect.restore();f.effect.apply(progress,{turn,separate})
    if(!turn&&!progress)continue
    const smooth=sampleFrontSequence(progress).chest
    for(const group of hinges){
      const exported=data.motionGroups.find(g=>g.id===group.id),pin=new T.Vector3(...exported.hinge.source)
      const housing=group.parts.find(p=>p.record.pieceIds.some(id=>data.pieces.find(p=>p.id===id)?.name==='Headlight_Housing'))
      const rendered=pin.clone().applyMatrix4(baked).applyMatrix4(housing.mesh.matrixWorld)
      const expected=new T.Vector3().setFromMatrixPosition(group.current).applyMatrix4(f.rig.body.matrixWorld)
      assert.ok(rendered.distanceTo(expected)<1e-7,'Headlight hinge detached from its carrier')
      const local=expected.clone().applyMatrix4(f.rig.body.matrixWorld.clone().invert()).applyMatrix4(group.parent.current.clone().invert())
      const socket=new T.Vector3().setFromMatrixPosition(group.localFrom).lerp(new T.Vector3().setFromMatrixPosition(group.localTo),smooth)
      assert.ok(local.distanceTo(socket)<1e-8,'Hinge no longer lives in CHEST coordinates')
      assert.ok(socket.distanceTo(new T.Vector3().setFromMatrixPosition(group.localFrom))<=exported.hinge.axialSlide+1e-8,'Only the authored slide inside the socket is allowed')
    }
    if(progress===0&&separate>0)for(const carrier of f.effect.motionGroups.filter(g=>g.role==='carrier')){
      const displacement=new T.Vector3().setFromMatrixPosition(carrier.current).sub(new T.Vector3().setFromMatrixPosition(carrier.sourceBody))
      assert.ok(Math.abs(displacement.y)<1e-9&&Math.abs(displacement.z)<1e-9,'Separate sideways before traveling up/back')
      assert.ok(Math.abs(displacement.x)>.01)
    }
  }
  f.effect.restore()
})

test('side covers rotate at their original CHEST attachment with no translation until the placement stage',async()=>{
  const f=await fixture(),covers=f.effect.motionGroups.filter(g=>g.role==='cover')
  const baked=new T.Matrix4().fromArray(data.importMatrix).multiply(new T.Matrix4().fromArray(data.originalAssemblyMatrix))
  assert.equal(covers.length,2)
  for(const progress of[.22,.25,.29,.33,.36]){
    f.effect.restore();f.effect.apply(progress,{turn:1,separate:1})
    for(const group of covers){
      const authored=data.motionGroups.find(g=>g.id===group.id),part=group.parts.find(p=>p.record.pieceIds.includes(authored.hinge.sourcePieceId))
      const rendered=new T.Vector3(...authored.hinge.source).applyMatrix4(baked).applyMatrix4(part.mesh.matrixWorld)
      const fixed=new T.Vector3().setFromMatrixPosition(group.localFrom).applyMatrix4(group.parent.current).applyMatrix4(f.rig.body.matrixWorld)
      assert.ok(rendered.distanceTo(fixed)<1e-8,'The cover hinge moved during its turn')
      const attached=new T.Vector3().setFromMatrixPosition(group.current).applyMatrix4(group.parent.current.clone().invert())
      assert.ok(attached.distanceTo(new T.Vector3().setFromMatrixPosition(group.localFrom))<1e-8)
      assert.equal(group.localBlend,0)
    }
  }
  f.effect.restore();f.effect.apply(0,{turn:1,covers:1,separate:1,fold:0})
  for(const group of covers){
    const local=group.parent.current.clone().invert().multiply(group.current)
    assert.ok(new T.Vector3().setFromMatrixPosition(local).distanceTo(new T.Vector3().setFromMatrixPosition(group.localFrom))<1e-8,'Opening CHEST cannot pull the cover away from its hinge')
  }
  f.effect.restore();f.effect.apply(.5,{turn:1,covers:1,separate:1,fold:1})
  for(const group of covers)assert.ok(group.localBlend>0,'Placement should start only after rotation')
  f.effect.restore()
})

test('tank makes a shallow dip, slides rearward without turning, then rotates about its center only after clearing the pelvis',async()=>{
  const f=await fixture(),group=f.effect.motionGroups.find(g=>g.role==='tank'),metadata=data.motionGroups.find(g=>g.role==='tank')
  const compressed=t=>t<=.22?t:.22+(t-.22)*.42/.78
  const tip=new T.Vector3(...metadata.tip).applyMatrix4(group.source.clone().invert())
  let basePin,baseTip
  for(const progress of[.22,.25,.28,.32]){
    f.effect.restore();f.effect.apply(compressed(progress),{turn:1,separate:1})
    const pin=new T.Vector3().setFromMatrixPosition(group.current),actual=tip.clone().applyMatrix4(group.current)
    if(progress===.22){basePin=pin.clone();baseTip=actual.clone()}
    assert.ok(pin.distanceTo(basePin)<1e-9,'The rear hinge must stay fixed during the dip')
    assert.ok(Math.abs(actual.distanceTo(pin)-baseTip.distanceTo(basePin))<1e-8,'Tank geometry must stay rigid')
    if(progress===.32){
      const drop=baseTip.y-actual.y
      assert.ok(drop>.1&&drop<group.length*.65,'The initial dip must be shallow, never a flip under Scott')
      assert.ok(Math.abs(actual.x-baseTip.x)<1e-8,'The two halves must stay in the same central corridor between the legs')
      const sourceQ=new T.Quaternion(),currentQ=new T.Quaternion()
      group.sourceBody.decompose(new T.Vector3(),sourceQ,new T.Vector3());group.current.decompose(new T.Vector3(),currentQ,new T.Vector3())
      assert.ok(currentQ.angleTo(sourceQ)<21*Math.PI/180,'The dip must never approach a half-turn')
    }
  }
  const pitch=new T.Quaternion();group.current.decompose(new T.Vector3(),pitch,new T.Vector3())
  const rear=new T.Vector3(1,0,0).transformDirection(group.sourceBody)
  let previous=-Infinity,slideCenter
  for(const progress of[.32,.40,.48,.56,.64]){
    f.effect.restore();f.effect.apply(compressed(progress),{turn:1,covers:1,separate:1,fold:1})
    const q=new T.Quaternion();group.current.decompose(new T.Vector3(),q,new T.Vector3())
    assert.ok(q.angleTo(pitch)<1e-7,'Orientation must stay fixed for the entire backward slide')
    const center=group.center.clone().applyMatrix4(group.current),projection=center.dot(rear)
    if(!slideCenter)slideCenter=center.clone()
    assert.ok(Math.abs(center.y-slideCenter.y)<1e-8&&Math.abs(center.x-slideCenter.x)<1e-8,'Slide is straight, with no loop below the pelvis')
    assert.ok(projection>=previous-1e-9);previous=projection
  }
  const clearedTip=group.tip.clone().applyMatrix4(group.current)
  const hip=f.effect.hips.getWorldPosition(new T.Vector3()).applyMatrix4(f.effect.bodyInverse)
  assert.ok(clearedTip.clone().sub(hip).dot(rear)>=group.tankStage.clearance-1e-8,'The whole front tip must pass the pelvis before the final rotation')
  const rotationCenter=group.center.clone().applyMatrix4(group.current)
  for(const progress of[.68,.75,.8,.86]){
    f.effect.restore();f.effect.apply(compressed(progress),{turn:1,covers:1,separate:1,fold:1})
    assert.ok(group.center.clone().applyMatrix4(group.current).distanceTo(rotationCenter)<1e-8,'Final rotation must be in place behind Scott, not an orbit')
    assert.equal(group.tankStage.slide,1);assert.ok(group.tankStage.fit<1e-8)
  }
  const before=f.effect.parts.filter(p=>p.motionGroup===group).map(p=>p.mesh.geometry)
  f.effect.restore();f.effect.apply(1,{turn:1,covers:1,separate:1,fold:1})
  assert.deepEqual(f.effect.parts.filter(p=>p.motionGroup===group).map(p=>p.mesh.geometry),before)
  f.effect.restore()
})

test('CHEST is fully placed in 0.44 seconds; covers and tank remain folded until it arrives',async()=>{
  const f=await fixture(),covers=f.effect.motionGroups.filter(g=>g.role==='cover'),carriers=f.effect.motionGroups.filter(g=>g.role==='carrier'),tank=f.effect.motionGroups.find(g=>g.role==='tank')
  f.effect.apply(0,{turn:1,separate:1,covers:1,fold:1})
  const tankRest=tank.current.clone()
  for(const progress of[.05,.1,.2,.219,.22]){
    f.effect.restore();f.effect.apply(progress,{turn:1,separate:1,covers:1,fold:1})
    assert.ok(tank.current.elements.every((v,i)=>Math.abs(v-tankRest.elements[i])<1e-8),'Tank cannot start before CHEST is placed, even if an old control requests it')
    for(const cover of covers){
      const local=cover.parent.current.clone().invert().multiply(cover.current)
      assert.ok(local.elements.every((v,i)=>Math.abs(v-cover.localFrom.elements[i])<1e-8),'Covers must remain folded during the CHEST move')
    }
  }
  for(const carrier of carriers){
    assert.equal(carrier.localBlend,1)
    assert.ok(carrier.current.elements.every((v,i)=>Math.abs(v-carrier.targetBody.elements[i])<1e-8),'Both CHEST groups must have reached their actual destinations')
    for(const p of carrier.parts){
      const expected=f.effect.anchorWorld.clone().multiply(p.target)
      assert.ok(p.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-7))
    }
  }
  f.effect.restore();f.effect.apply(.29,{turn:1,separate:1})
  assert.ok(covers.every(g=>g.localBlend===0));assert.ok(tank.tankStage.fold>0);assert.ok(tank.tankStage.slide>0,'Tank now starts its slide earlier, after CHEST has arrived')
  f.effect.restore();f.effect.apply(.36,{turn:1,separate:1})
  for(const cover of covers){
    const local=cover.parent.current.clone().invert().multiply(cover.current),q=new T.Quaternion(),expectedQ=new T.Quaternion()
    local.decompose(new T.Vector3(),q,new T.Vector3());cover.localTo.decompose(new T.Vector3(),expectedQ,new T.Vector3())
    assert.ok(q.angleTo(expectedQ)<1e-7);assert.equal(cover.localBlend,0)
  }
  f.effect.restore()
})

test('both deleted housing caps are absent from runtime triangles while source GLB attributes and other parts stay intact',async()=>{
  const source=(await bike).scene,original=new Map()
  source.traverse(n=>{if(n.isMesh)original.set(frontGeometryKey(n),n.geometry)})
  const rig=createDrivingCyclone(source)
  assert.deepEqual(rig.headlightOpenings.map(p=>p.removedTriangles),[14,14])
  for(const patch of openingPatches){
    const mesh=rig.surfaces.find(m=>frontGeometryKey(m)===patch.key),raw=original.get(patch.key)
    assert.equal(raw.index,null);assert.notEqual(mesh.geometry,raw)
    for(const [name,attribute]of Object.entries(raw.attributes))assert.deepEqual(mesh.geometry.attributes[name].array,attribute.array)
    const rendered=new Set(mesh.geometry.index.array)
    assert.equal(rendered.size,patch.vertexCount-42)
    for(const i of patch.removeTriangleStarts)for(const vertex of[i,i+1,i+2])assert.equal(rendered.has(vertex),false)
    assert.equal(mesh.geometry.index.count/3,334)
  }
})

test('two-second timeline pauses, steps, reverses midflight and lands exactly on both endpoints',()=>{
  store.reset();store.set({ready:true});store.duration(2);store.toggle()
  for(let i=0;i<60;i++)store.advance(1/60)
  assert.ok(Math.abs(store.snapshot().progress-.5)<1e-10)
  store.pause();const p=store.snapshot().progress;store.advance(5);assert.equal(store.snapshot().progress,p)
  store.step(-1/60);assert.ok(store.snapshot().progress<p)
  store.resume();store.toggle();assert.equal(store.snapshot().direction,-1)
  for(let i=0;i<60;i++)store.advance(1/60)
  assert.equal(store.snapshot().progress,0);assert.equal(store.snapshot().playing,false)
  store.resume();for(let i=0;i<120;i++)store.advance(1/60)
  assert.equal(store.snapshot().progress,1);assert.equal(store.snapshot().playing,false)
  store.toggle();for(let i=0;i<120;i++)store.advance(1/60)
  assert.equal(store.snapshot().progress,0);store.reset()
})

test('shipped source GLBs remain byte-identical and geometry edits are reported instead of forced into poses',()=>{
  // Authoring JSONs in 3D LAB are editable independently of the shipped build;
  // sourceFiles records their historical import hashes, not a permanent lock.
  for(const source of data.sourceFiles.filter(s=>s.path.endsWith('.glb'))){if(!fs.existsSync(source.path))continue;assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.path)).digest('hex'),source.sha256,source.path)}
  assert.equal(data.issues.filter(p=>p.kind==='reevaluated-cut-detail').length,2)
  assert.equal(data.pieces.filter(p=>p.absent).length,10)
  assert.equal(data.issues.some(p=>p.kind==='unmatched-runtime-mesh'),false)
  const from={vertices:[{id:'a',point:[0,0,0]},{id:'b',point:[1,0,0]},{id:'c',point:[0,1,0]},{id:'d',point:[1,1,0]}]}
  const to=structuredClone(from);to.vertices[3].point=[2,1,0]
  assert.throws(()=>fitPieceTransform(from,to),/TRS/)
})

test('both headlight modules use one pivot: frames cannot take the opposite rotation arc or shear during the transition',async t=>{
  const current=await fixture(),legacy=await fixture()
  const legacyData={...data,motionGroups:[],records:data.records.map(r=>({...r,motionGroupId:undefined}))}
  legacy.effect=new FrontBattloidTransform(legacy.rig,{model:legacy.model,bones:legacy.bones},legacyData)
  const names=new Map(data.pieces.map(p=>[p.id,p.name]))
  const part=(effect,gid,name)=>effect.parts.find(p=>p.record.pieceIds.some(id=>names.get(id)===name)&&data.pieces.find(x=>x.id===p.record.pieceIds[0])?.motionGroupId===gid)
  const angle=(a,b)=>new T.Quaternion().setFromRotationMatrix(a.mesh.matrixWorld.clone().invert().multiply(b.mesh.matrixWorld)).angleTo(new T.Quaternion())
  for(const group of data.motionGroups.filter(g=>g.role==='hinge')){
    const housing=part(current.effect,group.id,'Headlight_Housing'),frame=part(current.effect,group.id,'Headlight_Armor_Frame')
    const oldHousing=part(legacy.effect,group.id,'Headlight_Housing'),oldFrame=part(legacy.effect,group.id,'Headlight_Armor_Frame')
    current.effect.apply(1);const finalAngle=angle(housing,frame);current.effect.restore()
    let maxOld=0,maxNew=0
    for(let i=1;i<40;i++){
      const progress=i/40;current.effect.restore();legacy.effect.restore();current.effect.apply(progress);legacy.effect.apply(progress)
      maxOld=Math.max(maxOld,angle(oldHousing,oldFrame));maxNew=Math.max(maxNew,angle(housing,frame))
      assert.ok(angle(housing,frame)<=finalAngle+1e-6,'a child chose an independent 180-degree arc')
      for(const name of['Headlight_Front_Frame','Headlight_Front_Glass']){
        const rigid=part(current.effect,group.id,name)
        const relative=housing.mesh.matrixWorld.clone().invert().multiply(rigid.mesh.matrixWorld)
        assert.ok(relative.elements.every((n,k)=>Math.abs(n-new T.Matrix4().elements[k])<1e-8),'rigid module members separated')
      }
      for(const p of current.effect.parts.filter(p=>p.motionGroup?.id===group.id)){
        const x=new T.Vector3().setFromMatrixColumn(p.mesh.matrixWorld,0),y=new T.Vector3().setFromMatrixColumn(p.mesh.matrixWorld,1),z=new T.Vector3().setFromMatrixColumn(p.mesh.matrixWorld,2)
        assert.ok(Math.abs(x.dot(y))+Math.abs(x.dot(z))+Math.abs(y.dot(z))<1e-8,'group pivot introduced shear')
      }
    }
    assert.ok(maxOld>2.5,'regression example did not reproduce the independent-arc defect')
    assert.ok(maxNew<.4)
    t.diagnostic(`${group.id}: old relative turn ${(maxOld*180/Math.PI).toFixed(1)}°, grouped ${(maxNew*180/Math.PI).toFixed(1)}°`)
  }
  current.effect.restore();legacy.effect.restore()
})
