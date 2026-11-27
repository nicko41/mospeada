import test from 'node:test'
import assert from 'node:assert/strict'
import {Matrix4,Vector3} from 'three'
import {v3ArmorFixture} from '../../scripts/scott-v3-armor-fixture.mjs'
import {ScottHitMotion} from './ScottHitMotion.js'
import {ScottDefeatMotion,SCOTT_DEFEAT} from './ScottDefeatMotion.js'
import {resetPlayerCombat} from '../player/playerCombat.js'

const error=(a,b)=>Math.max(...a.elements.map((v,index)=>Math.abs(v-b.elements[index])))
function prepare(f){const a=f.controller.state;Object.assign(a,{mode:'ARMOR_GROUND',height:.025,y:-a.soleOffset+.025,grounded:true,speed:0,vx:0,vz:0,vy:0});f.controller.sync();f.tick()}
function feet(f){const mesh=f.visual.skins[0].mesh,p=new Vector3();return Object.fromEntries(['Left','Right'].map(side=>[side,Math.min(...f.visual.shapes[side].soleIds.map(id=>mesh.localToWorld(mesh.getVertexPosition(id,p)).y))]))}
function present(f,motion){
  f.visual.restoreAttachments();f.articulation.restore();motion.apply(0,()=>0);f.wrapper.updateMatrixWorld(true);f.articulation.apply(f.controller,f.entry,0);motion.groundArmor(f.articulation)
  for(const binding of f.articulation.suspensionBindings)assert.ok(error(binding.mesh.matrixWorld,new Matrix4().multiplyMatrices(binding.bone.matrixWorld,binding.inBone))<1e-7,'Every folded fork part follows its actual forearm')
  f.visual.apply(f.runtime);f.visual.fitArmor(f.runtime)
}

test('Armor fall keeps both folded fork assemblies attached, plants native V3 soles and restores the canonical standing assembly',async()=>{
  resetPlayerCombat();const f=await v3ArmorFixture()
  try{
    prepare(f)
    const parts=f.suspension.parts,geometry=parts.map(part=>part.mesh.geometry),visible=parts.map(part=>part.mesh.visible)
    const canonical=parts.map(part=>part.mesh.matrixWorld.clone()),clip=f.instance.sourceClips.find(clip=>clip.name===SCOTT_DEFEAT.source),tracks=clip.tracks.map(track=>Array.from(track.values))
    const motion=f.instance.hitMotion=new ScottHitMotion(f.instance,f.wrapper,f.runtime,()=>0)
    motion.apply(0,()=>0);motion.startHit('scout-claw',()=>0);motion.age=.55;f.runtime.paused=true
    present(f,motion)
    assert.equal(motion.knockedDown,true);assert.equal(motion.diagnostics.sourceTime,SCOTT_DEFEAT.armorDownTime)
    assert.equal(f.articulation.suspensionBindings.length,26)
    for(const gap of Object.values(feet(f)))assert.ok(gap>=-.01&&gap<.075,'A native boot remains too far from the ground: '+gap)
    for(let index=0;index<parts.length;index++){assert.equal(parts[index].mesh.geometry,geometry[index]);assert.equal(parts[index].mesh.visible,visible[index])}
    const positions=parts.map(part=>part.mesh.matrixWorld.clone());f.tick();present(f,motion)
    parts.forEach((part,index)=>assert.ok(error(part.mesh.matrixWorld,positions[index])<1e-6,'Paused poses must not accumulate attachment offsets'))
    motion.reset();f.runtime.paused=false;f.tick()
    parts.forEach((part,index)=>assert.ok(error(part.mesh.matrixWorld,canonical[index])<1e-6,'Recovery restores the original attached pose'))
    assert.deepEqual(clip.tracks.map(track=>Array.from(track.values)),tracks,'Source animation data stays unchanged')
  }finally{f.visual.dispose();resetPlayerCombat()}
})

test('fatal Armor defeat reuses the same supported native recovery frame',async()=>{
  resetPlayerCombat();const f=await v3ArmorFixture()
  try{
    prepare(f)
    const motion=f.instance.defeatMotion=new ScottDefeatMotion(f.instance,f.wrapper,f.runtime)
    motion.apply(0,()=>0);motion.restore();f.tick();motion.age=SCOTT_DEFEAT.fallSeconds;motion.offsetY=-4
    present(f,motion)
    assert.equal(motion.contact,true)
    for(const gap of Object.values(feet(f)))assert.ok(gap>=-.01&&gap<.075,'Defeated Armor soles should share the ground support: '+gap)
    motion.reset();assert.equal(f.runtime.defeat,null)
  }finally{f.visual.dispose();resetPlayerCombat()}
})
