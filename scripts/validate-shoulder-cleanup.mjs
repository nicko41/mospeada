import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/shoulder-cleanup',ev=code=>c.evaluate(code),wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
try{
 for(let i=0;i<900;i++){if(await ev('!!window.__MOSPEADA__?.runtime.scottInstance&&window.__ANIME__?.state.snapshot().ready').catch(()=>false))break;await wait(150)}
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const d=__MOSPEADA__;d.runtime.paused=true;d.setCameraMode(3);return true})()`);await wait(100)
 const report=await ev(`(()=>{const d=__MOSPEADA__,r=d.runtime,T=d.camera.position.constructor,actor=r.scottInstance,head=actor.bones.get('mixamorigHead').getWorldPosition(new T()),target=head.clone().add(new T(0,-.28,0));r.orbit.enableDamping=false;r.orbit.target.copy(target);d.camera.position.copy(target).add(new T(1.35,.15,-2.4));r.orbit.update();d.camera.fov=40;d.camera.updateProjectionMatrix();d.camera.updateMatrixWorld(true);__ANIME__.effect.render(__ANIME__.state.snapshot(),1);return{image:__ANIME__.renderer.domElement.toDataURL(),map:actor.skins[0].clean.map.image.src,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`)
 fs.writeFileSync(dir+'/'+(process.argv.includes('--before')?'before':'after')+'.png',Buffer.from(report.image.split(',')[1],'base64'));delete report.image;console.log(JSON.stringify(report,null,2))
}finally{c.close()}
