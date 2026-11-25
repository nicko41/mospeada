import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Quaternion,Vector3} from 'three'
import {ridingFixture} from '../../scripts/scott-v2-riding-fixture.mjs'
import {v3ArmorFixture} from '../../scripts/scott-v3-armor-fixture.mjs'
import {ScottV3Visual} from './ScottV3Visual.js'
import {scottV3Config} from './scottV3Config.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=(async()=>{const b=fs.readFileSync('public/models/mospeada/scott-gear-v3-animated.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')})()
const point=(f,v,name)=>f.rig.body.worldToLocal(v.retarget.bones.get(name).getWorldPosition(new Vector3()))
const bend=(f,v,side,leg)=>{const [a,b,c]=(leg?['UpLeg','Leg','Foot']:['Arm','ForeArm','Hand']).map(n=>point(f,v,side+n));return b.clone().sub(a).angleTo(c.sub(b))}
async function fixture(){const f=await ridingFixture(),v=new ScottV3Visual(f.instance,(await asset).scene);f.runtime.scottData=f.authored.data;return{f,v}}

test('Cyclone flight keeps both feet on the relocated supports with soft knees and native limb lengths',async()=>{
 const {f,v}=await fixture(),rest=v.retarget.records.map(r=>({r,p:r.p.clone(),s:r.s.clone()})),g=v.skins[0].mesh.geometry,positions=g.attributes.position.array.slice(),weights=g.attributes.skinWeight.array.slice()
 try{
  for(const patch of [{airborne:true,riderStand:1,boostBlend:0,pitch:0},{airborne:true,riderStand:1,boostBlend:0,pitch:.16},{airborne:true,riderStand:.65,boostBlend:1,pitch:0}]){
   Object.assign(f.s,{speed:18,idleBlend:0,parked:false,frontGrounded:false,rearGrounded:false,airTime:.8,...patch});f.step(100);v.apply(f.runtime)
   assert.ok(v.diagnostics.cycloneAirHipDrop>=0&&v.diagnostics.cycloneAirHipDrop<=.18)
   if(patch.riderStand===1)assert.ok(v.diagnostics.cycloneAirHipDrop>.02,'V2 standing height still overextends V3')
   for(const side of ['Left','Right']){assert.ok(bend(f,v,side,true)>=29.99*Math.PI/180,'Mounted jump knee is locked: '+side);assert.ok(v.diagnostics.contacts[side+'Foot']<.002,'Boot loses its bike support: '+side)}
   for(const {r,p,s}of rest){if(r.name!=='Hips')assert.ok(r.b.position.distanceTo(p)<1e-12);assert.ok(r.b.scale.distanceTo(s)<1e-12)}
  }
  Object.assign(f.s,{airborne:false,riderStand:0,boostBlend:0,pitch:0,frontGrounded:true,rearGrounded:true});f.step(100);v.apply(f.runtime)
  assert.equal(v.diagnostics.cycloneAirHipDrop,undefined,'Flight correction leaked onto normal riding')
  assert.deepEqual(g.attributes.position.array,positions);assert.deepEqual(g.attributes.skinWeight.array,weights)
 }finally{v.dispose()}
})

test('Cyclone riding keeps relocated boots and opens elbows toward the V1 intro reference without moving the body',async()=>{
 const saved={...scottV3Config.riding},{f,v}=await fixture()
 try{
  Object.assign(f.s,{speed:3,idleBlend:0,parked:false,airborne:false,riderStand:0})
  Object.assign(scottV3Config.riding,{elbowReference:'previous',footOffset:[0,0,-.07],elbowPoleOut:0,minimumElbowBend:22*Math.PI/180,standard:{elbowPoleOut:0,minimumElbowBend:22*Math.PI/180}})
  f.step(100);v.apply(f.runtime)
  const before=Object.fromEntries(['Hips','Spine','Spine1','Spine2','Head','LeftFoot','RightFoot','LeftForeArm','RightForeArm'].map(n=>[n,point(f,v,n)]))
  Object.assign(scottV3Config.riding,saved);f.step(5);v.apply(f.runtime)
  for(const name of ['Hips','Spine','Spine1','Spine2','Head'])assert.ok(point(f,v,name).distanceTo(before[name])<1e-7,'Support fitting moved the approved body: '+name)
  for(const side of ['Left','Right']){
   const dz=point(f,v,side+'Foot').z-before[side+'Foot'].z,dx=(point(f,v,side+'ForeArm').x-before[side+'ForeArm'].x)*(side==='Left'?1:-1)
   assert.ok(dz<-.08&&dz>-.12,'Foot support was not moved back: '+side)
   assert.ok(dx>.04&&dx<.12,'Elbow should follow the wider V1 reference: '+side)
   assert.ok(bend(f,v,side,false)>43*Math.PI/180&&bend(f,v,side,false)<48*Math.PI/180)
  }
 }finally{Object.assign(scottV3Config.riding,saved);v.dispose()}
})

