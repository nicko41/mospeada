import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createGroundTurns,advanceGroundTurn} from './armorGroundTurns.js'
import {armorConfig,createArmorState,advanceArmor} from './armorPhysics.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=(async()=>{const b=fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')})()
test('Ground uses the actual left/right Meshy steps; extracted root motion preserves native foot paths without double rotation',async()=>{
  const source=await asset,scale=1.2607598654,profiles=createGroundTurns(source.animations,scale),original=source.animations.map(c=>c.toJSON())
  assert.equal(profiles.size,2)
  for(const profile of profiles.values()){
    const native=clone(source.scene),posed=clone(source.scene),wrapper=new T.Group();wrapper.scale.setScalar(scale);wrapper.add(posed)
    const nativeMixer=new T.AnimationMixer(native),poseMixer=new T.AnimationMixer(posed),nativeClip=source.animations.find(c=>c.name===profile.sourceName),nativeAction=nativeMixer.clipAction(nativeClip).play(),poseAction=poseMixer.clipAction(profile.clip).play()
    nativeAction.time=profile.sourceInterval[0];nativeMixer.update(0);native.updateMatrixWorld(true)
    const root=native.getObjectByName('mixamorigHips'),origin=root.getWorldPosition(new T.Vector3()).multiplyScalar(scale),q=root.quaternion.clone(),yaw0=2*Math.atan2(q.y,q.w),axis=new T.Vector3(0,1,0)
    const a=createArmorState({x:0,z:0,height:0,yaw:0,speed:0});a.mode='ARMOR_GROUND';a.pelvisOffsetX=origin.x;a.pelvisOffsetZ=origin.z
    const support=[]
    for(let i=0;i<Math.ceil(profile.duration*120);i++){
      advanceGroundTurn(a,profile.angle>0?2:-2,true,1/120,()=>true,profiles,armorConfig)
      if(!a.groundTurn)break
      const time=a.groundTurn.time
      nativeAction.time=profile.sourceInterval[0]+time;nativeMixer.update(0);native.updateMatrixWorld(true)
      poseAction.time=time;poseMixer.update(0);wrapper.position.set(a.x,0,a.z);wrapper.rotation.y=a.yaw;wrapper.updateMatrixWorld(true)
      for(const side of ['Left','Right']){
        const expected=native.getObjectByName(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3()).multiplyScalar(scale).sub(origin).applyAxisAngle(axis,-yaw0).add(origin)
        const actual=posed.getObjectByName(`mixamorig${side}Foot`).getWorldPosition(new T.Vector3())
        assert.ok(actual.distanceTo(expected)<.003,`${profile.name}: root extraction cannot create foot sliding: ${actual.distanceTo(expected)}`)
        if(side==='Left')support.push(posed.getObjectByName('mixamorigLeftToeBase').getWorldPosition(new T.Vector3()))
      }
      if(a.groundTurn.finished)break
    }
    assert.ok(Math.abs(a.yaw)>.5);assert.ok(support.at(-1).distanceTo(support[0])<.09,`${profile.name}: original support foot drift ${support.at(-1).distanceTo(support[0])}`)
    nativeMixer.stopAllAction();poseMixer.stopAllAction()
  }
  assert.deepEqual(source.animations.map(c=>c.toJSON()),original)
})

test('idle camera cannot initiate a Ground turn; movement uses a native step and can then walk/run, with no invented gait fallback',async()=>{
  const source=await asset,profiles=createGroundTurns(source.animations,1.2607598654),a=createArmorState({x:0,z:0,height:.025,yaw:0,speed:0});a.mode='ARMOR_GROUND'
  for(let i=0;i<120;i++)advanceArmor(a,{yaw:1.5},1/120,()=>0,undefined,armorConfig,profiles)
  assert.equal(a.yaw,0);assert.equal(a.groundTurn,null)
  advanceArmor(a,{forward:1,yaw:1.5},1/120,()=>0,undefined,armorConfig,profiles)
  assert.equal(a.groundTurn.name,'Armor_Turn_Left');assert.ok(a.groundTurn.time>0)
  for(let i=0;i<180;i++)advanceArmor(a,{forward:1,yaw:1.5},1/120,()=>0,undefined,armorConfig,profiles)
  assert.equal(a.groundTurn,null);assert.ok(a.speed>2&&Math.abs(a.yaw-1.5)<.05)
  const yaw=a.yaw;for(let i=0;i<200;i++)advanceArmor(a,{yaw:-2},1/120,()=>0,undefined,armorConfig,profiles)
  assert.equal(a.yaw,yaw)
})
