import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as T from 'three'
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js'
import{clone}from'three/addons/utils/SkeletonUtils.js'
import{createDrivingCyclone}from'./createDrivingCyclone.js'
import{FrontBattloidTransform}from'./FrontBattloidTransform.js'
import{RearBattloidTransform}from'./RearBattloidTransform.js'
import{frontGeometryKey}from'./frontTransformMath.js'
import {matchTranslatedReplacement} from '../../scripts/rear-piece-correspondence.mjs'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const frontData=JSON.parse(fs.readFileSync('public/transformations/cyclone-front-battloid.json')),data=JSON.parse(fs.readFileSync('public/transformations/cyclone-rear-battloid.json'))
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('public/models/mospeada/scott-bernard-animated-original.glb'),load('public/transformations/cyclone-rear-pieces.glb')])
async function fixture(){
  const [bike,scott,parts]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(scott.scene),bones=new Map(),wrapper=new T.Group()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});wrapper.add(model);wrapper.scale.setScalar(1.2607598654177716);wrapper.position.set(.8,.2,-.3);wrapper.updateMatrixWorld(true)
  const front=new FrontBattloidTransform(rig,{model,bones},frontData),rear=new RearBattloidTransform(rig,front,data,parts.scene)
  const apply=p=>{rear.restore();front.restore();front.apply(p,{turn:1,separate:1});rear.apply(p)}
  return{rig,front,rear,wrapper,model,bones,apply}
}

