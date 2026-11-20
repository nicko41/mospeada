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
import {TransformationFrame} from './TransformationFrame.js'
import {TransformationScottPose} from './TransformationScottPose.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {sampleFrontSequence} from './frontTransformMath.js'
import {FrontTransformEntry} from './FrontTransformEntry.js'
import {frontTransformState as store} from './frontTransformState.js'
import {createBikeState,advanceBike} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=n=>JSON.parse(fs.readFileSync('public/transformations/cyclone-'+n+'.json'))
const fd=data('front-battloid'),rd=data('rear-battloid'),gd=data('guard-battloid'),wd=data('wheel-battloid'),sd=data('suspension-hide')
const actions=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
async function load(p){const b=fs.readFileSync(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb','public/transformations/cyclone-rear-pieces.glb'].map(load))
const flat=(x,z,out)=>{if(out)out.surface='asphalt';return 0}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
async function fixture(){
  const [bike,scott,geo]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(scott.scene),wrapper=new T.Group(),bones=new Map()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});wrapper.add(model);wrapper.scale.setScalar(actions.actorScale)
  const mixer=new T.AnimationMixer(model);mixer.clipAction(parseCycloneScottActions(actions).find(c=>c.name==='Cyclone_RidingPose')).play();mixer.update(0)
  const pose=new TransformationScottPose({model,bones,sourceScene:scott.scene,sourceClips:scott.animations},wrapper)
  const front=new FrontBattloidTransform(rig,{model,bones},fd),rear=new RearBattloidTransform(rig,front,rd,geo.scene),guards=new GuardBattloidTransform(rig,{model,bones},gd),wheels=new WheelBattloidTransform(rig,front,rear,wd),suspension=new SuspensionHideTransform(rig,front,guards,sd),frame=new TransformationFrame(rig)
  const state=createBikeState({x:18,z:-24,yaw:.3},rig.metrics,flat);state.speed=24;state.parked=false;state.idleBlend=0
  const nodes=[...new Set([...rig.surfaces,...rear.parts.map(p=>p.mesh),...rig.hydraulics.flatMap(h=>[h.root,h.sleeve,h.rod,h.endJoint,h.endPin])])]
  function restore(){frame.restore();suspension.restore();wheels.restore();guards.restore();rear.restore();front.restore();pose.restore()}
  return{rig,state,wrapper,front,rear,guards,wheels,suspension,frame,nodes,restore,render(progress,offset,poseBlend=1,choreography={turn:1,separate:1,chestLift:1}){
    restore();rig.update(state,flat,bikeConfig,choreography?.presentationTilt)
    const physicsRoot=rig.root.position.clone()
    wrapper.position.copy(rig.body.localToWorld(new T.Vector3(...actions.actorOrigin)));wrapper.quaternion.copy(rig.body.getWorldQuaternion(new T.Quaternion()));wrapper.updateMatrixWorld(true)
    if(poseBlend>0)pose.apply(poseBlend,choreography?.actorPoseData??(choreography?.holdArmorPose?{arms:1,legs:1,leftToeDown:1,rightToeDown:1}:sampleFrontSequence(progress)))
    wrapper.position.add(offset);wrapper.updateMatrixWorld(true)
    frame.apply(offset)
    const mechanical=choreography?.mechanicalProgress??progress
    front.apply(progress,choreography);rear.apply(mechanical,choreography);guards.apply(progress,choreography);wheels.apply(mechanical);suspension.apply(progress)
    return{physicsRoot,matrices:nodes.map(m=>{m.updateWorldMatrix(true,false);return m.matrixWorld.clone()}),lengths:rig.hydraulics.map(h=>h.state.length)}
  },dispose(){restore();rear.dispose();mixer.stopAllAction();frame.dispose()}}
}

function equalTranslated(base,moved,offset){
  const translation=new T.Matrix4().makeTranslation(...offset.toArray());let error=0
  for(let i=0;i<base.matrices.length;i++){
    const expected=translation.clone().multiply(base.matrices[i])
    error=Math.max(error,...expected.elements.map((v,k)=>Math.abs(v-moved.matrices[i].elements[k])))
  }
  assert.ok(error<1e-6,`Internal piece trajectories must not depend on boost displacement: ${error}`)
  for(let i=0;i<2;i++)assert.ok(Math.abs(base.lengths[i]-moved.lengths[i])<1e-6,'Hydraulics cannot stretch across the distance to the old Motorcycle origin')
  return error
}

