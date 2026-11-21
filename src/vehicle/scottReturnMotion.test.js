import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ScottReturnMotion,sampleScottReturnMotion} from './ScottReturnMotion.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {updateScottGameplay} from './scottGameplay.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {returnProgress,sampleReturnPhases} from './returnChoreography.js'
import {ScottArmorIdleMotion} from './ScottArmorIdleMotion.js'
import {ScottArmorBoostMotion,armorBoostLegWeight} from './ScottArmorBoostMotion.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb'].map(load))
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)}
function clock(t){
  const p=t<.24?1:t<1.24?1-(t-.24):0
  return{returnFlight:true,phase:t<.24?'returnboost':t<1.24?'reversing':t<1.42?'returnpose':'falling',time:t<.24?t:t<1.24?t-.24:t-1.24,poseBlend:t<1.24?1:1-smooth((t-1.24)/.18),actorOffset:new T.Vector3(),store:{snapshot:()=>({progress:p})},
    get actorPose(){const tuck=this.phase==='returnboost'?smooth(this.time/.18):1;return{arms:1,legs:1,returnTuck:tuck,leftToeDown:1-tuck,rightToeDown:1-tuck}}}
}
async function fixture(){
  const [bike,scott]=await assets,rig=createDrivingCyclone(bike.scene),wrapper=new T.Group(),model=clone(scott.scene),bones=new Map(),skins=[]
  wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
  const s=createBikeState({x:0,z:0,yaw:.3},rig.metrics,()=>0);s.height+=3;s.airborne=true;s.frontGrounded=s.rearGrounded=false;s.riderStand=1;s.speed=25;s.idleBlend=0
  const runtime={state:s,paused:false,vehicleRig:rig,scottBikeBody:rig.body},instance={model,sourceScene:scott.scene,sourceClips:scott.animations,bones,skins,mixer:new T.AnimationMixer(model),clip:null}
  const clips=[...scott.animations,...parseCycloneScottActions(data)]
  return{rig,wrapper,model,bones,instance,runtime,scott,step(t){runtime.transformEntry=clock(t);rig.update(s,()=>0,bikeConfig);updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60);instance.returnMotion ||=new ScottReturnMotion(instance,wrapper);return instance.returnMotion}}
}

test('body score overlaps independent regions, remains continuous across boost/assembly/handoff, and pauses deterministically',()=>{
  for(const t of [.24,1.24]){
    const before=sampleScottReturnMotion(clock(t-1e-7)),after=sampleScottReturnMotion(clock(t+1e-7))
    for(const k of Object.keys(before))assert.ok(Math.abs(before[k]-after[k])<1e-4,k)
  }
  const a=sampleScottReturnMotion(clock(1.10)),b=sampleScottReturnMotion(clock(1.10));assert.ok(a.reachLeft>a.reachRight);assert.ok(a.legLeft>a.legRight);assert.ok(b.feetLeft>b.feetRight)
  const entry=clock(.6);assert.deepEqual(sampleScottReturnMotion(entry),sampleScottReturnMotion(entry))
  assert.equal(sampleScottReturnMotion({...entry,returnFlight:false}),null)
  assert.equal(sampleScottReturnMotion(clock(1.42)),null)
})

