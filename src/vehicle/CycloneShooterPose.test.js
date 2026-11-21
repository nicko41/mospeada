import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Scene,Group,AnimationMixer,Vector3,Quaternion} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {createRelaxedScottHands} from './relaxedScottHands.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {updateScottGameplay} from './scottGameplay.js'
import {CycloneShooterPose} from './CycloneShooterPose.js'
import {MarsGallant,GALLANT_MOUNT} from './MarsGallant.js'
import {ArmorGallantPose} from './ArmorGallantPose.js'
import {ArmorController} from './ArmorController.js'
import {ArmorArmMotion} from './ArmorArmMotion.js'

test('aim extends the original right arm/hand while the left grip remains fixed, then restores both hands for maneuvers',async()=>{
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
  const load=async path=>{const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
  const [bike,asset,gallant]=await Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('assets/scott-bernard-animated.glb'),load('public/models/mospeada/mars-gallant.glb')]),data=JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))
  const rig=createDrivingCyclone(bike.scene),scene=new Scene(),wrapper=new Group(),model=clone(asset.scene),bones=new Map(),skins=[]
  wrapper.add(model);scene.add(rig.root,wrapper);model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
  const hands=skins.map(({mesh})=>createRelaxedScottHands(mesh)).filter(Boolean),instance={model,sourceScene:asset.scene,bones,skins,hands,mixer:new AnimationMixer(model),clip:null},runtime={state:createBikeState({x:0,z:0,yaw:0},rig.metrics,()=>0),vehicleRig:rig,scottBikeBody:rig.body,paused:false},clips=[...asset.animations,...parseCycloneScottActions(data)]
  runtime.state.speed=14;runtime.state.idleBlend=0
  const step=()=>{rig.update(runtime.state,()=>0,bikeConfig);updateScottGameplay(instance,{data},clips,runtime,wrapper,1/60)}
  for(let i=0;i<30;i++)step()
  const left=instance.mountedMotion.limbs.find(l=>!l.leg&&l.side==='Left'),right=instance.mountedMotion.limbs.find(l=>!l.leg&&l.side==='Right'),leftQ=[left.a,left.b,left.c].map(b=>b.quaternion.clone()),rightQ=[right.a,right.b,right.c].map(b=>b.quaternion.clone()),point=new Vector3(4,2.3,22)
  instance.shooterPose=new CycloneShooterPose(instance)
  for(let i=0;i<60;i++){step();[left.a,left.b,left.c].forEach((b,n)=>leftQ[n].copy(b.quaternion));instance.shooterPose.apply(point,true,1/60)}
  const finger=instance.shooterPose.fingerAxis.clone().applyQuaternion(right.c.getWorldQuaternion(new Quaternion())),direction=point.clone().sub(right.a.getWorldPosition(new Vector3())).normalize()
  assert.ok(finger.dot(direction)>.995);assert.ok(right.a.quaternion.angleTo(rightQ[0])>.2)
  for(const [i,b]of [left.a,left.b,left.c].entries())assert.deepEqual(b.quaternion.toArray(),leftQ[i].toArray(),'Left grip is unchanged')
  assert.ok(skins[0].mesh.morphTargetInfluences[2]>.99)
  for(let i=0;i<30;i++){step();[right.a,right.b,right.c].forEach((b,n)=>rightQ[n].copy(b.quaternion));instance.shooterPose.apply(point,false,1/60)}
  for(const [i,b]of [right.a,right.b,right.c].entries())assert.ok(b.quaternion.angleTo(rightQ[i])<.001,'Right arm returns to existing mounted pose')
  instance.shooterPose.restore();assert.equal(skins[0].mesh.morphTargetInfluences[2],0)
  const weapon=new MarsGallant(gallant.scene),encounter={active:true,aimPoint:point}
  for(let i=0;i<60;i++){step();instance.shooterPose.apply(point,true,1/60,true);weapon.update(instance,encounter,runtime.state)}
  assert.equal(weapon.root.parent,right.c);assert.equal(weapon.root.visible,true);assert.equal(skins[0].mesh.morphTargetInfluences[2],0,'The Gallant uses the closed glove instead of the pointing hand')
  assert.ok(right.c.quaternion.angleTo(instance.shooterPose.neutralHand)<1e-5,'Wrist stays neutral relative to the forearm')
  assert.ok(instance.shooterPose.thumbAxis.clone().applyQuaternion(right.c.getWorldQuaternion(new Quaternion())).y>.9,'Forearm supination brings the thumb and grip upright')
  const barrel=new Vector3(-1,0,0).applyQuaternion(weapon.root.getWorldQuaternion(new Quaternion()))
  assert.ok(barrel.dot(direction)>.995,'Barrel follows the aim direction')
  assert.ok(weapon.root.localToWorld(new Vector3(...GALLANT_MOUNT.grip)).distanceTo(right.c.localToWorld(weapon.palm.clone()))<1e-7,'Grip remains in the measured palm')
  assert.ok(weapon.getMuzzle(new Vector3()).distanceTo(right.c.getWorldPosition(new Vector3()))>.15,'Shot origin is at the barrel, beyond the hand')
  for(let i=0;i<30;i++){step();instance.shooterPose.apply(point,false,1/60,true);weapon.update(instance,encounter,runtime.state)}
  assert.equal(weapon.root.visible,false,'Weapon clears both handlebar grips during maneuvers')
  encounter.active=false;weapon.update(instance,encounter,runtime.state);assert.equal(weapon.root.visible,false)
  // The same weapon/IK must also sit above native free Armor locomotion,
  // preserving the left arm, lower body and the original hand/forearm frame.
  instance.shooterPose.restore();instance.shooterPose.blend=0
  runtime.transformEntry={phase:'complete',poseBlend:1,actorOffset:new Vector3(),actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}}
  instance.sourceClips=asset.animations
  runtime.scottInstance=instance
  const armor=runtime.armorController=new ArmorController(runtime,rig,()=>0,()=>true)
  assert.ok(armor.activate());armor.state.mode='ARMOR_GROUND';armor.state.yaw=0
  const combatPose=instance.armorGallantPose=new ArmorGallantPose(instance)
  for(let i=0;i<60;i++){
    armor.update({forward:1,yaw:0},1/60);step()
    const untouched=[left.a,left.b,left.c,...instance.mountedMotion.limbs.filter(l=>l.leg).flatMap(l=>[l.a,l.b,l.c])].map(b=>({b,q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()}))
    const control=JSON.stringify(armor.state)
    combatPose.applyArmor(point,true,armor.state,1/60);weapon.present(instance,true,null)
    assert.equal(JSON.stringify(armor.state),control,'Aiming never writes physics/control state')
    for(const r of untouched){assert.deepEqual(r.b.quaternion.toArray(),r.q.toArray());assert.deepEqual(r.b.position.toArray(),r.p.toArray());assert.deepEqual(r.b.scale.toArray(),r.s.toArray())}
  }
  assert.ok(armor.state.speed>2,'Walking remains controlled while aiming')
  assert.ok(combatPose.aimBlend>.99);assert.ok(right.c.quaternion.angleTo(combatPose.neutralHand)<1e-5)
  assert.equal(weapon.root.visible,true);assert.equal(weapon.root.parent,right.c)
  const aimedBarrel=new Vector3(-1,0,0).applyQuaternion(weapon.root.getWorldQuaternion(new Quaternion())).normalize()
  assert.ok(aimedBarrel.dot(combatPose.point.clone().sub(weapon.getMuzzle(new Vector3())).normalize())>.995,'Armor aims by turning the arm, with the barrel still fixed to the hand')
  for(let i=0;i<60;i++){step();combatPose.applyArmor(point,false,armor.state,1/60);weapon.present(instance,true,null)}
  assert.ok(combatPose.aimBlend<.001);assert.equal(weapon.root.visible,true,'Gallant remains held, lowered at rest')
  assert.deepEqual(weapon.root.quaternion.toArray(),weapon.rotation.toArray(),'Armor gun stays in the glove bind frame, including after lowering it')
  const restingFinger=combatPose.fingerAxis.clone().applyQuaternion(right.c.getWorldQuaternion(new Quaternion())).normalize()
  const restingBarrel=new Vector3(-1,0,0).applyQuaternion(weapon.root.getWorldQuaternion(new Quaternion())).normalize()
  assert.ok(restingFinger.dot(restingBarrel)>.99999,'Barrel follows the actual relaxed hand rather than an independent target')
  assert.ok(weapon.root.localToWorld(new Vector3(...GALLANT_MOUNT.grip)).distanceTo(right.c.localToWorld(weapon.palm.clone()))<1e-7,'Grip stays in the palm after the aim-to-rest transition')
  step()
  const nativeRest=[right.a,right.b,right.c,...combatPose.spines].map(b=>({b,q:b.quaternion.toArray()}))
  combatPose.applyArmor(point,false,armor.state,1/60)
  for(const r of nativeRest)assert.deepEqual(r.b.quaternion.toArray(),r.q,'Rest retains the exact pre-weapon Armor pose')
  instance.armorArms=new ArmorArmMotion(instance)
  for(const maneuver of [
    {...armor.state,jump:{phase:'fall',launched:true},vy:-4,height:2},
    {...armor.state,diveBlend:1},
    {...armor.state,groundLanding:{phase:'impact'}},
  ]){
    for(let frame=0;frame<30;frame++){
      step();instance.armorArms.apply({active:true,state:maneuver},{bank:0},1/60,false)
      const native=[right.a,right.b,right.c,...combatPose.spines].map(b=>({b,q:b.quaternion.toArray()}))
      combatPose.applyArmor(point,true,maneuver,1/60)
      for(const r of native)assert.deepEqual(r.b.quaternion.toArray(),r.q,'Jump/Ctrl descent/landing must preserve the native animated arm, even while aim is held')
      assert.equal(combatPose.aimBlend,0)
    }
  }
  step();const originalRight=[right.a,right.b,right.c].map(b=>b.quaternion.clone())
  combatPose.applyArmor(point,true,armor.state,1/60,1,1);combatPose.reset()
  for(const [n,b]of [right.a,right.b,right.c].entries())assert.ok(b.quaternion.angleTo(originalRight[n])<1e-7,'Recoil/hurt layers restore without a persistent pose lock')
  armor.deactivate();runtime.transformEntry.phase='idle';step();weapon.update(instance,encounter,runtime.state)
  assert.equal(weapon.root.visible,false,'No Armor weapon pose leaks into riding/transformation')
  weapon.dispose();assert.equal(weapon.root.parent,null)
  hands.forEach(h=>h.dispose())
})
