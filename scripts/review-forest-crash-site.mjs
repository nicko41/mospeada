import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'artifacts/forest-crash-refinement',wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await c.send('Page.reload',{ignoreCache:false});c.events.length=0
  for(let i=0;i<450;i++){
    const state=await c.evaluate('({ready:!!window.__FOREST_CRASH_SITE__&&!!window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader"),error:window.__ANIME__?.effect.error})')
    if(state.error)throw Error(state.error)
    if(state.ready)break
    if(i===449)throw Error('Crash site did not become ready')
    await wait(200)
  }
  const before=JSON.parse(fs.readFileSync('artifacts/forest-crash-refinement/before.json'))
  const audit=await c.evaluate(`(()=>{const a=__FOREST_ALPHA__,s=__FOREST_CRASH_SITE__;return{matrix:a.placement.matrix.toArray(),sourceMatrix:a.placement.sourceMatrix.toArray(),treeDirection:s.tree.direction.toArray(),fallenParts:s.tree.group.children.length,treeColliders:s.tree.colliders.length,crushedGroups:s.plants.batch.instanceCount,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
  assert.deepEqual(audit.matrix,before.matrix);assert.deepEqual(audit.sourceMatrix,before.sourceMatrix)
  for(const [name,x,z,yaw]of [['reference',-7,-5,1.3],['contact',-1,-15,1.25]]){
    await c.evaluate(`(async()=>{const d=__MOSPEADA__,{createBikeState}=await import('/src/vehicle/bikePhysics.js');d.reset('forest');d.setCameraMode(0);d.runtime.state=createBikeState({x:${x},z:${z},yaw:${yaw}},d.rig.metrics,d.sample);d.runtime.cameraController.reset(d.runtime.state);d.runtime.paused=false;return true})()`)
    await wait(700);await c.evaluate('__MOSPEADA__.runtime.paused=true;true');await wait(300)
    fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
  audit.errors=errors;fs.writeFileSync(dir+'/visual.json',JSON.stringify(audit,null,2)+'\n');console.log(audit)
  assert.equal(audit.gl,0);assert.equal(audit.shader,'');assert.deepEqual(errors,[])
}finally{c.close()}