test('rear and both caballero-right wait for tank activation, follow its initial dip, and preserve wheels/guards/Scott',async()=>{
  const f=await fixture(),rest=f.rear.originals.map(p=>({mesh:p.mesh,matrix:p.mesh.matrix.toArray(),visible:p.mesh.visible,parent:p.mesh.parent,geometry:p.mesh.geometry}))
  const untouched=f.rig.surfaces.filter(m=>!data.sourceKeys.includes(frontGeometryKey(m))&&m.userData.assembly!==frontData.assembly).map(m=>({mesh:m,matrix:m.matrix.toArray(),parent:m.parent,geometry:m.geometry}))
  const boneState=[...f.bones.values()].map(b=>({p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  for(const p of[0,.1,.22]){f.apply(p);assert.equal(!!f.rear.rearActive,false);for(const r of rest.filter(r=>!f.rear.originals.find(o=>o.mesh===r.mesh).chest)){assert.deepEqual(r.mesh.matrix.toArray(),r.matrix);assert.equal(r.mesh.visible,r.visible)}}
  f.apply(.25);assert.equal(f.rear.root.visible,true)
  const tank=f.front.motionGroups.find(g=>g.role==='tank'),inv=f.rig.body.matrixWorld.clone().invert()
  for(const part of f.rear.parts.filter(p=>p.record.role==='rear'&&!p.record.retract)){
    const expected=inv.clone().multiply(part.source.mesh.parent.matrixWorld).multiply(part.source.matrix).premultiply(tank.sourceBody.clone().invert()).premultiply(tank.current)
    const actual=inv.clone().multiply(part.mesh.matrixWorld)
    assert.ok(actual.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-7),'Rear must share the tank motion before reconfiguration')
  }
  for(const p of untouched){assert.deepEqual(p.mesh.matrix.toArray(),p.matrix);assert.equal(p.mesh.parent,p.parent);assert.equal(p.mesh.geometry,p.geometry)}
  assert.deepEqual([...f.bones.values()].map(b=>({p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()})),boneState)
  f.rear.dispose()
})

test('rear final positions match the exported Armor vertices and leg visibility overrides by persistent ID at any world pose',async()=>{
  const f=await fixture(),B=new T.Matrix4().fromArray(data.importMatrix),toReference=f.front.referenceBind.clone().invert().multiply(new T.Matrix4().fromArray(data.referenceTransform).invert())
  for(const [x,y,z,yaw]of[[0,0,0,0],[58,4,-81,1.7]]){
    f.rear.restore();f.front.restore();f.rig.root.position.set(x,y,z);f.rig.root.rotation.y=yaw;f.rig.root.updateMatrixWorld(true)
    f.wrapper.position.set(x+.8,y+.2,z-.3);f.wrapper.rotation.y=yaw;f.wrapper.updateMatrixWorld(true);f.apply(1)
    for(const part of f.rear.parts){
      assert.equal(part.mesh.visible,part.record.visible)
      if(!part.record.visible)continue
      for(const point of part.record.checkpoints){
        const actual=new T.Vector3(...point.source).applyMatrix4(B).applyMatrix4(part.mesh.matrixWorld)
        const expected=new T.Vector3(...point.target).applyMatrix4(toReference).applyMatrix4(f.front.anchorWorld)
        assert.ok(actual.distanceTo(expected)<1e-6,`${part.record.ids}/${point.id}: ${actual.distanceTo(expected)}`)
      }
    }
    const legs=f.rear.parts.filter(p=>p.record.role==='leg');assert.equal(legs.length,2);assert.ok(legs.every(p=>p.mesh.visible));assert.deepEqual(new Set(legs.flatMap(p=>p.record.ids)),new Set(data.visibilityOverrides))
  }
  f.rear.dispose()
})

test('rear reversal restores exact original transforms, visibility, materials, parents and geometry without drift',async()=>{
  const f=await fixture(),original=f.rear.originals.map(p=>({mesh:p.mesh,matrix:p.mesh.matrix.toArray(),visible:p.mesh.visible,parent:p.mesh.parent,geometry:p.mesh.geometry,material:p.mesh.material,auto:p.mesh.matrixAutoUpdate}))
  for(let repeat=0;repeat<3;repeat++)for(const progress of[0,.22,.25,.35,.5,.75,1,.8,.4,.22,0]){f.apply(progress);for(const p of f.rear.parts)assert.ok(p.mesh.matrix.elements.every(Number.isFinite))}
  assert.equal(f.rear.root.visible,false)
  for(const p of original){assert.deepEqual(p.mesh.matrix.toArray(),p.matrix);assert.equal(p.mesh.parent,p.parent);assert.equal(p.mesh.geometry,p.geometry);assert.equal(p.mesh.material,p.material);assert.equal(p.mesh.visible,p.visible);assert.equal(p.mesh.matrixAutoUpdate,p.auto)}
  const overlays=f.rear.parts.filter(p=>!p.reuse);f.rear.dispose();assert.equal(f.rear.root.parent,null);assert.equal(overlays.length,14)
})

test('rear shells, exhausts, collars and outlets remain one rigid assembly throughout both directions',async()=>{
  const f=await fixture()
  f.apply(.25)
  const groups=f.rear.rearGroups.map(g=>({group:g,relative:g.members.map(p=>g.reference.mesh.matrixWorld.clone().invert().multiply(p.mesh.matrixWorld))}))
  assert.ok(groups.some(g=>g.group.members.filter(p=>/Silenciador|Collar|Salida posterior/.test(p.record.sourceKey)).length===6))
  const samples=Array.from({length:41},(_,i)=>.23+i*.77/40)
  for(const progress of[...samples,...samples.toReversed()]){
    f.apply(progress)
    for(const {group,relative}of groups)for(const [i,p]of group.members.entries()){
      const actual=group.reference.mesh.matrixWorld.clone().invert().multiply(p.mesh.matrixWorld)
      assert.ok(actual.elements.every((v,j)=>Math.abs(v-relative[i].elements[j])<1e-7),`${p.record.sourceKey} disassembled at ${progress}`)
    }
  }
  f.rear.dispose()
})

test('all six cut fragments retract at their shared seam without protruding past their original bounds in either direction',async()=>{
  const f=await fixture(),B=new T.Matrix4().fromArray(data.importMatrix),inverseB=B.clone().invert(),point=new T.Vector3()
  const cuts=f.rear.parts.filter(p=>p.record.retract),samples=Array.from({length:41},(_,i)=>.23+i*.4/40)
  assert.equal(cuts.length,6)
  const sourceArrays=cuts.map(p=>Array.from(p.mesh.geometry.attributes.position.array))
  for(const progress of[...samples,...samples.toReversed()]){
    f.apply(progress)
    for(const p of cuts){
      const inMate=inverseB.clone().multiply(p.mate.mesh.matrixWorld.clone().invert()).multiply(p.mesh.matrixWorld).multiply(B)
      const seam=new T.Vector3(p.cutSeam,.25,.1),mapped=seam.clone().applyMatrix4(inMate)
      assert.ok(seam.distanceTo(mapped)<1e-7,`Cut seam detached at ${progress}: ${p.record.ids}`)
      const positions=p.mesh.geometry.attributes.position
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(inverseB).applyMatrix4(inMate)
        assert.ok(point.x>=p.cutBounds.min.x-1e-6&&point.x<=p.cutSeam+1e-6,`Cut protruded beyond its seam: ${p.record.ids}`)
      }
      if(progress>=.58)assert.equal(p.mesh.visible,false)
    }
  }
  cuts.forEach((p,i)=>assert.deepEqual(Array.from(p.mesh.geometry.attributes.position.array),sourceArrays[i]))
  f.apply(0)
  for(const p of f.rear.originals)assert.equal(p.mesh.visible,p.visible)
  f.rear.dispose()
})

test('rear importer keeps the original GLB and authored JSON intact; hidden overrides only select the two leg panels',()=>{
  for(const source of data.sourceFiles)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.path)).digest('hex'),source.sha256)
  assert.equal(data.records.length,32);assert.equal(data.records.filter(r=>r.retract).length,6);assert.equal(data.visibilityOverrides.length,2)
  assert.equal(data.wheelCarriers.length,2)
  assert.ok(data.wheelCarriers.every(r=>!data.records.some(p=>p.ids.includes(r.id))),'Authored tubes are references only')
  assert.deepEqual(new Set(data.records.filter(r=>r.role==='detail').flatMap(r=>r.ids)),new Set(['fa2c5512-32c5-4114-a443-db5f917301f1','9a55d575-5e41-4fc6-9b82-2d824e727487','cef1a3e5-5732-4354-93dd-ab85425b4917','dc0ca4bc-bde4-4c76-a968-879a5457d598']))
})

