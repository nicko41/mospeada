import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {FrontBattloidTransform} from './FrontBattloidTransform.js'
import {RearBattloidTransform} from './RearBattloidTransform.js'
import {GuardBattloidTransform} from './GuardBattloidTransform.js'
import {WheelBattloidTransform} from './WheelBattloidTransform.js'
import {SuspensionHideTransform} from './SuspensionHideTransform.js'
import {TransformationScottPose} from './TransformationScottPose.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const read=n=>JSON.parse(fs.readFileSync('public/transformations/cyclone-'+n+'.json'))
const fd=read('front-battloid'),rd=read('rear-battloid'),gd=read('guard-battloid'),wd=read('wheel-battloid'),sd=read('suspension-hide')
async function load(p){const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb','public/transformations/cyclone-rear-pieces.glb'].map(load))
async function fixture(){
  const [bike,scott,geo]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(scott.scene),wrapper=new T.Group(),bones=new Map()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});wrapper.add(model);wrapper.scale.setScalar(1.2607598654);wrapper.position.set(.8,.2,-.3);wrapper.updateMatrixWorld(true)
  const front=new FrontBattloidTransform(rig,{model,bones},fd),rear=new RearBattloidTransform(rig,front,rd,geo.scene),guards=new GuardBattloidTransform(rig,{model,bones},gd),wheels=new WheelBattloidTransform(rig,front,rear,wd),suspension=new SuspensionHideTransform(rig,front,guards,sd)
  return{rig,model,bones,wrapper,front,rear,guards,wheels,suspension,apply(p,choreography=p>0?{turn:1,separate:1}:null){suspension.restore();wheels.restore();guards.restore();rear.restore();front.restore();rig.frontForks.forEach(f=>f.update());rig.hydraulics.forEach(h=>h.update());front.apply(p,choreography);rear.apply(p);guards.apply(p,choreography);wheels.apply(p);suspension.apply(p)},dispose(){suspension.dispose();wheels.dispose();guards.dispose();rear.dispose();front.restore()}}
}
const matrixNear=(a,b,message)=>assert.ok(a.elements.every((v,i)=>Math.abs(v-b.elements[i])<1e-6),message)

test('CHEST carries both full suspension/cuff assemblies before the cuffs release toward the forearms',async()=>{
  const f=await fixture()
  for(const [progress,lift]of[[0,0],[0,.25],[0,.7],[0,1],[.05,1],[.2,1],[.22,1]]){
    f.apply(progress,{turn:1,separate:1,chestLift:lift})
    assert.ok(f.guards.applied&&f.suspension.applied)
    for(const group of f.suspension.groups){
      const guard=group.guard,carrier=guard.carrier
      assert.equal(carrier.id,group.carrierId)
      const delta=f.rig.body.matrixWorld.clone().multiply(carrier.current).multiply(carrier.sourceBody.clone().invert()).multiply(f.rig.body.matrixWorld.clone().invert())
      for(const p of [...guard.parts,...group.parts]){
        const source=p.mesh.parent.matrixWorld.clone().multiply(p.matrix)
        matrixNear(p.mesh.matrixWorld,delta.clone().multiply(source),'CHEST movement is applied once to cuffs and suspension; no lag or duplicate lift')
      }
    }
  }
  f.dispose()
})

test('director clock fits cuffs and stows suspensions at main progress zero without changing the approved front motion',async()=>{
  const f=await fixture();f.apply(0,{turn:1,separate:1,chestLift:1,cuffs:0})
  const front=f.front.parts.map(p=>p.mesh.matrixWorld.clone()),tank=f.front.motionGroups.find(g=>g.role==='tank').current.clone()
  for(const cuffs of[.25,.5,.8,1,.5,0]){
    f.apply(0,{turn:1,separate:1,chestLift:1,cuffs})
    assert.equal(!!f.rear.rearActive,false);assert.equal(f.wheels.applied,false)
    f.front.parts.forEach((p,i)=>matrixNear(p.mesh.matrixWorld,front[i],'Only accessory timing changes'))
    matrixNear(f.front.motionGroups.find(g=>g.role==='tank').current,tank,'Tank keeps its existing timing')
    if(cuffs===1){
      for(const g of f.guards.groups)matrixNear(g.current,g.bone.matrixWorld.clone().multiply(g.targetInBone),'Cuffs reach the arms before main transformation begins')
      for(const p of f.suspension.parts)matrixNear(p.mesh.matrixWorld,f.front.anchorWorld.clone().multiply(p.target),'Suspensions already reach the authored hidden placement')
    }
  }
  f.apply(0);assert.equal(f.guards.applied,false);assert.equal(f.suspension.applied,false);f.dispose()
})

test('front is already fitted to the posed chest as Scott rises into T, with continuous upright handoff and unchanged final frames',async()=>{
  const f=await fixture(),source=(await assets)[1],mixer=new T.AnimationMixer(f.model),actions=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
  mixer.clipAction(parseCycloneScottActions(actions).find(c=>c.name==='Cyclone_RidingPose')).play();mixer.update(0);f.wrapper.updateMatrixWorld(true)
  const pose=new TransformationScottPose({model:f.model,bones:f.bones,sourceScene:source.scene},f.wrapper)
  const carriers=f.front.motionGroups.filter(g=>g.role==='carrier')
  for(const alpha of[0,.2,.5,.8,1]){
    pose.restore();pose.apply(alpha);f.wrapper.updateMatrixWorld(true)
    f.apply(0,{turn:1,separate:1,chestLift:1,torsoFollow:1})
    for(const carrier of carriers){
      const actual=f.rig.body.matrixWorld.clone().multiply(carrier.current),expected=f.front.anchor.matrixWorld.clone().multiply(carrier.targetChest)
      matrixNear(actual,expected,'CHEST follows the actual posed torso, not the stationary bike')
      assert.equal(carrier.localBlend,1)
    }
  }
  const before=carriers.map(g=>g.current.clone())
  f.apply(0,{turn:1,separate:1,chestLift:1,torsoFollow:0})
  carriers.forEach((g,i)=>matrixNear(g.current,before[i],'No jump when the original torso reaches the upright reference axes'))
  f.apply(1,{turn:1,chestLift:1})
  for(const p of f.front.parts.filter(p=>p.target))matrixNear(p.mesh.matrixWorld,f.front.anchorWorld.clone().multiply(p.target),'Final authored front pose stays exact')
  pose.restore();f.dispose()
})

