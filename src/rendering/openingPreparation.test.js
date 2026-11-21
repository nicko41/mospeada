import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,PerspectiveCamera,Object3D,Group,InstancedMesh,PlaneGeometry,MeshBasicMaterial} from 'three'
import {AnimeRenderer} from './AnimeRenderer.js'
import {createPreparationTargets,startupRenderReady,canPrepareLighting} from './renderPreparation.js'

test('Forest opens after current lighting/views, independently of optional night preparation',()=>{
  assert.equal(canPrepareLighting(true,false,'loading'),false)
  assert.equal(startupRenderReady({ready:true,openingReady:false,nightReady:true},'loading'),false)
  assert.equal(startupRenderReady({ready:true,openingReady:true,nightReady:false},'loading'),true)
  assert.equal(canPrepareLighting(true,true,'playing'),false)
  assert.equal(startupRenderReady({ready:true,nightReady:false},'done'),true,'Non-cinematic startup keeps its existing readiness')
  assert.equal(canPrepareLighting(true,false,'done'),false)
  assert.equal(canPrepareLighting(true,true,'done'),true)
  assert.equal(startupRenderReady({error:'Shader error'},'loading'),true,'Errors cannot trap the entry overlay')
})

test('an unfinished night job cannot hold the opening readiness gate',async()=>{
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{ready:true,stats:{preparation:{}},backgroundWork:new Promise(()=>{}),prepareStartupViews:async()=>{}})
  await effect.prepareOpening()
  assert.equal(effect.openingReady,true)
  assert.equal(startupRenderReady({ready:effect.ready,openingReady:effect.openingReady,nightReady:false},'loading'),true)
  assert.equal(canPrepareLighting(true,true,'lead'),false);assert.equal(canPrepareLighting(true,true,'playing'),false)
  assert.equal(canPrepareLighting(true,true,'done'),true)
})

test('an optional GPU prewarm fence has a deadline and always releases its handle',async()=>{
  let deleted=0
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,TIMEOUT_EXPIRED:2,isContextLost:()=>false,fenceSync:()=>({}),flush(){},clientWaitSync:()=>2,deleteSync(){deleted++}}
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{renderer:{getContext:()=>gl},stats:{preparation:{}},idleTurn:async()=>{throw Error('An expired fence must stop polling')}})
  assert.equal(await effect.waitForPreparedGpu(0),false);assert.equal(deleted,1);assert.equal(effect.stats.preparation.gpuFenceDeferred,true)
})
test('prewarming uses private cameras, existing culling, cached shadows and a nonblocking GPU fence',async()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),original=camera.position.clone(),objects=new Object3D(),views=[new PerspectiveCamera(),new PerspectiveCamera()],distance=[],visibility=[],draws=[]
  objects.updateDistance=view=>distance.push(view);objects.updateVisibility=view=>visibility.push(view);scene.add(objects)
  const shadows={autoUpdate:true,needsUpdate:true},targets=createPreparationTargets(4);let deleted=0,polled=0,yields=0
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,TIMEOUT_EXPIRED:2,isContextLost:()=>false,fenceSync:()=>({}),flush(){},clientWaitSync:()=>++polled===1?2:3,deleteSync(){deleted++}}
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{scene,camera,renderer:{shadowMap:shadows,getContext:()=>gl},stats:{preparation:{}},preparationTargets:targets,startupViews:()=>views,initialNight:false,collect(){},sync(){},idleTurn:async()=>{yields++},withPreparationVariant(night,work){assert.equal(night,false);return work()},drawSceneTarget(target){draws.push(this.camera);assert.equal(target,targets.anime);assert.equal(shadows.autoUpdate,false);assert.equal(shadows.needsUpdate,false)}})
  try{
    views[0].position.set(4,3,-2);views[1].position.set(-8,5,6)
    await effect.prepareStartupViews()
    assert.deepEqual(draws,views);assert.equal(effect.camera,camera);assert.ok(camera.position.equals(original));assert.equal(distance.at(-1),camera);assert.equal(visibility.at(-1),camera)
    assert.deepEqual(shadows,{autoUpdate:true,needsUpdate:true});assert.equal(effect.stats.preparation.startupViews,2);assert.equal(deleted,1);assert.ok(yields>=3)
  }finally{targets.dispose()}
})

test('hidden pooled combat buffers are uploaded during preparation and restored even if a draw fails',()=>{
  const scene=new Scene(),group=new Group(),mesh=new InstancedMesh(new PlaneGeometry(),new MeshBasicMaterial(),4)
  group.userData.prewarmVFX=true;group.visible=false;mesh.count=0;mesh.frustumCulled=true;group.add(mesh);scene.add(group)
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{scene})
  try{
    assert.throws(()=>effect.withDormantArmor(()=>{assert.equal(group.visible,true);assert.equal(mesh.count,1);assert.equal(mesh.frustumCulled,false);throw Error('Draw failed')}),/Draw failed/)
    assert.equal(group.visible,false);assert.equal(mesh.count,0);assert.equal(mesh.frustumCulled,true)
  }finally{mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}
})

test('opaque startup submits the other lighting variant in one batch instead of serialising every material',async()=>{
  const calls=[],effect=Object.assign(Object.create(AnimeRenderer.prototype),{
    ready:true,preparedLighting:new Set([false]),renderer:{info:{programs:[]}},stats:{preparation:{}},collect(){},sync(){},
    idleTurn:async()=>{},compileVariant:async(night,object)=>{calls.push({night,object})},prepareProgramBindings:async()=>{},
    preparationObjects(){throw Error('Startup must not serialise per-object compilation')},primeVariant(){},prepareStartupViews:async()=>{},
  })
  await effect.prepareNight(true)
  assert.deepEqual(calls,[{night:true,object:undefined}]);assert.equal(effect.nightReady,true)
})

test('skipping the opening cannot let night preparation dispose targets still used by opening views',async()=>{
  let finishOpening;const calls=[]
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{
    ready:true,openingWork:new Promise(r=>{finishOpening=r}),preparedLighting:new Set([false]),renderer:{info:{programs:[]}},stats:{preparation:{}},collect(){},sync(){},
    idleTurn:async()=>{},compileVariant:async()=>calls.push('compile'),prepareProgramBindings:async()=>{},primeVariant(){},
  })
  const work=effect.prepareNight(true);await Promise.resolve();assert.deepEqual(calls,[])
  finishOpening();await work;assert.deepEqual(calls,['compile']);assert.equal(effect.nightReady,true)
})