test('both replacement Pieza 25 have unique geometry/topology provenance despite regenerated IDs and unordered vertices',()=>{
  const source=JSON.parse(fs.readFileSync(data.sourceFiles.find(f=>/material-studio.*rear_body/.test(f.path)).path)),target=JSON.parse(fs.readFileSync('assets/scott-cyclone/armor/rear_body · extremo lateral redondeado · armor.json'))
  const candidates=source.pieces.filter(p=>p.name==='Pieza 25'),replaced=target.pieces.filter(p=>p.name==='Pieza 25')
  assert.equal(replaced.length,2)
  for(const p of replaced){
    const shuffled={...p,vertices:[...p.vertices].reverse(),faces:[...p.faces].reverse(),edges:[...p.edges].reverse()}
    const result=matchTranslatedReplacement(shuffled,[...candidates].reverse())
    const record=data.records.find(r=>r.ids.includes(p.id))
    assert.equal(result.sourceId,record.sourceId);assert.equal(result.vertexPairs.length,8)
    assert.equal(new Set(result.vertexPairs.map(v=>v.target)).size,8)
    assert.equal(record.checkpoints.length,8);assert.equal(record.role,'detail')
    assert.ok(record.checkpoints.every(c=>c.id!==c.targetId),'Do not mistake regenerated IDs for missing geometry')
    const original=candidates.find(c=>c.id===result.sourceId)
    assert.throws(()=>matchTranslatedReplacement(shuffled,[original,{...original,id:'ambiguous-copy'}]),/ambigua/)
    const changed=structuredClone(shuffled);changed.vertices[0].point[1]+=.001
    assert.throws(()=>matchTranslatedReplacement(changed,candidates),/no identificada/)
  }
})

test('Pieza 25 joins Armor and follows its final departure instead of leaving original meshes behind',async()=>{
  const f=await fixture(),parts=f.rear.parts.filter(p=>p.record.replacement)
  assert.equal(parts.length,2);assert.ok(parts.every(p=>p.reuse&&p.mesh===p.source.mesh))
  f.apply(.22);const start=parts.map(p=>p.mesh.getWorldPosition(new T.Vector3()))
  f.apply(.65)
  assert.ok(parts.every((p,i)=>p.mesh.visible&&p.mesh.getWorldPosition(new T.Vector3()).distanceTo(start[i])>.1))
  f.apply(1);const before=parts.map(p=>p.mesh.getWorldPosition(new T.Vector3())),departure=new T.Vector3(6,2,-1)
  f.wrapper.position.add(departure);f.wrapper.updateMatrixWorld(true);f.apply(1)
  for(const [i,p]of parts.entries())assert.ok(p.mesh.getWorldPosition(new T.Vector3()).sub(before[i]).distanceTo(departure)<1e-6)
  f.apply(0)
  for(const p of parts){assert.equal(p.mesh.visible,p.source.visible);assert.deepEqual(p.mesh.matrix.toArray(),p.source.matrix.toArray())}
  f.rear.dispose()
})

test('both authored-hidden tank caps vanish with rear, stay hidden during Armor departure and restore on reversal',async()=>{
  const f=await fixture(),caps=f.rear.originals.filter(p=>p.hideInArmor)
  assert.equal(caps.length,2)
  assert.deepEqual(new Set(data.hiddenInArmor.map(p=>p.id)),new Set(['7ad2fa75-5076-400d-ba63-8d1bf0298ff0','2f1d3f85-f8d9-4112-8957-3ab5d1ae87c9']))
  for(const p of[0,.22,.3,.7,1]){f.apply(p);assert.ok(caps.every(c=>c.mesh.visible===(p<=.22&&c.visible)))}
  f.wrapper.position.add(new T.Vector3(5,2,6));f.wrapper.updateMatrixWorld(true);f.apply(1)
  assert.ok(caps.every(c=>!c.mesh.visible),'No tiny disks remain behind the airborne Armor')
  for(const p of[.8,.3,.22,0]){f.apply(p);assert.ok(caps.every(c=>c.mesh.visible===(p<=.22&&c.visible)))}
  for(const c of caps){assert.deepEqual(c.mesh.matrix.toArray(),c.matrix.toArray());assert.equal(c.mesh.matrixAutoUpdate,c.auto)}
  f.rear.dispose()
})