test('Scott moves throughout return while mechanical meshes, original clips, skinning and limb lengths stay untouched',async()=>{
  const f=await fixture(),frames=[],source=f.scott.animations.map(c=>c.tracks.map(t=>t.values.slice())),skin=f.instance.skins.map(s=>({mesh:s.mesh,g:s.mesh.geometry,w:s.mesh.geometry.attributes.skinWeight.array.slice()}))
  for(let i=0;i<=85;i++){
    const t=Math.min(1.42,i/60),motion=f.step(t),before=[...f.bones.values()].map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})),mechanics=f.rig.surfaces.map(m=>m.matrixWorld.clone())
    const solve=f.instance.mountedMotion.solve
    f.instance.mountedMotion.solve=()=>{throw Error('Transformation body must not invoke free IK')}
    try{motion.apply(f.runtime.transformEntry)}finally{f.instance.mountedMotion.solve=solve}
    f.wrapper.updateMatrixWorld(true)
    for(const r of before){assert.deepEqual(r.b.scale.toArray(),r.s.toArray());if(r.b.name!=='mixamorigHips')assert.deepEqual(r.b.position.toArray(),r.p.toArray())}
    f.rig.surfaces.forEach((m,i)=>assert.deepEqual(m.matrixWorld.elements,mechanics[i].elements,'Visible body performance never drives a mechanical anchor'))
    const pose=[...f.bones.values()].map(b=>b.quaternion.clone()),hips=f.bones.get('mixamorigHips').getWorldPosition(new T.Vector3())
    frames.push({t,pose,hips})
    if(t>=1.24&&t<1.27)for(const arm of motion.arms)assert.ok(arm.bone.getWorldPosition(new T.Vector3()).distanceTo(arm.target)<.07,'Guided arms finish near the existing jump/handlebar pose without free IK')
    motion.restore();for(const r of before){assert.deepEqual(r.b.quaternion.toArray(),r.q.toArray());assert.deepEqual(r.b.position.toArray(),r.p.toArray())}
  }
  for(let i=6;i<frames.length;i+=6){
    const a=frames[i-6],b=frames[i],movement=Math.max(...a.pose.map((q,j)=>q.angleTo(b.pose[j])))
    assert.ok(movement>.012||a.hips.distanceTo(b.hips)>.003,`No frozen pose over ${a.t.toFixed(2)}–${b.t.toFixed(2)} s`)
  }
  assert.ok(Math.max(...frames.map(r=>r.hips.y))-Math.min(...frames.map(r=>r.hips.y))>.07,'Pelvis anticipates, descends and settles')
  f.scott.animations.forEach((c,i)=>c.tracks.forEach((t,j)=>assert.deepEqual(t.values,source[i][j])))
  for(const s of skin){assert.equal(s.mesh.geometry,s.g);assert.deepEqual(s.g.attributes.skinWeight.array,s.w)}
})

test('one progress maps boost, mechanical assembly and body phases without retiming',()=>{
  for(const t of [0,.12,.24,.40,.8,1.10,1.24,1.33,1.42]){
    const e=clock(t),p=returnProgress(e),phases=sampleReturnPhases(p)
    assert.ok(Math.abs(phases.mechanical-e.store.snapshot().progress)<1e-12)
    assert.ok(Math.abs(p-t/1.42)<1e-12)
    const score=sampleScottReturnMotion(e);if(score)assert.equal(score.progress,p)
  }
})

test('crossing safety caps the torso around its pelvis and retreats from a front-module volume',async()=>{
  const f=await fixture(),motion=f.step(1.09),entry=f.runtime.transformEntry
  motion.apply(entry)
  const b=n=>f.bones.get('mixamorig'+n),head=b('Head').getWorldPosition(new T.Vector3()).lerp(b('HeadTop_End').getWorldPosition(new T.Vector3()),.5)
  const q=f.model.getWorldQuaternion(new T.Quaternion()),module=new T.Mesh(new T.BoxGeometry(.22,.28,.02))
  module.position.copy(head).add(new T.Vector3(0,0,.11).applyQuaternion(q));module.quaternion.copy(q);module.updateMatrixWorld(true)
  motion.restore();f.step(.36);motion.apply(entry,{parts:[{mesh:module,motionGroup:{role:'carrier'}}]})
  assert.ok(motion.safety.active>.99);assert.ok(motion.safety.volumes===1)
  assert.ok(motion.safety.lean<=motion.safety.limit+.04,JSON.stringify(motion.safety))
  assert.ok(motion.safety.retreat>0&&motion.safety.retreat<.24,'Bounded backward pelvis correction, no global assembly movement')
  assert.ok(motion.safety.headClearance>=-.003,'Head safety sphere clears the approximate front-module volume')
  motion.restore();module.geometry.dispose();module.material.dispose()
})

