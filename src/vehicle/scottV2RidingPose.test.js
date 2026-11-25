import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {ridingFixture as fixture,measureRiding} from '../../scripts/scott-v2-riding-fixture.mjs'
import {scottV2RidingConfig as config} from './scottV2RidingConfig.js'
const ridingFixture=options=>fixture({...options,ridingVariant:'previous'})

test('V2 riding seats the pelvis back, opens both elbows and places visible palms/soles on the existing contacts',async()=>{
 const f=await ridingFixture(),baseline=await ridingFixture({fit:false})
 for(const q of[f,baseline]){Object.assign(q.s,{speed:18,idleBlend:0,parked:false});q.step(60)}
 const actual=measureRiding(f),before=measureRiding(baseline),pitch=v=>Math.atan2(-v[1],v[2]),elbow=(q,side)=>{const j=q.joints[side],a=new Vector3(...j.Arm),b=new Vector3(...j.ForeArm),c=new Vector3(...j.Hand);return Math.PI-a.sub(b).angleTo(c.sub(b))}
 assert.ok(actual.hips[1]<before.hips[1]-.04&&actual.hips[2]<before.hips[2]-.01,'Pelvis must lower toward the seat and move toward its rear')
 assert.ok(pitch(actual.chestForward)<pitch(before.chestForward)-.2,'Torso must be visibly less hunched')
 assert.ok(actual.headForward[2]>.995&&Math.abs(actual.headForward[1])<.04)
 const mesh=f.skins[0].mesh;mesh.skeleton.update()
 for(const side of['Left','Right']){
  assert.ok(elbow(actual,side)<elbow(before,side),'Both arms must extend, not fold further')
  const shape=f.instance.v2RidingPose.shapes[side],average=ids=>{const out=new Vector3(),p=new Vector3();ids.forEach(i=>out.add(mesh.localToWorld(mesh.getVertexPosition(i,p))));return out.divideScalar(ids.length)}
  const grip=f.rig.body.localToWorld(new Vector3(...f.authored.data.measuredTargets.grips[side]));assert.ok(average(shape.palmIds).distanceTo(grip)<.004)
  const sole=f.rig.body.worldToLocal(average(shape.soleIds));assert.ok(Math.abs(sole.y-actual.diagnostics.feet[side].stripBottom)<.004)
 }
 const p=mesh.geometry.attributes.position,labels=mesh.geometry.attributes._rigid_owner
 for(const owner of[0,9,10,13,14,17,21,18,22]){
  const ids=[];for(let i=0;i<labels.count;i++)if(labels.getX(i)===owner)ids.push(i)
  const a=ids[0],start=new Vector3().fromBufferAttribute(p,a),b=ids.reduce((best,i)=>new Vector3().fromBufferAttribute(p,i).distanceToSquared(start)>new Vector3().fromBufferAttribute(p,best).distanceToSquared(start)?i:best,a)
  const expected=start.distanceTo(new Vector3().fromBufferAttribute(p,b))*f.authored.data.actorScale,visible=mesh.localToWorld(mesh.getVertexPosition(a,new Vector3())).distanceTo(mesh.localToWorld(mesh.getVertexPosition(b,new Vector3())))
  assert.ok(Math.abs(expected-visible)<2e-5,'Protected rigid armor changed shape: '+owner)
 }
})

test('Upper-body reference leaves the approved pelvis and lower-body contact positions intact',async()=>{
 const f=await ridingFixture(),approved={hips:[.0013143613711501523,.9879405891547921,-.34765426981447684],Left:{UpLeg:[.1025435316574583,.8792864265398064,-.36802528642686183],Leg:[.3171899293838398,.9171717769239045,-.0010795641501989122],Foot:[.4482099947471666,.4471094942664225,-.12267310249764692]},Right:{UpLeg:[-.11091166866437879,.8947435004364297,-.3785146377681637],Leg:[-.3175608240623233,.924318717485261,-.010776494628730272],Foot:[-.46435756325682376,.462199884213554,-.09808663648066668]}}
 Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);const actual=measureRiding(f)
 assert.ok(new Vector3(...actual.hips).distanceTo(new Vector3(...approved.hips))<1e-8)
 for(const side of['Left','Right'])for(const name of['UpLeg','Leg','Foot'])assert.ok(new Vector3(...actual.joints[side][name]).distanceTo(new Vector3(...approved[side][name]))<1e-8,'Approved lower-body joint moved: '+side+name)
 assert.equal(actual.fit.upperBodyReference.clip,'air_squat');assert.equal(actual.fit.upperBodyReference.time,config.upperBodyReference.time)
})

