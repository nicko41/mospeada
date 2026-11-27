import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {AnimationMixer,Group,Mesh,BoxGeometry,MeshBasicMaterial,Quaternion,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {readGlb} from '../../scripts/glb-data.mjs'
import {ridingFixture} from '../../scripts/scott-v2-riding-fixture.mjs'
import {ScottNativeRetarget} from './ScottNativeRetarget.js'
import {ScottModelComparison} from './ScottModelComparison.js'
import {ScottV3Visual} from './ScottV3Visual.js'
import {ScottSoilLayer} from './ScottSoilLayer.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {v3ArmorFixture} from '../../scripts/scott-v3-armor-fixture.mjs'
import {MarsGallant} from './MarsGallant.js'
import {ScottDefeatMotion} from './ScottDefeatMotion.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const load=async path=>{const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all(['public/models/mospeada/scott-bernard-animated-original.glb','public/models/mospeada/scott-gear-v3-animated.glb'].map(load))

test('V3 leaves the bike contacts during defeat and preserves the open native fallen pose',async()=>{
 const [,asset]=await assets,f=await ridingFixture(),visual=new ScottV3Visual(f.instance,asset.scene)
 f.runtime.scottData=f.authored.data;f.step(2);visual.apply(f.runtime)
 const fall=f.instance.defeatMotion=new ScottDefeatMotion(f.instance,f.wrapper,f.runtime)
 f.runtime.canyonFall={floorAt:()=>0}
 try{
  for(let i=0;i<240;i++){f.step(1);fall.apply(1/60,()=>0);visual.apply(f.runtime)}
  assert.equal(f.instance.clip,'Cyclone_RidingPose','Mounted source clip remains selected after fatal fall')
  assert.equal(visual.diagnostics.contacts,undefined,'Riding IK must not overwrite the fallen arms and legs')
  const point=name=>visual.retarget.bones.get(name).getWorldPosition(new Vector3())
  assert.ok(point('LeftHand').distanceTo(point('RightHand'))>1,'Both native V3 arms remain open')
  assert.ok(point('LeftFoot').distanceTo(point('RightFoot'))>.5,'Both native V3 legs remain open')
  assert.ok(Math.abs(point('Head').y-point('Hips').y)<.15,'The native V3 body lies flat')
 }finally{fall.reset();visual.dispose()}
})

test('V3 artifact preserves every original byte of native geometry, skinning and textures, with all game clips added',()=>{
 const source=readGlb('assets/01-SCOTT/scott-gear-v3.glb'),result=readGlb('assets/01-SCOTT/scott-gear-v3-animated.glb')
 assert.ok(result.bin.subarray(0,source.bin.length).equals(source.bin))
 for(const key of ['nodes','skins','meshes','materials','textures','images','samplers'])assert.deepEqual(result.doc[key],source.doc[key],key)
 for(const key of ['accessors','bufferViews'])assert.deepEqual(result.doc[key].slice(0,source.doc[key].length),source.doc[key],key)
 assert.equal(result.doc.skins[0].joints.length,28)
 assert.equal(result.doc.accessors[result.doc.meshes[0].primitives[0].indices].count/3,198571)
 assert.deepEqual(fs.readFileSync('public/models/mospeada/scott-gear-v3-animated.glb'),result.bytes)
 for(const animation of result.doc.animations.filter(a=>!a.name.startsWith('Meshy_')))for(const c of animation.channels)assert.ok(c.target.path==='rotation'||c.target.path==='translation'&&result.doc.nodes[c.target.node].name.endsWith('Hips'))
})

test('baked retarget and runtime retarget agree in a translated, rotated and scaled actor frame',async()=>{
 const [original,v3]=await assets,source=clone(original.scene),target=clone(v3.scene),baked=clone(v3.scene),parent=new Group()
 parent.position.set(7,2,-11);parent.rotation.y=.73;parent.scale.setScalar(1.2607598654);parent.add(source,target,baked)
 // Calibrate receiver before it enters the actor frame, as in the game.
 parent.remove(target);const r=new ScottNativeRetarget(source,target,original.scene);parent.add(target)
 const mixer=new AnimationMixer(source),nativeMixer=new AnimationMixer(baked),authored=parseCycloneScottActions(JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json')))
 for(const clip of [...original.animations,...authored]){
  const transferred=v3.animations.find(c=>c.name===clip.name);assert.ok(transferred,clip.name)
  const a=mixer.clipAction(clip).play(),b=nativeMixer.clipAction(transferred).play();a.paused=b.paused=true
  // Pick an actual baked key: this checks bind axes and the cm/metre boundary.
  const time=transferred.tracks[0].times[Math.floor(transferred.tracks[0].times.length*.37)];a.time=b.time=time;mixer.update(0);nativeMixer.update(0);r.apply();baked.updateWorldMatrix(true,true)
  for(const record of r.records){const other=baked.getObjectByName(record.b.name);assert.ok(record.b.quaternion.clone().normalize().angleTo(other.quaternion.clone().normalize())<.0002,clip.name+' '+record.name);if(record.name!=='Hips')assert.deepEqual(record.b.position.toArray(),record.p.toArray());assert.deepEqual(record.b.scale.toArray(),record.s.toArray())}
  mixer.stopAllAction();nativeMixer.stopAllAction()
 }
})

test('native V3 keeps a relaxed riding silhouette through dynamics without changing geometry, joint lengths or weights',async()=>{
 const [,asset]=await assets,f=await ridingFixture(),v3=new ScottV3Visual(f.instance,asset.scene)
 f.runtime.scottData=f.authored.data
 const mesh=v3.skins[0].mesh,g=mesh.geometry,positions=g.attributes.position.array.slice(),weights=g.attributes.skinWeight.array.slice(),rest=v3.retarget.records.map(r=>({r,p:r.b.position.clone(),s:r.b.scale.clone()}))
 try{
  for(const patch of [{speed:0,idleBlend:1,parked:true},{speed:18,idleBlend:0,parked:false},{boostBlend:1},{boostBlend:0,brakeBlend:1},{brakeBlend:0,wheelieAngle:.4}]){
   Object.assign(f.s,patch);f.step(60);v3.apply(f.runtime)
   for(const [name,error]of Object.entries(v3.diagnostics.contacts))assert.ok(error<.002,name+' '+JSON.stringify(patch)+' '+error)
   for(const side of ['Left','Right']){
    const palm=new Vector3(),p=new Vector3(),ids=v3.shapes[side].palmIds;ids.forEach(id=>palm.add(mesh.localToWorld(mesh.getVertexPosition(id,p))));palm.divideScalar(ids.length)
    const grip=f.rig.body.localToWorld(new Vector3(...f.authored.data.measuredTargets.grips[side]));assert.ok(palm.distanceTo(grip)<.20,'Native palm moves too far from the cockpit: '+side)
    const a=v3.retarget.bones.get(side+'Arm').getWorldPosition(new Vector3()),b=v3.retarget.bones.get(side+'ForeArm').getWorldPosition(new Vector3()),c=v3.retarget.bones.get(side+'Hand').getWorldPosition(new Vector3())
    assert.ok(b.clone().sub(a).angleTo(c.sub(b))>20*Math.PI/180,'Arm is forced straight to reach the grip: '+side)
    const cover=v3.handCovers[side].box,localPalm=f.rig.body.worldToLocal(palm.clone())
    assert.ok(localPalm.x>=cover.min.x&&localPalm.x<=cover.max.x&&localPalm.z>=cover.min.z&&localPalm.z<=cover.max.z,'Palm must stay inside its cover')
   }
   for(const {r,p,s}of rest){if(r.name!=='Hips')assert.ok(r.b.position.distanceTo(p)<1e-12);assert.ok(r.b.scale.distanceTo(s)<1e-12)}
  }
  assert.deepEqual(g.attributes.position.array,positions);assert.deepEqual(g.attributes.skinWeight.array,weights)
  // The animation panel can preview Air Squat while the bike state is mounted.
  // Native clip playback must not be overwritten by the riding contact layer.
  f.instance.clip='air_squat';v3.apply(f.runtime);assert.equal(v3.diagnostics.contacts,undefined)
 }finally{v3.dispose()}
})

test('V3 riding torso and chest stay independent of cover hand fitting',async()=>{
 const [,asset]=await assets,f=await ridingFixture(),visual=new ScottV3Visual(f.instance,asset.scene)
 f.runtime.scottData=structuredClone(f.authored.data);Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);visual.apply(f.runtime)
 const names=['Hips','Spine','Spine1','Spine2','Neck','Head'],before=names.map(name=>visual.retarget.bones.get(name).matrixWorld.clone()),chestLocals=['Spine1','Spine2'].map(name=>visual.retarget.bones.get(name).quaternion.clone()),firstGaps={...visual.diagnostics.handGripGap}
 // Move the cockpit targets after the source pose has been sampled. Only the
 // receiver's arm chains may respond; silhouette and chest volume stay fixed.
 for(const cover of Object.values(visual.handCovers)){cover.position.y-=.15;cover.position.z+=.25}
 visual.apply(f.runtime)
 names.forEach((name,i)=>{const matrix=visual.retarget.bones.get(name).matrixWorld;assert.ok(matrix.elements.every((value,k)=>Math.abs(value-before[i].elements[k])<1e-10),'Grip fitting moved the torso: '+name)})
 assert.ok(visual.diagnostics.handGripGap.Left>firstGaps.Left+.1)
 visual.retarget.apply()
 for(const [i,name]of ['Spine1','Spine2'].entries())assert.ok(visual.retarget.bones.get(name).quaternion.angleTo(chestLocals[i])<1e-7,'Chest joints changed for riding reach')
 visual.dispose()
})

test('V1/V2/V3 selection keeps native skeleton independent, shares the Scott soil cap, and restores equipment rigidly',async()=>{
 const [v1,v3Asset]=await assets,f=await ridingFixture()
 for(const skin of f.skins){skin.original=skin.mesh.material;skin.clean=skin.original.clone()}
 const comparison=new ScottModelComparison(f.instance,{v1:v1.scene,v2:f.instance.model,v3:v3Asset.scene},'v2')
 f.instance.modelComparison=comparison;f.runtime.scottData=f.authored.data
 let soil
 try{
  const sourceSkeleton=f.skins[0].mesh.skeleton,native=comparison.v3.skins[0].mesh.skeleton
  assert.notEqual(native,sourceSkeleton);assert.equal(native.bones.length,28);assert.equal(f.instance.skins.length,1)
  soil=new ScottSoilLayer(f.instance);assert.equal(soil.records.length,3)
  assert.equal(soil.records[0].uniforms.uScottMud,soil.records[2].uniforms.uScottMud)
  for(const variant of ['v3','v1','v2','v3']){comparison.select(variant);assert.deepEqual(comparison.skins.filter(s=>s.mesh.visible).map(s=>s.variant),[variant]);assert.equal(f.skins[0].mesh.skeleton,sourceSkeleton)}
  f.step(3);comparison.v3.apply(f.runtime)
  const equipment=new Mesh(new BoxGeometry(.2,.3,.1),new MeshBasicMaterial());f.wrapper.add(equipment);equipment.position.set(.3,.7,.1);equipment.rotation.set(.2,.3,.4);f.wrapper.updateMatrixWorld(true)
  const before=equipment.matrix.clone(),world=equipment.matrixWorld.clone(),scale=new Vector3();world.decompose(new Vector3(),new Quaternion(),scale)
  comparison.v3.moveEquipment(equipment,'RightForeArm');const movedScale=new Vector3();equipment.matrixWorld.decompose(new Vector3(),new Quaternion(),movedScale);assert.ok(movedScale.distanceTo(scale)<1e-10)
  comparison.v3.restoreAttachments();assert.deepEqual(equipment.matrix.elements,before.elements);assert.equal(equipment.matrixAutoUpdate,true)
  equipment.geometry.dispose();equipment.material.dispose();equipment.removeFromParent()
 }finally{soil?.dispose();comparison.dispose()}
})

test('V3 Armor confines length fitting to caballers and restores the V2 assembly on selection',async()=>{
 const f=await v3ArmorFixture(),records=f.articulation.records,geometry=records.map(r=>r.mesh.geometry),indices=records.map(r=>r.mesh.geometry?.index?.array.slice())
 for(const patch of [{speed:0},{speed:3,mode:'ARMOR_GROUND'},{speed:12,mode:'ARMOR_HOVER',boosting:true}]){
  Object.assign(f.controller.state,patch);f.tick()
  assert.ok(f.articulation.diagnostics.legs.every(l=>l.lengthScale===1))
  for(const r of records){assert.ok(r.mesh.matrixWorld.elements.every(Number.isFinite));if(f.articulation.bindings.some(b=>b.mesh===r.mesh))continue;const current=new Vector3(),canonical=new Vector3();r.mesh.matrixWorld.decompose(new Vector3(),new Quaternion(),current);r.mesh.parent.matrixWorld.clone().multiply(r.canonical).decompose(new Vector3(),new Quaternion(),canonical);assert.ok(current.distanceTo(canonical)<1e-6,'Unrelated equipment was scaled: '+r.mesh.name)}
 }
 f.visual.restoreAttachments();f.instance.modelComparison.variant='v2';f.tick()
 for(let i=0;i<records.length;i++){assert.equal(records[i].mesh.geometry,geometry[i]);if(indices[i])assert.deepEqual(records[i].mesh.geometry.index.array,indices[i])}
 // The legacy attachment algorithm becomes active again on the same instance.
 assert.ok(f.articulation.diagnostics.legs.some(l=>Math.abs(l.lengthScale-1)>.001))
 f.visual.dispose()
})

test('Gallant follows the native V3 hand without changing muzzle scale or accumulating mount offsets',async()=>{
 const [,asset]=await assets,f=await ridingFixture(),visual=new ScottV3Visual(f.instance,asset.scene),weapon=new MarsGallant(new Group())
 f.instance.modelComparison={variant:'v3',v3:visual};f.runtime.scottData=f.authored.data;f.step(4);visual.apply(f.runtime)
 weapon.present(f.instance,true,null,1,true);assert.equal(weapon.root.visible,true)
 const first=weapon.root.matrixWorld.clone(),muzzle=weapon.getMuzzle(new Vector3())
 for(let i=0;i<10;i++){weapon.present(f.instance,true,null,1,true);assert.ok(weapon.getMuzzle(new Vector3()).distanceTo(muzzle)<1e-8)}
 f.instance.modelComparison.variant='v2';weapon.present(f.instance,true,null,1,true)
 const scale=new Vector3(),nativeScale=new Vector3();first.decompose(new Vector3(),new Quaternion(),nativeScale);weapon.root.matrixWorld.decompose(new Vector3(),new Quaternion(),scale);assert.ok(scale.distanceTo(nativeScale)<1e-7)
 assert.ok(weapon.getMuzzle(new Vector3()).distanceTo(muzzle)>.005)
 weapon.dispose();visual.dispose()
})