test('V1 elbow opening changes only native arm chains while hands, seated body and source rig remain approved',async()=>{
 const {f,v}=await fixture(),riding=scottV3Config.riding,saved=riding.elbowReference
 const protectedPose=()=>[...v.retarget.bones].filter(([n])=>!/^(Left|Right)(Arm|ForeArm|Hand)/.test(n)).map(([n,b])=>[n,b.matrixWorld.toArray()])
 try{
  for(const patch of [{airborne:false,riderStand:0},{airborne:true,riderStand:1},{airborne:true,riderStand:.65,boostBlend:1}]){
   Object.assign(f.s,{speed:18,idleBlend:0,parked:false,boostBlend:0,...patch});f.step(100)
   riding.elbowReference='previous';v.apply(f.runtime)
   const body=protectedPose(),source=[...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()]),before=Object.fromEntries(['Left','Right'].map(s=>[s,{elbow:point(f,v,s+'ForeArm'),hand:point(f,v,s+'Hand'),wrist:v.retarget.bones.get(s+'Hand').getWorldQuaternion(new Quaternion())}]))
   riding.elbowReference='intro';v.apply(f.runtime)
   assert.deepEqual(protectedPose(),body,'Opening the arms changed torso, shoulders, pelvis, head or legs')
   assert.deepEqual([...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()]),source,'Opening leaked into V1/V2')
   for(const side of ['Left','Right']){
    const outward=(point(f,v,side+'ForeArm').x-before[side].elbow.x)*(side==='Left'?1:-1)
    assert.ok(outward>.04&&outward<.11,'The V1 opening should be visible without overextending: '+side)
    assert.ok(point(f,v,side+'Hand').distanceTo(before[side].hand)<1e-8,'Opening dragged the hand off its grip zone')
    assert.ok(v.retarget.bones.get(side+'Hand').getWorldQuaternion(new Quaternion()).angleTo(before[side].wrist)<1e-7,'Opening twisted a wrist')
   }
  }
 }finally{riding.elbowReference=saved;v.dispose()}
})

