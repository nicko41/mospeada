import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,PerspectiveCamera,Object3D} from 'three'
import {AnimeRenderer} from './AnimeRenderer.js'
import {createPreparationTargets,startupRenderReady,canPrepareLighting} from './renderPreparation.js'

test('Forest can finish GPU preparation under its loader without waiting for game-ready',()=>{
  assert.equal(canPrepareLighting(true,false,'loading'),true)
  assert.equal(startupRenderReady({ready:true,nightReady:false},'loading'),false)
  assert.equal(startupRenderReady({ready:true,nightReady:true},'loading'),true)
  assert.equal(canPrepareLighting(true,true,'playing'),false)
  assert.equal(startupRenderReady({ready:true,nightReady:false},'done'),true,'Non-cinematic startup keeps its existing readiness')
  assert.equal(canPrepareLighting(true,false,'done'),false)
  assert.equal(canPrepareLighting(true,true,'done'),true)
  assert.equal(startupRenderReady({error:'Shader error'},'loading'),true,'Errors cannot trap the entry overlay')
})
test('prewarming uses private cameras, existing culling, cached shadows and a nonblocking GPU fence',async()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),original=camera.position.clone(),objects=new Object3D(),views=[new PerspectiveCamera(),new PerspectiveCamera()],distance=[],visibility=[],draws=[]
  objects.updateDistance=view=>distance.push(view);objects.updateVisibility=view=>visibility.push(view);scene.add(objects)
  const shadows={autoUpdate:true,needsUpdate:true},targets=createPreparationTargets(4);let deleted=0,polled=0,yields=0
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,TIMEOUT_EXPIRED:2,isContextLost:()=>false,fenceSync:()=>({}),flush(){},clientWaitSync:()=>++polled===1?2:3,deleteSync(){deleted++}}
  const effect=Object.assign(Object.create(AnimeRenderer.prototype),{scene,camera,renderer:{shadowMap:shadows,getContext:()=>gl},stats:{preparation:{}},preparationTargets:targets,startupViews:()=>views,initialNight:false,sync(){},idleTurn:async()=>{yields++},withPreparationVariant(night,work){assert.equal(night,false);return work()},drawSceneTarget(target){draws.push(this.camera);assert.equal(target,targets.anime);assert.equal(shadows.autoUpdate,false);assert.equal(shadows.needsUpdate,false)}})
  try{
    views[0].position.set(4,3,-2);views[1].position.set(-8,5,6)
    await effect.prepareStartupViews()
    assert.deepEqual(draws,views);assert.equal(effect.camera,camera);assert.ok(camera.position.equals(original));assert.equal(distance.at(-1),camera);assert.equal(visibility.at(-1),camera)
    assert.deepEqual(shadows,{autoUpdate:true,needsUpdate:true});assert.equal(effect.stats.preparation.startupViews,2);assert.equal(deleted,1);assert.ok(yields>=3)
  }finally{targets.dispose()}
})