test('the two new chest parts arrive with CHEST before the rear starts; grille folds and keeps the authored reduced scale',async()=>{
  const f=await fixture(),pieces=f.rear.parts.filter(p=>p.record.role==='chest'),B=new T.Matrix4().fromArray(data.importMatrix)
  assert.equal(pieces.length,2);assert.deepEqual(new Set(pieces.flatMap(p=>p.record.ids)),new Set(Object.values(data.chest)))
  const grille=pieces.find(p=>p.record.chestPart==='grille'),plate=pieces.find(p=>p.record.chestPart==='plate')
  const q=new T.Quaternion(),s=new T.Vector3(),a=new T.Vector3(),startScale=grille.source.mesh.getWorldScale(new T.Vector3()).length()
  for(const progress of[.05,.11,.22,.48,1]){
    f.apply(progress);assert.ok(pieces.every(p=>p.mesh.visible))
    if(progress<=.22)assert.equal(f.rear.rearActive,false)
    if(progress>=.22){
      assert.ok(f.front.motionGroups.filter(g=>g.role==='carrier').every(g=>g.localBlend===1))
      for(const p of pieces){
        const expected=f.front.anchorWorld.clone().multiply(p.target)
        assert.ok(p.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-7))
        for(const point of p.record.checkpoints){
          const actual=new T.Vector3(...point.source).applyMatrix4(B).applyMatrix4(p.mesh.matrixWorld)
          const toRef=f.front.referenceBind.clone().invert().multiply(new T.Matrix4().fromArray(data.referenceTransform).invert())
          const target=new T.Vector3(...point.target).applyMatrix4(toRef).applyMatrix4(f.front.anchorWorld)
          assert.ok(actual.distanceTo(target)<1e-7)
        }
      }
      grille.mesh.matrixWorld.decompose(a,q,s);assert.ok(s.length()<startScale*.7,'Respect intentional grille shrinking')
      plate.mesh.matrixWorld.decompose(a,q,s);assert.ok(s.x>.5&&Math.abs(s.x-s.z)<1e-6,'Lower plate remains rigid')
    }
  }
  f.apply(0);assert.equal(f.rear.root.visible,false);assert.ok(pieces.every(p=>p.mesh.visible));f.rear.dispose()
})

test('rear uses the authored front/model axes before the tank turns, rather than inheriting its downward pitch',async()=>{
  const f=await fixture(),a=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),expected=new T.Quaternion()
  for(const progress of[.64,.75,.86,1]){
    f.apply(progress)
    for(const p of f.rear.parts.filter(p=>p.record.role==='rear'&&!p.record.retract)){
      p.mesh.matrixWorld.decompose(a,q,s)
      f.front.anchorWorld.clone().multiply(p.target).decompose(a,expected,s)
      assert.ok(q.angleTo(expected)<1e-7,`No added tank pitch for ${p.record.name} at ${progress}`)
    }
  }
  const position=new T.Vector3(),direction=new T.Vector3();assert.equal(f.rear.boostSocket(position,direction),true)
  assert.ok(position.toArray().every(Number.isFinite));assert.ok(direction.z<-.99)
  f.rear.dispose()
})

test('tank and rear finish by 64 percent while wheel bases retain their own original mechanical clock',async()=>{
  const f=await fixture()
  f.apply(.64)
  const tank=f.front.motionGroups.find(g=>g.role==='tank')
  assert.equal(tank.tankStage.fit,1)
  for(const p of f.rear.parts.filter(p=>!p.record.retract&&p.record.role!=='wheel-base')){
    const target=f.front.anchorWorld.clone().multiply(p.target)
    assert.ok(p.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-7),`${p.record.ids} must reach Armor earlier`)
  }
  for(const p of f.rear.parts.filter(p=>p.record.role==='wheel-base')){
    const target=f.front.anchorWorld.clone().multiply(p.target)
    assert.ok(p.mesh.matrixWorld.elements.some((v,i)=>Math.abs(v-target.elements[i])>1e-4),'Do not rush the wheel sockets independently of their wheels')
  }
  f.rear.dispose()
})
