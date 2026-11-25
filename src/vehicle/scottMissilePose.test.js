import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {AnimationMixer,Group,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {updateScottGameplay} from './scottGameplay.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {GuardBattloidTransform} from './GuardBattloidTransform.js'
import {CuffMissiles} from './CuffMissiles.js'
import {ScottMissilePose} from './ScottMissilePose.js'
import {ScottArmorBoostMotion} from './ScottArmorBoostMotion.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const read=path=>JSON.parse(fs.readFileSync(path)),load=async path=>{const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')},assets=Promise.all(['public/models/mospeada/cyclone-vr052f.glb','public/models/mospeada/scott-bernard-animated-original.glb'].map(load)),data=read('public/animations/scott-cyclone-actions.json')
async function fixture(){
 const [bike,source]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(source.scene),wrapper=new Group(),bones=new Map(),skins=[];wrapper.add(model);model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
 const state=createBikeState({x:0,z:0,yaw:0},rig.metrics,()=>0);state.height+=3;state.frontSpring+=3;state.rearSpring+=3
 const entry={phase:'complete',poseBlend:1,returnFlight:false,actorOffset:new Vector3(),actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}},instance={model,sourceScene:source.scene,sourceClips:source.animations,bones,skins,mixer:new AnimationMixer(model),clip:null},runtime={state,vehicleRig:rig,scottBikeBody:rig.body,scottInstance:instance,transformEntry:entry,paused:false,keys:{}},clips=[...source.animations,...parseCycloneScottActions(data)]
 const base=()=>{rig.update(state,()=>0,bikeConfig);updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60);if(instance.armorBoostMotion)instance.armorBoostMotion.apply(entry,{boostBlend:1,boosting:true,thrustForward:1},1/60,false)};base();const guards=new GuardBattloidTransform(rig,instance,read('public/transformations/cyclone-guard-battloid.json'));guards.apply(1)
 const missiles=new CuffMissiles();missiles.bind(guards);const pose=instance.missilePose=new ScottMissilePose(instance),target={position:new Vector3(0,state.height+1.5,25),height:5.2,dead:false}
 const tick=dt=>{guards.restore();base();pose.apply(dt,true,()=>0);guards.apply(1)}
 const feet=()=>['Left','Right'].map(side=>bones.get(`mixamorig${side}Foot`).getWorldPosition(new Vector3())),bend=side=>{const p=['UpLeg','Leg','Foot'].map(n=>bones.get(`mixamorig${side}${n}`).getWorldPosition(new Vector3()));return p[1].clone().sub(p[0]).normalize().dot(p[2].clone().sub(p[1]).normalize())}
 return{pose,missiles,tick,base,bones,state,instance,wrapper,target,feet,bend}
}

test('left cuff rises and legs open in the approved reverse-boost chain, including undeformed feet and toes',async()=>{
 const f=await fixture(),{pose,target,missiles,tick}=f,head=f.bones.get('mixamorigHead').getWorldPosition(new Vector3()),control=JSON.stringify(f.state)
 assert.ok(pose.request(target,missiles.launchers[1]));assert.equal(pose.ready,false)
 for(let i=0;i<21;i++)tick(1/60)
 assert.ok(pose.ready);assert.equal(pose.diagnostics.side,'Left');assert.ok(pose.diagnostics.barrelAlignment>.99);assert.ok(pose.diagnostics.cuffHeight>pose.diagnostics.shoulderHeight-.15,'The left cuff is raised rather than firing downward')
 const feet=f.feet(),width=feet[0].distanceTo(feet[1]),bend=f.bend('Left'),windupHead=f.bones.get('mixamorigHead').getWorldPosition(new Vector3());assert.ok(windupHead.z<head.z-.05,'Scott visibly leans back')
 pose.commit();for(let i=0;i<16;i++)tick(1/60)
 const open=f.feet();assert.ok(open[0].distanceTo(open[1])>width+.2,'Both legs open after ejection');for(const r of pose.legPoses)if(/(Leg|Foot|ToeBase)$/.test(r.bone.name)&&!r.thigh)assert.ok(r.bone.quaternion.angleTo(r.reverse)<1e-6,'Knees, ankles and toes retain the same local chain as reverse boost');assert.equal(JSON.stringify(f.state),control,'The photo pose does not move gameplay physics')
 const time=pose.age,paused=[...f.bones.values()].map(b=>b.quaternion.toArray());tick(0);assert.equal(pose.age,time);assert.deepEqual([...f.bones.values()].map(b=>b.quaternion.toArray()),paused)
 for(let i=0;i<70;i++)tick(1/60);assert.equal(pose.active,false);pose.cancel();assert.equal(pose.applied,false)
})

test('firing from forward boost transitions to reverse boost without pinning or twisting the feet',async()=>{
 const f=await fixture();f.instance.armorBoostMotion=new ScottArmorBoostMotion(f.instance,f.wrapper,()=>.99);f.base();assert.ok(f.pose.request(f.target,f.missiles.launchers[1]));for(let i=0;i<21;i++)f.tick(1/60);assert.ok(f.pose.ready);f.pose.commit();for(let i=0;i<16;i++)f.tick(1/60);for(const r of f.pose.legPoses)if(!r.thigh)assert.ok(r.bone.quaternion.angleTo(r.reverse)<1e-6);assert.ok([...f.bones.values()].every(b=>b.quaternion.toArray().every(Number.isFinite)));f.pose.cancel()
})

test('missile pose restores the native skeleton exactly and cancellation cannot eject a cap',async()=>{
 const f=await fixture(),before=[...f.bones.values()].map(b=>({b,q:b.quaternion.toArray(),p:b.position.toArray()})),position=f.wrapper.position.clone(),clips=f.instance.sourceClips.map(c=>c.tracks.map(t=>Array.from(t.values)))
 f.pose.request(f.target,f.missiles.launchers[1]);f.pose.apply(.1,true,()=>0);f.pose.cancel();for(const r of before){assert.deepEqual(r.b.quaternion.toArray(),r.q);assert.deepEqual(r.b.position.toArray(),r.p)}assert.deepEqual(f.wrapper.position,position);assert.equal(f.missiles.remaining,4);assert.deepEqual(f.instance.sourceClips.map(c=>c.tracks.map(t=>Array.from(t.values))),clips)
 f.pose.request(f.target,f.missiles.launchers[0]);f.target.dead=true;f.pose.apply(.1,true,()=>0);assert.equal(f.pose.active,false);assert.equal(f.pose.ready,false)
})