test('Cyclone pose refinements do not change Armor Mode or its approved waist-to-knee attachments',async()=>{
 const f=await v3ArmorFixture(),v=f.visual
 try{
  Object.assign(f.s,{airborne:true,riderStand:1});f.tick()
  assert.equal(v.diagnostics.cycloneAirHipDrop,undefined)
  const approved=[...v.retarget.bones].map(([name,b])=>({name,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  v.retarget.apply()
  for(const r of approved){const b=v.retarget.bones.get(r.name);assert.deepEqual(b.position.toArray(),r.p);assert.deepEqual(b.quaternion.toArray(),r.q);assert.deepEqual(b.scale.toArray(),r.s)}
  assert.ok(v.diagnostics.caballers.every(d=>d.error<1e-8&&d.waistError<1e-8))
 }finally{v.dispose()}
})

test('Cyclone upper-body refinement preserves approved feet while bending knees, extending the waist and relaxing the neck',async()=>{
 const {f,v}=await fixture(),riding=scottV3Config.riding,saved={knee:riding.airborne.minimumKneeBend,extension:riding.airborne.torsoExtension,head:riding.headPitch,clavicle:riding.clavicleRelax}
 const facing=name=>new Vector3(0,0,1).applyQuaternion(v.retarget.bones.get(name).getWorldQuaternion(new Quaternion()).multiply(v.retarget.targetBind.get(name).rotation.clone().invert()).premultiply(f.rig.body.getWorldQuaternion(new Quaternion()).invert()))
 const pitch=name=>{const p=facing(name);return Math.atan2(-p.y,p.z)}
 const neckExtension=()=>{const r=v.retarget.records.find(r=>r.name==='Head');return r.b.quaternion.angleTo(r.q)}
 try{
  Object.assign(f.s,{speed:18,idleBlend:0,parked:false,airborne:true,riderStand:1,frontGrounded:false,rearGrounded:false})
  riding.airborne.minimumKneeBend=30*Math.PI/180;riding.airborne.torsoExtension=0;riding.headPitch=0;riding.clavicleRelax=0
  f.step(100);v.apply(f.runtime)
  const feet=['Left','Right'].map(s=>point(f,v,s+'Foot')),knees=['Left','Right'].map(s=>bend(f,v,s,true)),torso=pitch('Spine2'),face=pitch('Head'),neck=neckExtension(),waist=point(f,v,'Spine2').y-point(f,v,'Hips').y
  riding.airborne.minimumKneeBend=saved.knee;riding.airborne.torsoExtension=saved.extension;riding.headPitch=saved.head;riding.clavicleRelax=saved.clavicle
  v.apply(f.runtime)
  for(const [i,side]of ['Left','Right'].entries()){assert.ok(point(f,v,side+'Foot').distanceTo(feet[i])<1e-8,'Approved support moved: '+side);assert.ok(bend(f,v,side,true)>knees[i]+10*Math.PI/180)}
  assert.ok(pitch('Spine2')<torso-5*Math.PI/180,'Back remains excessively rounded forward')
  assert.ok(point(f,v,'Spine2').y-point(f,v,'Hips').y>waist+.015,'Waist failed to open through posture')
  assert.ok(pitch('Head')>face+7*Math.PI/180,'Face must pitch gently downward')
  assert.ok(neckExtension()<neck-.08,'Head joint still compensates with excessive extension')
 }finally{riding.airborne.minimumKneeBend=saved.knee;riding.airborne.torsoExtension=saved.extension;riding.headPitch=saved.head;riding.clavicleRelax=saved.clavicle;v.dispose()}
})

test('Cyclone hands rest inside cover bounds across riding, jump and hover without pulling the torso toward handlebars',async()=>{
 const {f,v}=await fixture(),mesh=v.skins[0].mesh
 try{
  for(const patch of [{airborne:false,riderStand:0,boostBlend:0},{airborne:true,riderStand:1,boostBlend:0},{airborne:true,riderStand:.65,boostBlend:1}]){
   Object.assign(f.s,{speed:18,idleBlend:0,parked:false,...patch});f.step(100);v.apply(f.runtime)
   for(const side of ['Left','Right']){
    const cover=v.handCovers[side].box,ids=v.shapes[side].palmIds,palm=new Vector3()
    ids.forEach(id=>palm.add(f.rig.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));palm.divideScalar(ids.length)
    assert.ok(cover.clone().expandByScalar(.005).containsPoint(palm),'Palm remains outside cover: '+side+' '+JSON.stringify(patch))
    assert.ok(bend(f,v,side,false)>25*Math.PI/180,'Lowering hands straightened the elbow')
   }
  }
 }finally{v.dispose()}
})

test('grip reach lowers and retracts both palms with bent elbows while preserving the approved body and legacy rig',async()=>{
 const {f,v}=await fixture(),riding=scottV3Config.riding,saved={grips:riding.handGrips,standard:riding.standard,bend:riding.minimumElbowBend},mesh=v.skins[0].mesh
 const center=ids=>{const p=new Vector3();ids.forEach(id=>p.add(f.rig.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return p.divideScalar(ids.length)}
 const protectedPose=()=>[...v.retarget.bones].filter(([n])=>!/^(Left|Right)(Arm|ForeArm|Hand)/.test(n)).map(([n,b])=>[n,b.matrixWorld.toArray()])
 try{
  for(const patch of [{speed:3,airborne:false,riderStand:0},{speed:18,airborne:false,riderStand:0},{speed:45,airborne:false,riderStand:0},{speed:18,airborne:true,riderStand:1},{speed:18,airborne:true,riderStand:.65,boostBlend:1}]){
   Object.assign(f.s,{idleBlend:0,parked:false,boostBlend:0,...patch});f.step(100)
   riding.handGrips={...saved.grips,wristPitch:0};riding.standard={...saved.standard,minimumElbowBend:30*Math.PI/180};riding.minimumElbowBend=26*Math.PI/180
   v.coverRig=null;v.apply(f.runtime)
   // Reproduce the preceding fairing-top contacts on the same sampled source
   // pose, so this regression isolates arm fitting from gameplay/speed motion.
   for(const [side,cover]of Object.entries(v.handCovers)){cover.position.copy(cover.box.getCenter(new Vector3()));cover.position.x-=(side==='Left'?1:-1)*.018;cover.position.y=cover.box.max.y-.13;cover.position.z=cover.box.min.z+.16}
   v.apply(f.runtime)
   const body=protectedPose(),source=[...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()]),before=Object.fromEntries(['Left','Right'].map(s=>[s,{palm:center(v.shapes[s].palmIds),wrist:v.retarget.bones.get(s+'Hand').getWorldQuaternion(new Quaternion())}]))
   riding.handGrips=saved.grips;riding.standard=saved.standard;riding.minimumElbowBend=saved.bend;v.coverRig=null;v.apply(f.runtime)
   assert.deepEqual(protectedPose(),body,'Hand fitting changed the approved torso, shoulders, pelvis or legs')
   assert.deepEqual([...v.retarget.sourceBones].map(([n,b])=>[n,b.matrixWorld.toArray()]),source,'V1/V2 source pose changed')
   for(const side of ['Left','Right']){
    const previous=before[side].palm,current=center(v.shapes[side].palmIds),grip=new Vector3(...f.authored.data.measuredTargets.grips[side])
    assert.ok(current.y<previous.y-.015,'Palm still rests too high: '+side)
    assert.ok(current.z<previous.z-.05,'Palm still rests too far forward: '+side)
    assert.ok(current.z<grip.z-.025&&current.y<v.handCovers[side].box.max.y-.02,'Palm is perched on the fairing top: '+side)
    assert.ok(current.distanceTo(previous)<.11,'Correction should remain confined to the existing arm pose')
    assert.ok(bend(f,v,side,false)>=39.99*Math.PI/180,'Forearm is still rigid: '+side)
    assert.ok(v.retarget.bones.get(side+'Hand').getWorldQuaternion(new Quaternion()).angleTo(before[side].wrist)>19*Math.PI/180,'Wrist still points flat across the cover')
   }
  }
 }finally{riding.handGrips=saved.grips;riding.standard=saved.standard;riding.minimumElbowBend=saved.bend;v.dispose()}
})