test('world presentation offset restores exactly under a transformed parent and never accumulates',()=>{
  const parent=new T.Group(),root=new T.Group();parent.position.set(30,2,-17);parent.rotation.set(.1,1.3,-.2);parent.scale.setScalar(1.4);parent.add(root)
  root.position.set(4,2,-3);root.rotation.set(.2,.4,.1);parent.updateMatrixWorld(true)
  const frame=new TransformationFrame({root}),position=root.position.clone(),q=root.quaternion.clone(),origin=root.getWorldPosition(new T.Vector3()),offset=new T.Vector3(7.5,2.4,-3),copy=offset.clone()
  for(let i=0;i<100;i++){frame.apply(offset);assert.ok(root.getWorldPosition(new T.Vector3()).distanceTo(origin.clone().add(offset))<1e-8);frame.restore();assert.ok(root.position.distanceTo(position)<1e-12);assert.deepEqual(root.quaternion.toArray(),q.toArray())}
  frame.apply(offset);frame.dispose();assert.ok(root.position.distanceTo(position)<1e-12);assert.deepEqual(offset,copy)
})

test('every intermediate Armor -> Motorcycle pose stays together with the full boost offset while advancing and turning',async()=>{
  const f=await fixture(),rows=[]
  for(let i=0;i<=40;i++){
    const p=1-i/40,offset=new T.Vector3(2.5,2.4,7.5).multiplyScalar(smooth(p)),fade=smooth(p/.25),choreography={turn:fade,separate:fade,chestLift:fade}
    f.restore();advanceBike(f.state,{throttle:.8,steer:.25},1/30,f.rig.metrics,flat,()=>true,bikeConfig)
    const state=JSON.stringify(f.state),base=f.render(p,new T.Vector3(),1,choreography),moved=f.render(p,offset,1,choreography)
    const error=equalTranslated(base,moved,offset)
    assert.equal(JSON.stringify(f.state),state,'Presentation does not modify the driving state')
    f.frame.restore();assert.ok(f.rig.root.position.distanceTo(moved.physicsRoot)<1e-9)
    rows.push({progress:p,offset:offset.toArray(),hydraulicLengths:moved.lengths,maxFrameError:error})
  }
  fs.mkdirSync('artifacts/transformation-reverse',{recursive:true});fs.writeFileSync('artifacts/transformation-reverse/regression.json',JSON.stringify(rows,null,2)+'\n')
  f.dispose()
})

test('real T sequence reverses after boost, pauses and restores at moving Motorcycle without separated source frames',async()=>{
  const f=await fixture(),runtime={state:f.state};store.bindEntry(null);store.reset();store.set({ready:true,duration:2})
  const entry=new FrontTransformEntry(store,runtime),rows=[]
  function tick(){
    f.restore()
    const dt=1/60,input=entry.beforePhysics({throttle:.8,steer:.12},dt),config={...bikeConfig,...entry.physicsConfig}
    advanceBike(f.state,input,dt,f.rig.metrics,flat,()=>true,config);entry.afterPhysics(dt,f.rig.metrics,config);store.advance(dt,entry.assemblyDuration)
    const p=store.snapshot().progress,choreography={...entry.choreography,actorPoseData:entry.actorPose,holdArmorPose:entry.returnFlight,presentationTilt:entry.returnTilt},offset=entry.actorOffset.clone()
    const base=f.render(p,new T.Vector3(),entry.poseBlend,choreography),moved=f.render(p,offset,entry.poseBlend,choreography)
    const error=equalTranslated(base,moved,offset)
    if(entry.phase==='reversing')rows.push({progress:p,offset:offset.toArray(),hydraulicLengths:moved.lengths,maxFrameError:error})
  }
  entry.request();for(let i=0;i<360&&entry.phase!=='complete';i++)tick()
  assert.equal(entry.phase,'complete');assert.ok(entry.actorOffset.length()>7)
  entry.request();assert.equal(entry.phase,'returnboost')
  for(let i=0;i<28;i++)tick()
  entry.pause();const before=JSON.stringify(f.state),offset=entry.actorOffset.clone(),p=store.snapshot().progress
  const a=f.render(p,offset,entry.poseBlend,entry.choreography)
  for(let i=0;i<6;i++)equalTranslated(a,f.render(p,offset,entry.poseBlend,entry.choreography),new T.Vector3())
  assert.equal(JSON.stringify(f.state),before);entry.resume()
  for(let i=0;i<240&&entry.phase!=='idle';i++)tick()
  assert.equal(entry.phase,'idle');assert.equal(store.snapshot().progress,0);assert.equal(entry.actorOffset.length(),0);assert.equal(f.frame.applied,false)
  assert.ok(rows.length>=59&&rows.length<=61);assert.ok(f.state.z>-24&&Math.abs(f.state.yaw-.3)>.01)
  fs.writeFileSync('artifacts/transformation-reverse/director-regression.json',JSON.stringify(rows,null,2)+'\n')
  f.dispose()
})
