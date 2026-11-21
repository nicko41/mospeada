import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/forest-alpha/navigation',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
try{
  if(!process.argv.includes('--reuse'))await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'})
  for(let i=0;i<900;i++){if(await c.evaluate(`!!window.__FOREST_FOLIAGE__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader')`))break;await wait(250)}
  const result=await c.evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{forestLodCoverage}=await import('/src/world/forest/forestLod.js'),{forestPathX,forestSurfaceHeight}=await import('/src/world/forest/forestLayout.js'),d=__MOSPEADA__,effect=__ANIME__.effect,controller=d.runtime.cameraController;
    const records=[],frustum=new T.Frustum(),projection=new T.Matrix4(),actual=new Map(),originalUpdate=controller.update,originalDraw=effect.drawSceneTarget,originalRender=effect.render;
    d.runtime.paused=true;let frame=0,enabled=true,rows=[];
    d.scene.traverse(mesh=>{if(!['tree','shrub'].includes(mesh.userData.forestKind))return;const before=mesh.onBeforeRender,range=mesh.material.userData.forestLod,items=[];
      for(let id=0;id<mesh.instanceCount;id++){const matrix=mesh.getMatrixAt(id,new T.Matrix4());items.push({id,origin:new T.Vector3().setFromMatrixPosition(matrix),sphere:mesh.getBoundingSphereAt(0,new T.Sphere()).applyMatrix4(matrix)})}
      const r={mesh,before,range,items,matrix:mesh._matricesTexture.version,geometry:mesh.geometry.uuid,material:mesh.material.uuid};records.push(r);
      mesh.onBeforeRender=function(...args){before.apply(this,args);if(!enabled)return;actual.set(mesh,new Set(Array.from(mesh._indirectTexture.image.data.subarray(0,mesh._multiDrawCount))))};
    });
    controller.update=function(...args){originalUpdate.apply(this,args);if(!enabled)return;const progress=frame<160?frame:320-frame,z=-progress,x=forestPathX(z);d.camera.position.set(x,forestSurfaceHeight(x,z)+3,z);d.camera.lookAt(x+Math.sin(frame*.07)*25,forestSurfaceHeight(x,z)+2,z-45);d.camera.updateMatrixWorld(true)};
    effect.drawSceneTarget=function(...args){actual.clear();return originalDraw.apply(this,args)};
    effect.render=function(...args){originalRender.apply(this,args);if(!enabled)return;frustum.setFromProjectionMatrix(projection.multiplyMatrices(d.camera.projectionMatrix,d.camera.matrixWorldInverse));let expected=0,missing=0,matrixWrites=0,rebuilds=0;const examples=[];
      for(const r of records){for(const p of r.items){const dist=Math.hypot(p.origin.x-d.camera.position.x,p.origin.z-d.camera.position.z);if(forestLodCoverage(dist,r.range)<.001||!frustum.intersectsSphere(p.sphere))continue;expected++;if(!actual.get(r.mesh)?.has(p.id)){missing++;if(examples.length<3)examples.push({name:r.mesh.name,id:p.id,dist})}}if(r.matrix!==r.mesh._matricesTexture.version)matrixWrites++;if(r.geometry!==r.mesh.geometry.uuid||r.material!==r.mesh.material.uuid)rebuilds++}
      rows.push({frame,expected,missing,matrixWrites,rebuilds,examples});frame++;
    };
    await new Promise(resolve=>{function tick(){if(frame>320)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
    enabled=false;controller.update=originalUpdate;effect.drawSceneTarget=originalDraw;effect.render=originalRender;for(const r of records)r.mesh.onBeforeRender=r.before;
    return {frames:rows.length,metres:320,missingFrames:rows.filter(r=>r.missing).length,missing:rows.reduce((n,r)=>n+r.missing,0),matrixWrites:rows.reduce((n,r)=>n+r.matrixWrites,0),rebuilds:rows.reduce((n,r)=>n+r.rebuilds,0),failures:rows.filter(r=>r.missing||r.matrixWrites||r.rebuilds),gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error};
  })()`)
  fs.writeFileSync(dir+'/validation.json',JSON.stringify(result,null,2)+'\n');console.log(result)
  assert.equal(result.missing,0);assert.equal(result.matrixWrites,0);assert.equal(result.rebuilds,0);assert.equal(result.gl,0);assert.equal(result.shader,'')
}finally{c.close()}
