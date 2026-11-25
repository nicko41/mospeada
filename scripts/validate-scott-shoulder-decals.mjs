import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),ev=code=>c.evaluate(code),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/shoulder-decals'
fs.mkdirSync(dir,{recursive:true})
try{
 let ready=false;for(let i=0;i<900;i++){if(await ev('!!window.__MOSPEADA__?.runtime.scottInstance&&window.__ANIME__?.state.snapshot().ready').catch(()=>false)){ready=true;break}await wait(150)}assert.ok(ready)
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__;d.runtime.paused=true;d.setCameraMode(3);return true})()`);await wait(150)
 const report=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,a=__ANIME__,T=d.camera.position.constructor,actor=r.scottInstance,head=actor.bones.get('mixamorigHead').getWorldPosition(new T()),target=head.clone().add(new T(0,-.28,0)),shots=[];r.orbit.enableDamping=false;for(const x of [1.15,-1.15]){r.orbit.target.copy(target);d.camera.position.copy(target).add(new T(x,.12,-1.95));r.orbit.update();d.camera.fov=40;d.camera.updateProjectionMatrix();d.camera.updateMatrixWorld(true);a.effect.render(a.state.snapshot(),1);shots.push({x,image:a.renderer.domElement.toDataURL()})}return{shots,map:actor.skins[0].mesh.material.map.image.src,normal:actor.skins[0].mesh.material.normalMap.image.src,gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error}})()`)
 for(const [i,shot]of report.shots.entries()){fs.writeFileSync(dir+`/mounted-view-${i}.png`,Buffer.from(shot.image.split(',')[1],'base64'));delete shot.image}
 assert.ok(report.map.endsWith('scott-shoulders-decals.png'));assert.ok(report.normal.endsWith('scott-shoulders-normal.png'));assert.equal(report.gl,0);assert.equal(report.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/game-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={}};true').catch(()=>{});c.close()}
