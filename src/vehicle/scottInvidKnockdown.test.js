import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Group,Quaternion,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ScottHitMotion,SCOTT_HIT} from './ScottHitMotion.js'
import {signalInvidContact} from './invidBodyCollision.js'
import {playerCombat,resetPlayerCombat} from '../player/playerCombat.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
async function fixture(armor){
  const b=fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb'),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')
  const bones=new Map(),skins=[],wrapper=new Group();wrapper.add(asset.scene)
  asset.scene.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh)skins.push({mesh:n})})
  const instance={model:asset.scene,sourceScene:asset.scene,bones,skins,sourceClips:asset.animations}
  const state={x:0,z:0,height:0,yaw:0,speed:12,riderMode:'mounted'},a={x:0,z:0,y:0,height:0,mode:'ARMOR_HOVER',vx:10,vz:2,vy:0}
  const runtime={state,armorController:{active:armor,state:a},gallant:{aimLock:{clear(){}}}},motion=new ScottHitMotion(instance,wrapper,runtime)
  instance.hitMotion=motion;runtime.scottInstance=instance;motion.apply(0,()=>0)
  return{motion,runtime,wrapper,bones,a}
}
test('body collision forces a recoverable native back fall without damaging Scott, respects pause, and restores Armor controls',async()=>{
  resetPlayerCombat();const {motion,runtime,wrapper,bones,a}=await fixture(true),health=playerCombat.playerHealth,hitVersion=playerCombat.hitVersion
  const geometries=motion.skins.map(r=>r.mesh.geometry),front=bones.get('mixamorigSpine2').getWorldQuaternion(new Quaternion()).invert()
  signalInvidContact(runtime,{position:new Vector3(0,0,2)});motion.apply(1/60,()=>0)
  assert.equal(motion.knockedDown,true);assert.equal(a.knockedDown,true);assert.equal(a.vx,0);assert.equal(a.mode,'ARMOR_GROUND')
  for(let i=0;i<33;i++){motion.restore();motion.apply(1/60,()=>0)}
  assert.equal(motion.diagnostics.phase,'down')
  const facing=new Vector3(0,0,1).applyQuaternion(bones.get('mixamorigSpine2').getWorldQuaternion(new Quaternion()).multiply(front))
  assert.ok(facing.y>.7,'Native fall lies on the back')
  runtime.paused=true;const age=motion.age,position=wrapper.position.clone();motion.restore();motion.apply(.1,()=>0);assert.equal(motion.age,age);assert.ok(wrapper.position.distanceTo(position)<1e-6)
  runtime.paused=false;for(let i=0;i<140;i++){motion.restore();motion.apply(1/60,()=>0)}
  assert.equal(motion.knockedDown,false);assert.equal(a.knockedDown,false);assert.equal(a.mode,'ARMOR_HOVER')
  assert.equal(playerCombat.playerHealth,health);assert.equal(playerCombat.hitVersion,hitVersion);assert.deepEqual(motion.skins.map(r=>r.mesh.geometry),geometries)
  motion.reset();assert.equal(motion.cooldown,0)
})
test('a Cyclone body collision stops boost and uses a nonfatal on-foot fall; reset clears it',async()=>{
  resetPlayerCombat();const {motion,runtime}=await fixture(false)
  signalInvidContact(runtime,{position:new Vector3(0,0,2)});motion.apply(1/60,()=>0)
  assert.equal(motion.knockedDown,true);assert.equal(runtime.state.riderMode,'onFoot');assert.equal(runtime.state.speed,0);assert.equal(runtime.state.boostTime,0)
  assert.equal(playerCombat.dead,false)
  const version=runtime.invidContact.version;runtime.invidContactCooldown=0;signalInvidContact(runtime,{position:new Vector3()});assert.equal(runtime.invidContact.version,version)
  for(let i=0;i<150;i++){motion.restore();motion.apply(1/60,()=>0)}
  assert.equal(motion.knockedDown,false);assert.equal(runtime.state.riderMode,'onFoot')
  resetPlayerCombat();motion.restore();motion.apply(0,()=>0);assert.equal(motion.age,Infinity);assert.equal(motion.cooldown,0)
  assert.ok(SCOTT_HIT.knockdownCooldown>SCOTT_HIT.fall+SCOTT_HIT.getUp)
})