test('orange visor and display ride as children of the tank throughout its dip and slide, then reach the new authored targets',async()=>{
  const f=await fixture(),tank=f.front.motionGroups.find(g=>g.role==='tank'),ids=new Set(fd.tankAccessoryUpdate.pieceIds),parts=f.front.parts.filter(p=>p.record.pieceIds.some(id=>ids.has(id)))
  assert.ok(parts.length>=16);assert.ok(parts.every(p=>p.motionGroup===tank))
  assert.ok(parts.some(p=>p.record.pieceIds.includes('340e885e-c8ea-4f4f-9b92-2eef7a23add9')))
  for(const progress of[.22,.26,.32,.5,.64,.8,.86]){
    f.apply(.22+(progress-.22)*.42/.78)
    for(const p of parts){
      const expected=f.rig.body.matrixWorld.clone().multiply(tank.current).multiply(p.localFrom).multiply(p.bindGeometry)
      matrixNear(p.mesh.matrixWorld,expected,'Glass/display keeps its source attachment to the tank, with no independent path through Scott')
    }
  }
  f.apply(1)
  for(const p of parts)matrixNear(p.mesh.matrixWorld,f.front.anchorWorld.clone().multiply(p.target),'Exact new destination')
  f.dispose()
})

test('both complete suspensions follow their respective cuffs before a rapid reduction and exact affine Armor placement',async()=>{
  const f=await fixture()
  for(const p of[.22,.25,.35,.42]){
    f.apply(p)
    assert.equal(f.suspension.applied,true)
    for(const group of f.suspension.groups){
      assert.equal(group.parts.length,13)
      const guard=group.guard,ref=guard.parts[0],source=ref.mesh.parent.matrixWorld.clone().multiply(ref.matrix).multiply(guard.pivot),delta=guard.current.clone().multiply(source.invert())
      for(const part of group.parts){
        const expected=delta.clone().multiply(part.mesh.parent.matrixWorld).multiply(part.matrix)
        matrixNear(part.mesh.matrixWorld,expected,'Full-size forks travel with cuffs first')
      }
    }
  }
  for(const [x,y,z,yaw]of[[0,0,0,0],[43,5,-82,1.2]]){
    f.apply(0);f.rig.root.position.set(x,y,z);f.rig.root.rotation.y=yaw;f.rig.root.updateMatrixWorld(true)
    f.wrapper.position.set(x+.8,y+.2,z-.3);f.wrapper.rotation.y=yaw;f.wrapper.updateMatrixWorld(true)
    for(const p of[.48,.7,1]){
      f.apply(p)
      const common=f.front.anchorWorld.clone().multiply(f.front.referenceBind.clone().invert())
      for(const part of f.suspension.parts){
        matrixNear(part.mesh.matrixWorld,f.front.anchorWorld.clone().multiply(part.target),'Exact affine destination after stow')
        for(const c of part.record.checkpoints){
          const actual=new T.Vector3(...c.source).applyMatrix4(part.mesh.matrixWorld),expected=new T.Vector3(...c.target).applyMatrix4(common)
          assert.ok(actual.distanceTo(expected)<1e-6,'Preserve baked nonuniform scaling; never apply objectPose/group transforms twice')
        }
      }
    }
  }
  f.dispose()
})

test('reversal preserves fork geometry, parents, materials and approved driving articulation, without touching Scott',async()=>{
  const f=await fixture(),original=f.suspension.parts.map(p=>({p,geometry:p.mesh.geometry,material:p.mesh.material,parent:p.mesh.parent,matrix:p.mesh.matrix.clone(),auto:p.mesh.matrixAutoUpdate,visible:p.mesh.visible})),bones=[...f.bones.values()].map(b=>({b,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  for(let repeat=0;repeat<3;repeat++)for(const p of[0,.3,.43,.465,.48,.8,1,.465,.3,0])f.apply(p)
  for(const o of original){assert.equal(o.p.mesh.geometry,o.geometry);assert.equal(o.p.mesh.material,o.material);assert.equal(o.p.mesh.parent,o.parent);matrixNear(o.p.mesh.matrix,o.matrix,'Restore original local transform');assert.equal(o.p.mesh.matrixAutoUpdate,o.auto);assert.equal(o.p.mesh.visible,o.visible)}
  for(const o of bones){assert.deepEqual(o.b.position.toArray(),o.p);assert.deepEqual(o.b.quaternion.toArray(),o.q);assert.deepEqual(o.b.scale.toArray(),o.s)}
  for(const fork of f.rig.frontForks){fork.update();assert.ok(fork.state.topError+fork.state.bottomError+fork.state.axisError+fork.state.radialError<1e-5)}
  f.dispose()
})