test('Armor boost sweeps both feet behind the pelvis using native trailing strides and restores rest',async()=>{
  const f=await fixture(),motion=f.step(0);f.runtime.transformEntry={phase:'complete',returnFlight:false,poseBlend:1,actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1},actorOffset:new T.Vector3()}
  updateScottGameplay(f.instance,{data},[...f.scott.animations,...parseCycloneScottActions(data)],f.runtime,f.wrapper,1/60)
  const boost=new ScottArmorBoostMotion(f.instance,f.wrapper),point=n=>f.model.worldToLocal(f.bones.get('mixamorig'+n).getWorldPosition(new T.Vector3()))
  const feet=['Left','Right'].map(s=>point(s+'Foot')),before=[...f.bones.values()].map(b=>({b,q:b.quaternion.toArray(),p:b.position.toArray(),s:b.scale.toArray()}))
  boost.apply(f.runtime.transformEntry,{boostBlend:1})
  for(const [i,side]of ['Left','Right'].entries()){
    const foot=point(side+'Foot'),hip=point(side+'UpLeg'),knee=point(side+'Leg')
    assert.ok(foot.z<feet[i].z-.10,side+' foot must trail behind')
    const flex=180-T.MathUtils.radToDeg(hip.clone().sub(knee).angleTo(foot.clone().sub(knee)))
    assert.ok(flex>25&&flex<135,'Natural bent knee from Running')
  }
  for(const r of before){assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.scale.toArray(),r.s);if(!/(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(r.b.name))assert.deepEqual(r.b.quaternion.toArray(),r.q)}
  const trailingWidth=Math.abs(point('LeftFoot').x-point('RightFoot').x)
  boost.restore();for(const r of before)assert.deepEqual(r.b.quaternion.toArray(),r.q)
  assert.ok(armorBoostLegWeight({phase:'armorboost',time:.10},{})<.25,'Departure eases in instead of snapping to full flexion in 100 ms')
  boost.apply({phase:'armorboost',time:.35,returnFlight:false},{})
  assert.ok(Math.abs(point('LeftFoot').x-point('RightFoot').x)>trailingWidth+.15,'Transformation departure opens both trailing legs')
  for(const [i,side]of ['Left','Right'].entries())assert.ok(point(side+'Foot').z<feet[i].z-.10,'Opened legs still trail behind')
  boost.restore();for(const r of before)assert.deepEqual(r.b.quaternion.toArray(),r.q)
  assert.equal(armorBoostLegWeight(clock(.12),{}),1);assert.equal(armorBoostLegWeight(clock(.52),{}),0)
  boost.apply({phase:'idle'}, {boostBlend:1});assert.equal(boost.applied,false)
})

test('Armor micro-motion stays additive and subtle, pauses exactly and restores the approved base pose',async()=>{
  const f=await fixture();f.step(0);const idle=new ScottArmorIdleMotion(f.instance,f.wrapper),entry={phase:'complete',returnFlight:false}
  const base=idle.records.map(r=>({b:r.bone,q:r.bone.quaternion.clone(),p:r.bone.position.clone(),s:r.bone.scale.clone()}));let maximum=0
  for(let i=0;i<1200;i++){
    idle.restore();idle.apply(entry,1/60,false,{enabled:true,intensity:1},true)
    for(const r of base){maximum=Math.max(maximum,r.b.quaternion.angleTo(r.q));assert.deepEqual(r.b.position.toArray(),r.p.toArray());assert.deepEqual(r.b.scale.toArray(),r.s.toArray())}
  }
  assert.ok(maximum>.003&&maximum<.02,'Visible micro-gestures below 1.15 degrees, without cumulative drift')
  const paused=idle.records.map(r=>r.bone.quaternion.toArray()),time=idle.time
  for(let i=0;i<20;i++){idle.restore();idle.apply(entry,.1,true,{enabled:true,intensity:1},true);assert.equal(idle.time,time);idle.records.forEach((r,j)=>assert.deepEqual(r.bone.quaternion.toArray(),paused[j]))}
  idle.restore();idle.apply({phase:'reversing',returnFlight:true},1/60,false);assert.equal(idle.applied,false)
  for(const r of base)assert.deepEqual(r.b.quaternion.toArray(),r.q.toArray())
  idle.apply(entry,1/60,false,{enabled:false,intensity:1});assert.equal(idle.applied,false)
})
