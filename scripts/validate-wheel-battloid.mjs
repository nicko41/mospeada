import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/wheel-battloid',report=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
const controlsOnly=process.env.MOSPEADA_WHEEL_CONTROLS_ONLY==='1'
fs.mkdirSync(dir,{recursive:true})
async function bounded(p,ms=20000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser timeout')),ms)})])}finally{clearTimeout(timer)}}
try{
  let ready=false
  for(let i=0;i<180;i++){ready=await bounded(c.evaluate('!!window.__FRONT_BATTLOID__?.wheels && __FRONT_BATTLOID__.store.snapshot().ready && !document.querySelector("#entry-preloader")'),90000);if(ready)break;await wait(200)}assert.ok(ready)
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.openSettings('Clima');await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`);await c.closeSettings()
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.state.height+=2;__MOSPEADA__.rig.update(__MOSPEADA__.runtime.state,__MOSPEADA__.sample,__MOSPEADA__.config);__FRONT_BATTLOID__.entry.phase="complete";__FRONT_BATTLOID__.entry.poseBlend=1;window.__WHEEL_HYDRAULIC_IDS__=__FRONT_BATTLOID__.wheels.groups.map(g=>[g.hydraulic.root.uuid,g.hydraulic.sleeve.geometry.uuid,g.hydraulic.rod.geometry.uuid]);true')
  const cases=controlsOnly?[['armor',1]]:[['motorcycle',0],['waiting',.22],['first-arc-mid',.32],['authored-intermediate',.42],['horizontal-mid',.49],['behind',.56],['rising',.63],['early-armor',.70],['armor',1],['departure',1],['reverse',.5],['reverted',0]]
  for(const [name,progress]of cases){
    if(name==='departure')await c.evaluate('__FRONT_BATTLOID__.entry.actorOffset.set(0,2,6);true')
    else await c.evaluate('__FRONT_BATTLOID__.entry.actorOffset.set(0,0,0);true')
    await bounded(c.evaluate(`__FRONT_BATTLOID__.store.seek(${progress});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`))
    const state=await bounded(c.evaluate(`(()=>{const f=__FRONT_BATTLOID__,w=f.wheels;return{progress:f.store.snapshot().progress,active:w.applied,wheels:w.groups.length,visible:w.parts.every(p=>p.mesh.visible),originalTubesHidden:__MOSPEADA__.rig.surfaces.filter(m=>/brazo tubular/.test(m.userData.sourcePiece)).every(m=>!m.visible),motions:w.applied?w.groups.map(g=>({wheel:g.record.wheel,angle:g.motion.angle,fit:g.motion.fit,radius:g.end.distanceTo(g.base),center:g.center.clone().applyMatrix4(g.world).applyMatrix4(g.frame.clone().invert()).toArray(),expectedRadius:(()=>{const k=g.motion.segment,t=g.motion.blend,a=g.center.clone().applyMatrix4(g.keys[k]).length(),b=g.center.clone().applyMatrix4(g.keys[k+1]).length();return a+(b-a)*t})(),radiusFromCenter:g.center.clone().applyMatrix4(g.world).distanceTo(g.base)})):[],hydraulicIds:w.groups.map(g=>[g.hydraulic.root.uuid,g.hydraulic.sleeve.geometry.uuid,g.hydraulic.rod.geometry.uuid]),hydraulicErrors:w.groups.map(g=>({...g.hydraulic.state})),endpointError:${progress>=.70||progress===.42?`Math.max(...w.groups.flatMap(g=>{const m=f.effect.anchorWorld.clone().multiply(g.targets.${progress>=.70?'final':'intermediate'});${progress>=.70?'m.elements[12]+=g.alignmentWorld.x;m.elements[13]+=g.alignmentWorld.y;m.elements[14]+=g.alignmentWorld.z;':''}return m.elements.map((v,i)=>Math.abs(v-g.world.elements[i]))}))`:'0'},gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error}})()`))
    assert.equal(state.active,progress>.22);assert.equal(state.wheels,2);assert.equal(state.visible,true);assert.equal(state.originalTubesHidden,true);assert.ok(state.endpointError<1e-7)
    assert.ok(state.hydraulicErrors.every(h=>h.baseError+h.targetError+h.connectorStartError+h.connectorEndError<1e-5));assert.deepEqual(state.hydraulicIds,await c.evaluate('__WHEEL_HYDRAULIC_IDS__'));assert.equal(state.gl,0);assert.equal(state.shader,'');report.push({name,...state})
    // Detailed articulated path and level-circle checks run in wheelTransformation.test.js.
    // Browser validation checks the authored landmarks, final correction and real endpoints.
    if(name==='first-arc-mid'||name==='horizontal-mid')assert.ok(state.motions.find(g=>g.wheel==='front').center[0]>0,'Front passes on the left')
    if(name==='waiting')continue
    for(const [view,offset]of[['side',[4.4,.8,.5]],['rear',[1,.9,-4.4]]]){
      await bounded(c.evaluate(`(()=>{const d=__MOSPEADA__,f=__FRONT_BATTLOID__,v=d.camera.position.clone(),center=f.effect.anchor.getWorldPosition(v).clone().add(v.set(0,-.3,0));d.setCameraMode(3);d.runtime.orbit.target.copy(center);d.camera.position.copy(center).add(v.set(...${JSON.stringify(offset)}).applyAxisAngle(v.clone().set(0,1,0),d.runtime.state.yaw));d.runtime.orbit.update()})()`));await wait(150)
      fs.writeFileSync(`${dir}/${name}-${view}.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
    }
  }
  // Exercise the actual UI while paused. This preview is reset before exit;
  // no aesthetic choice is silently retained for the user.
  await c.evaluate('__FRONT_BATTLOID__.store.seek(1);true')
  await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
  await c.openSettings('Transformación')
  const before=await c.evaluate('__FRONT_BATTLOID__.wheels.groups[0].end.toArray()')
  await c.evaluate(`(()=>{const input=document.querySelector('[aria-label="Altura · rueda delantera"]');input.scrollIntoView({block:'center'});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'-20');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
  const tuning=await c.evaluate('({settings:__FRONT_BATTLOID__.wheelSettings.snapshot(),end:__FRONT_BATTLOID__.wheels.groups[0].end.toArray(),delta:__MOSPEADA__.camera.position.clone().set(0,-.2,0).applyQuaternion(__FRONT_BATTLOID__.wheels.modelQ).toArray()})')
  assert.equal(tuning.settings.front.height,-.2);assert.ok(tuning.end.every((n,i)=>Math.abs(n-before[i]-tuning.delta[i])<1e-6),'Height follows the Armor frame even while the bike is leaning')
  fs.writeFileSync(`${dir}/wheel-controls.png`,Buffer.from((await bounded(c.send('Page.captureScreenshot',{format:'png'}))).data,'base64'))
  await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Restaurar ajustes de ruedas').click()`)
  await bounded(c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'))
  assert.ok(await c.evaluate('Object.values(__FRONT_BATTLOID__.wheelSettings.snapshot()).every(w=>Object.values(w).every(n=>n===0))'))
  await c.closeSettings();report.push({name:'controls',heightPreview:-.2,resetComposition:true})
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/${controlsOnly?'controls-validation':'visual-validation'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.map(r=>({name:r.name,active:r.active,endpointError:r.endpointError,maxHydraulicError:r.hydraulicErrors?Math.max(...r.hydraulicErrors.flatMap(h=>[h.baseError,h.targetError,h.connectorStartError,h.connectorEndError])):undefined,resetComposition:r.resetComposition})),null,2))
}finally{await bounded(c.send('Browser.close')).catch(()=>{});c.close()}
