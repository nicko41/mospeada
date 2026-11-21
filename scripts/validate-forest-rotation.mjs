import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), baseline = process.argv.includes('--baseline')
const dir = process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'artifacts/forest-rotation'
fs.mkdirSync(dir, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression, timeout = 240000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await c.evaluate(expression)) return; await wait(150) }
  throw Error(`Timeout: ${expression}`)
}
const audit = JSON.parse(fs.readFileSync('artifacts/forest/asset-audit.json'))
try {
  await c.send('Network.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  if(!process.argv.includes('--reuse'))await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/?environment=forest' })
  await until(`!!window.__MOSPEADA__ && !!window.__ANIME__?.state.snapshot().nightReady && !document.querySelector('#entry-preloader')`)
  await c.evaluate(`(async()=>{const config=window.__FOREST_FOLIAGE__?.config||(await import('/src/world/forest/forestConfig.js')).FOREST;window.__rotationAdaptive=config.performance.adaptiveResolution;config.performance.adaptiveResolution=false;__MOSPEADA__.scene.__r3f.root.getState().setDpr(.66);__MOSPEADA__.runtime.paused=true;return true})()`)
  await wait(1000)
  c.events.length = 0
  // Test-only camera poses run AFTER the actual gameplay camera update. Audit
  // the draws that actually reach WebGL, on the same frame, not after a delay.
  await c.evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{forestLayout,forestSurfaceHeight}=await import('/src/world/forest/forestLayout.js'),{FOREST}=await import('/src/world/forest/forestConfig.js'),{forestBurial}=await import('/src/world/forest/forestPlacement.js');
    const audit=${JSON.stringify(audit.map(({name,min,max})=>({name,min,max})))};
    const d=__MOSPEADA__,effect=__ANIME__.effect,controller=d.runtime.cameraController;
    const state=window.__forestRotation={frame:0,frames:[],angle:0,enabled:false,synthetic:true,audit:true,drawn:new Map(),meshes:[],frustum:new T.Frustum(),projection:new T.Matrix4(),direction:new T.Vector3(),originalUpdate:controller.update,originalRender:effect.render,originalDraw:effect.drawSceneTarget,startPrograms:__ANIME__.renderer.info.programs.length};
    d.scene.traverse(mesh=>{
      if(!mesh.userData.forest||(!mesh.isInstancedMesh&&!mesh.isBatchedMesh))return;
      const spec=audit.find(a=>mesh.name.includes(a.name+'_'));if(!spec)return;
      const definition=mesh.isBatchedMesh?{distance:mesh.distance,minimum:mesh.minimum}:(FOREST.treeDetailDistance&&mesh.name.includes('horizon'))?{distance:FOREST.treeDistance,minimum:FOREST.treeDetailDistance}:
        {distance:spec.name.startsWith('CommonTree')||spec.name.startsWith('TwistedTree')||spec.name.startsWith('Pine')?FOREST.treeDetailDistance:spec.name.startsWith('Bush')?FOREST.shrubDistance:spec.name.startsWith('Rock_Medium')?FOREST.propDistance:FOREST.grassDistance,minimum:0};
      const local=mesh.isBatchedMesh?mesh.getBoundingSphereAt(0,new T.Sphere()):(mesh.geometry.computeBoundingSphere(),mesh.geometry.boundingSphere);
      const object=new T.Object3D(),matrix=new T.Matrix4();
      const expected=(window.__FOREST_FOLIAGE__?.layout||forestLayout)[spec.name].map(p=>{
        const bury=forestBurial(p.kind,{min:{y:spec.min[1]},max:{y:spec.max[1]}},p.scale);
        object.position.set(p.x,forestSurfaceHeight(p.x,p.z)-spec.min[1]*p.scale-bury,p.z);object.rotation.set(0,p.yaw,0);object.scale.setScalar(p.scale);object.updateMatrix();
        return{x:p.x,z:p.z,key:Math.fround(p.x).toFixed(2)+','+Math.fround(p.z).toFixed(2),sphere:local.clone().applyMatrix4(object.matrix)};
      }).filter(p=>Math.hypot(p.x,p.z)<definition.distance+12);
      const record={mesh,expected,...definition,originalBefore:mesh.onBeforeRender,matrixVersion:mesh.isBatchedMesh?mesh._matricesTexture.version:mesh.instanceMatrix.version,geometry:mesh.geometry.uuid,material:mesh.material.uuid};state.meshes.push(record);
      mesh.onBeforeRender=function(...args){record.originalBefore.apply(this,args);if(!state.enabled||!state.audit)return;
        const actual=new Set(),matrix=new T.Matrix4(),n=this.isBatchedMesh?this._multiDrawCount:this.count;
        for(let i=0;i<n;i++){const id=this.isBatchedMesh?this._indirectTexture.image.data[i]:i;this.getMatrixAt(id,matrix);actual.add(matrix.elements[12].toFixed(2)+','+matrix.elements[14].toFixed(2))}
        state.drawn.set(this,actual);
      };
    });
    controller.update=function(...args){state.originalUpdate.apply(this,args);if(state.enabled&&state.synthetic){const p=d.camera.position;d.camera.lookAt(p.x+Math.sin(state.angle)*50,p.y-4,p.z-Math.cos(state.angle)*50);d.camera.updateMatrixWorld(true)}};
    effect.drawSceneTarget=function(...args){if(state.enabled&&state.audit)state.drawn.clear();return state.originalDraw.apply(this,args)};
    effect.render=function(...args){state.originalRender.apply(this,args);if(!state.enabled)return;
      if(!state.synthetic){d.camera.getWorldDirection(state.direction);state.angle=Math.atan2(state.direction.x,-state.direction.z)}
      let missing=0,expected=0,matrixWrites=0,rebuilt=0;const examples=[];
      if(state.audit){
        const camera=d.camera;state.frustum.setFromProjectionMatrix(state.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const x=Math.floor(camera.position.x/4)*4+2,z=Math.floor(camera.position.z/4)*4+2;
        for(const r of state.meshes){
          const actual=state.drawn.get(r.mesh)||new Set();
          for(const p of r.expected){const dist=Math.hypot(p.x-x,p.z-z);if(dist>=r.distance||dist<r.minimum||!state.frustum.intersectsSphere(p.sphere))continue;
            expected++;if(!actual.has(p.key)){missing++;if(examples.length<3)examples.push({mesh:r.mesh.name,x:p.x,z:p.z})}
          }
          const version=r.mesh.isBatchedMesh?r.mesh._matricesTexture.version:r.mesh.instanceMatrix.version;
          if(version!==r.matrixVersion)matrixWrites++;
          if(r.mesh.geometry.uuid!==r.geometry||r.mesh.material.uuid!==r.material)rebuilt++;
        }
      }
      state.frames.push({angle:state.angle,expected,missing,matrixWrites,rebuilt,examples,calls:effect.stats.renderCalls});state.frame++;
    };
    return true;
  })()`)
  c.events.length = 0
  const results = await c.evaluate(`new Promise(resolve=>{
    const s=__forestRotation;s.enabled=true;const phases=[{name:'audit',frames:144,audit:true},{name:'performance',frames:180,audit:false}];let phase=0,index=0,last=performance.now(),times=[];const output=[];
    function tick(t){
      const p=phases[phase];s.audit=p.audit;
      if(index>0)times.push(t-last);last=t;
      s.angle=(index<p.frames/2?index:p.frames-index)*Math.PI/12;
      index++;
      if(index<=p.frames){requestAnimationFrame(tick);return}
      const rows=s.frames.splice(0),sorted=times.slice(3).sort((a,b)=>a-b);
      output.push({name:p.name,frames:rows.length,missingFrames:rows.filter(r=>r.missing).length,missingInstances:rows.reduce((n,r)=>n+r.missing,0),matrixWriteFrames:rows.filter(r=>r.matrixWrites).length,resourceRebuildFrames:rows.filter(r=>r.rebuilt).length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxDrawCalls:Math.max(...rows.map(r=>r.calls)),rows:p.audit?rows:undefined});
      phase++;index=0;times=[];if(phase<phases.length)requestAnimationFrame(tick);else{s.enabled=false;resolve(output)}
    }requestAnimationFrame(tick)
  })`)
  if(!baseline)for(const direction of [1,-1]) {
    await c.evaluate('__forestRotation.synthetic=false;__forestRotation.enabled=true;__forestRotation.audit=true;__forestRotation.frames=[];true')
    for(let turn=0;turn<6;turn++) {
      const from=direction>0?280:1160,to=direction>0?1160:280
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from,y:480})
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'right',buttons:2,x:from,y:480,clickCount:1})
      for(let step=1;step<=16;step++) {
        await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'right',buttons:2,x:from+(to-from)*step/16,y:480})
        await c.evaluate('new Promise(r=>requestAnimationFrame(()=>r(true)))')
      }
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'right',buttons:0,x:to,y:480,clickCount:1})
    }
    await wait(700)
    const row=await c.evaluate(`(()=>{const s=__forestRotation;s.enabled=false;const rows=s.frames;let rotation=0;for(let i=1;i<rows.length;i++){const delta=rows[i].angle-rows[i-1].angle;rotation+=Math.atan2(Math.sin(delta),Math.cos(delta))}return{name:'mouse-${direction>0?'clockwise':'counterclockwise'}',frames:rows.length,turns:Math.abs(rotation)/(Math.PI*2),missingFrames:rows.filter(r=>r.missing).length,matrixWriteFrames:rows.filter(r=>r.matrixWrites).length,resourceRebuildFrames:rows.filter(r=>r.rebuilt).length,rows}})()`)
    results.push(row)
    assert.ok(row.turns>=3,'Exercise at least three full turns per direction with the gameplay mouse controls')
    assert.equal(row.missingFrames,0);assert.equal(row.matrixWriteFrames,0);assert.equal(row.resourceRebuildFrames,0)
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  const requests=c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!e.params.request.url.startsWith('data:')).map(e=>e.params.request.url)
  const info=await c.evaluate(`({pixelRatio:__ANIME__.renderer.getPixelRatio(),width:__ANIME__.renderer.domElement.width,height:__ANIME__.renderer.domElement.height,programsBefore:__forestRotation.startPrograms,programsAfter:__ANIME__.renderer.info.programs.length,gl:__ANIME__.renderer.getContext().getError()})`)
  fs.writeFileSync(dir+'/'+(baseline?'baseline':'validation')+'.json',JSON.stringify({baseline,results,errors,requests,info},null,2)+'\n')
  console.log(JSON.stringify({baseline,results:results.map(({rows,...r})=>r),errors:errors.length,requests,info},null,2))
  fs.writeFileSync(dir+'/'+(baseline?'baseline':'corrected')+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  if(!baseline){assert.equal(results[0].missingFrames,0);assert.equal(results[0].matrixWriteFrames,0);assert.equal(results[0].resourceRebuildFrames,0);assert.equal(errors.length,0);assert.equal(info.gl,0)}
} finally {
  await c.evaluate(`(async()=>{const s=window.__forestRotation;if(s){__MOSPEADA__.runtime.cameraController.update=s.originalUpdate;__ANIME__.effect.render=s.originalRender;__ANIME__.effect.drawSceneTarget=s.originalDraw;s.meshes.forEach(r=>r.mesh.onBeforeRender=r.originalBefore)}const config=window.__FOREST_FOLIAGE__?.config||(await import('/src/world/forest/forestConfig.js')).FOREST;config.performance.adaptiveResolution=window.__rotationAdaptive;__MOSPEADA__.runtime.paused=false;delete window.__forestRotation;return true})()`).catch(()=>{})
  c.close()
}