test('Riding and boost keep the chest geometry of the approved air_squat sample without additional folding',async()=>{
 const f=await ridingFixture(),sample=await ridingFixture({fit:false}),clip=sample.scott.asset.animations.find(c=>c.name===config.upperBodyReference.clip),action=sample.instance.mixer.clipAction(clip).reset().play()
 action.time=config.upperBodyReference.time;sample.instance.mixer.update(0);sample.wrapper.updateMatrixWorld(true);sample.skins[0].mesh.skeleton.update()
 const mesh=f.skins[0].mesh,g=mesh.geometry,j=g.attributes.skinIndex,w=g.attributes.skinWeight,other=sample.skins[0].mesh,qualifies=id=>{let weight=0;for(let k=0;k<4;k++)if([1,2,3].includes(j.getComponent(id,k)))weight+=w.getComponent(id,k);return weight>.99999},edges=[]
 for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1);if(qualifies(a)&&qualifies(b)){const length=other.localToWorld(other.getVertexPosition(a,new Vector3())).distanceTo(other.localToWorld(other.getVertexPosition(b,new Vector3())));if(length>.003)edges.push([a,b,length*f.authored.data.actorScale])}}
 assert.ok(edges.length>1000)
 for(const boost of[0,1]){
  Object.assign(f.s,{speed:18,idleBlend:0,parked:false,boostBlend:boost});f.step(60)
  for(const name of['Spine1','Spine2']){const q=f.bones.get('mixamorig'+name).quaternion.toArray(),expected=f.instance.v2RidingPose.upperBody.bones.get(name).q.toArray();q.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10,'Chest joint folded: '+name))}
  for(let i=0;i<edges.length;i+=19){const[a,b,length]=edges[i],actual=mesh.localToWorld(mesh.getVertexPosition(a,new Vector3())).distanceTo(mesh.localToWorld(mesh.getVertexPosition(b,new Vector3())));assert.ok(Math.abs(actual-length)<2e-6,'Sampled chest geometry changed while riding')}
 }
})

test('V2 riding restores all joints and cached contacts before locomotion, aiming and transformation',async()=>{
 const f=await ridingFixture(),baseline=await ridingFixture({fit:false})
 for(const q of[f,baseline]){Object.assign(q.s,{speed:18,idleBlend:0,parked:false});q.step(35)}
 const compare=label=>{for(const[name,b]of f.bones){const other=baseline.bones.get(name);b.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-other.matrixWorld.elements[i])<2e-7,`${label}: leaked riding fit into ${name}`));assert.deepEqual(b.scale.toArray(),other.scale.toArray())}const a=f.instance.mountedMotion.limbs,b=baseline.instance.mountedMotion.limbs;for(let i=0;i<a.length;i++){assert.ok(a[i].target.distanceTo(b[i].target)<1e-7);a[i].orientation.toArray().forEach((v,k)=>assert.ok(Math.abs(v-b[i].orientation.toArray()[k])<1e-9,`${label}: cached limb orientation changed`))}}
 for(const q of[f,baseline])q.runtime.gallant={aiming:true,aimInput:{held:true}};for(const q of[f,baseline])q.step(3);compare('aim')
 for(const q of[f,baseline]){delete q.runtime.gallant;q.runtime.transformEntry={phase:'transforming',poseBlend:.6,returnFlight:false,actorOffset:new Vector3(),actorPose:{arms:.6,legs:.6}};q.step(3)}compare('transform')
 for(const gait of['walk','run']){
  for(const q of[f,baseline]){delete q.runtime.transformEntry;q.s.riderMode='onFoot';q.s.pedestrian={x:0,z:0,ground:0,yaw:0,crouchBlend:0,moving:true,runBlend:gait==='run'?1:0};q.step(30)}compare(gait)
 }
})
