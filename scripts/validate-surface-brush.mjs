import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/anime/brush'
fs.mkdirSync(directory, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression) {
  for (let i = 0; i < 300; i++) { if (await c.evaluate(expression).catch(()=>false)) return; await wait(250) }
  throw Error('Timed out: ' + expression)
}
async function photo(name) {
  await wait(350)
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from(shot.data, 'base64'))
}
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1422, height: 904, deviceScaleFactor: 1, mobile: false })
  const origin = await c.evaluate('performance.timeOrigin'); await c.send('Page.reload')
  await until(`performance.timeOrigin!==${origin} && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`)
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.reset('highway');d.runtime.paused=true;d.runtime.state.idleBlend=0;d.runtime.state.lean=0;d.rig.update(d.runtime.state,d.sample,d.config);d.setCameraMode(3);d.runtime.orbit.minDistance=.25;
    const a=[...__ANIME__.effect.brush.attachments].find(a=>/^tapa-up/.test(a.object.userData.sourcePiece)&&a.geometry.attributes.position.getX(0)>.15);a.sourceGeometry.computeBoundingBox();const p=a.sourceGeometry.boundingBox.getCenter(d.camera.position.clone());
    d.runtime.orbit.target.copy(a.object.localToWorld(p.clone()));d.camera.position.copy(a.object.localToWorld(p.clone().add(d.camera.position.clone().set(.54,.34,.43))));d.runtime.orbit.update();
    __ANIME__.state.set({mode:'ANIME'});__ANIME__.effect.brush.store.set({automatic:false});})()`)
  const pixels = await c.evaluate(`(async()=>{
    const {Raycaster,Vector2,Vector3,Triangle}=await import('/node_modules/three/build/three.module.js');
    const {effect:e,renderer:r,state}=__ANIME__,b=e.brush,g=r.getContext(),conf={...state.snapshot(),compare:false},day=b.uniforms.uBrushDay.value;
    const startupError=g.getError(),source=[...e.bindings].map(x=>[x.object,x.source,x.object.geometry]),a=[...b.attachments].find(a=>/^tapa-up/.test(a.object.userData.sourcePiece)&&a.geometry.attributes.position.getX(0)>.15),startPrograms=r.info.programs.length;
    const delay=a.uniforms.uBrushPanelDelay.value,seed=a.uniforms.uBrushPanel.value.z;
    const phase=(p,face)=>{const positions=a.sourceGeometry.attributes.position;const points=[0,1,2].map(k=>new Vector3().fromBufferAttribute(positions,face*3+k));const n=new Triangle(...points).getNormal(new Vector3());const fd=.04+.04*Math.sin(n.dot(new Vector3(2.7,4.1,1.3))+seed);return (delay+fd+.55*p)/.87};
    const phases={front:phase(.26,3),middle:phase(.29,9),rear:phase(.36,9)};window.__BRUSH_TEST_PHASES__=phases;
    const {front:frontPhase,middle,rear:rearPhase}=phases;
    const read=()=>{const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p};
    const render=(enabled,progress,mode='ANIME',patch={})=>{b.store.set({enabled,...patch});b.store.scrub(progress);b.store.set({enabled});b.tick(0,true,day);e.render({...conf,mode},day);return read()};
    const diff=(x,y)=>{let pixels=0,max=0;for(let i=0;i<x.length;i+=4){let changed=false;for(let k=0;k<3;k++){const v=Math.abs(x[i+k]-y[i+k]);max=Math.max(max,v);changed ||= v>0}pixels+=changed?1:0}return{pixels,max}};
    const pbr=render(false,middle,'PBR'),off=render(false,middle),on=render(true,middle);
    const controls={};
    for(const [name,patch]of Object.entries({size:{size:.6},intensity:{intensity:0},shape:{irregularity:0},normalSensitivity:{sensitivity:0},stagger:{stagger:0},color:{color:'#85b5ff'}})){
      controls[name]=diff(on,render(true,middle,'ANIME',patch));b.store.reset();b.store.set({automatic:false});
    }
    const front=render(true,frontPhase),rear=render(true,rearPhase),ray=new Raycaster(),mouse=new Vector2();
    const centroid=image=>{let sum=0,count=0;for(let i=0;i<image.length;i+=4*17){let d=0;for(let k=0;k<3;k++)d+=Math.abs(image[i+k]-off[i+k]);if(d<12)continue;
      const pixel=i/4,x=pixel%g.drawingBufferWidth,y=Math.floor(pixel/g.drawingBufferWidth);mouse.set((x+.5)/g.drawingBufferWidth*2-1,(y+.5)/g.drawingBufferHeight*2-1);ray.setFromCamera(mouse,e.camera);
      const hit=ray.intersectObject(a.object,false)[0];if(hit&&a.geometry.attributes.aBrushData.getX(hit.faceIndex*3)>.5){sum+=a.object.worldToLocal(hit.point.clone()).z;count++}}
      return{localZ:sum/count,samples:count}};
    const forward=centroid(front),backward=centroid(rear),reverse=render(true,1-rearPhase,'ANIME',{direction:-1});
    b.store.set({direction:1});const pbrAfter=render(true,middle,'PBR');
    // Removing all painted targets must remove every effect pixel. Lamps,
    // controls, bolts, rubber, Scott and the environment remain visible.
    const visibility=[...b.attachments].map(a=>[a.object,a.object.visible]);for(const [o]of visibility)o.visible=false;
    const hiddenOff=render(false,middle),hiddenOn=render(true,middle);for(const [o,v]of visibility)o.visible=v;
    const cost=enabled=>{b.store.set({enabled});b.store.scrub(middle);b.store.set({enabled});b.tick(0,true,day);
      for(let i=0;i<3;i++)e.render({...conf,mode:'ANIME'},day);
      const times=[];for(let i=0;i<9;i++){const start=performance.now();e.render({...conf,mode:'ANIME'},day);g.finish();times.push(performance.now()-start)}times.sort((x,y)=>x-y);
      return{medianMs:times[4],renderCalls:e.stats.renderCalls}};
    const performanceCost={off:cost(false),on:cost(true),resolution:[g.drawingBufferWidth,g.drawingBufferHeight],context:'Frozen render + GPU finish in isolated Chrome; not gameplay FPS'};
    const out={phases,panelDelays:[...b.attachments].map(a=>a.uniforms.uBrushPanelDelay.value),startupError,attachmentCount:b.attachments.size,report:a.report,paintedTriangles:[...b.attachments].reduce((sum,a)=>sum+a.report.exteriorTriangles,0),pbrRoundtrip:diff(pbr,pbrAfter),brushPixels:diff(off,on),controls,
      hiddenTarget:diff(hiddenOff,hiddenOn),directionReversal:diff(rear,reverse),forward,backward,performance:performanceCost,
      restoredMaterials:source.every(([o,m])=>o.material===m),restoredGeometry:source.every(([o,,geometry])=>o.geometry===geometry),
      newPrograms:r.info.programs.length-startPrograms,gl:g.getError(),shaderError:state.snapshot().error};
    b.store.reset();b.store.set({automatic:false});return out;
  })()`)
  assert.equal(pixels.startupError, 0); assert.equal(pixels.attachmentCount, 70)
  assert.equal(pixels.report.exteriorTriangles, 28); assert.equal(pixels.report.excludedTriangles, 0)
  assert.equal(pixels.pbrRoundtrip.pixels, 0); assert.equal(pixels.hiddenTarget.pixels, 0)
  assert.ok(pixels.brushPixels.pixels > 500)
  for (const [name, difference] of Object.entries(pixels.controls)) assert.ok(difference.pixels > 0, name)
  assert.ok(pixels.forward.samples > 50 && pixels.backward.samples > 50 && pixels.forward.localZ > pixels.backward.localZ + 0.06,JSON.stringify({forward:pixels.forward,backward:pixels.backward}))
  assert.equal(pixels.directionReversal.pixels, 0)
  assert.ok(pixels.restoredMaterials && pixels.restoredGeometry)
  assert.equal(pixels.newPrograms, 0); assert.equal(pixels.gl, 0); assert.equal(pixels.shaderError, '')
  assert.equal(pixels.performance.off.renderCalls,pixels.performance.on.renderCalls)
  const phases=await c.evaluate('window.__BRUSH_TEST_PHASES__');
  for (const [name, phase] of Object.entries(phases)) {
    await c.evaluate(`__ANIME__.effect.brush.store.scrub(${phase})`); await photo(name)
  }
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.state.pitch=.14;d.runtime.state.lean=-.2;d.runtime.state.yaw+=.6;d.runtime.state.height+=.4;d.runtime.state.frontGrounded=false;d.runtime.state.rearGrounded=false;d.rig.update(d.runtime.state,d.sample,d.config);d.setCameraMode(3);
    const a=[...__ANIME__.effect.brush.attachments].find(a=>/^tapa-up/.test(a.object.userData.sourcePiece)&&a.geometry.attributes.position.getX(0)>.15),p=a.sourceGeometry.boundingBox.getCenter(d.camera.position.clone());d.runtime.orbit.target.copy(a.object.localToWorld(p.clone()));d.camera.position.copy(a.object.localToWorld(p.clone().add(d.camera.position.clone().set(.54,.34,.43))));d.runtime.orbit.update();__ANIME__.effect.brush.store.scrub(${phases.middle})})()`)
  await photo('turned-leaned-airborne')
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0,.9,0)));d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(2.6,1.8,2.5)));d.runtime.orbit.update()})()`)
  for(const [name,phase]of [['body-front',.26],['body-middle',.5],['body-rear',.73]]){await c.evaluate('__ANIME__.effect.brush.store.scrub('+phase+')');await photo(name)}
  await c.openSettings('Reflejo'); await photo('controls')
  await c.evaluate(`(()=>{const set=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};set('Velocidad del reflejo','1.25');set('Tamaño del reflejo','1.2');set('Intensidad del reflejo','1.1');set('Irregularidad de la pincelada','1');set('Normales y relieves','1.5');set('Color del reflejo','#d0eaff');const s=document.querySelector('[aria-label="Dirección del reflejo"]');s.value='-1';s.dispatchEvent(new Event('change',{bubbles:true}));[...document.querySelectorAll('.surface-brush-settings label')].find(x=>x.textContent.includes('Reproducción lenta')).querySelector('input').click()})()`)
  const panel = await c.evaluate('__ANIME__.effect.brush.store.snapshot()')
  assert.equal(panel.speed,1.25);assert.equal(panel.size,1.2);assert.equal(panel.intensity,1.1);assert.equal(panel.irregularity,1);assert.equal(panel.sensitivity,1.5);assert.equal(panel.color,'#d0eaff');assert.equal(panel.direction,-1);assert.equal(panel.slow,true)
  await c.evaluate(`__ANIME__.effect.brush.store.reset();__ANIME__.effect.brush.store.set({automatic:false});[...document.querySelectorAll('.surface-brush-settings button')].find(b=>b.textContent==='Reproducir reflejo').click()`)
  await until('__ANIME__.effect.brush.store.snapshot().playing')
  await until('!__ANIME__.effect.brush.store.snapshot().playing && __ANIME__.effect.brush.store.snapshot().progress===1')
  const sources = Object.fromEntries(['public/models/mospeada/cyclone-vr052f.glb','assets/scott-bernard-gear.glb'].map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]))
  fs.writeFileSync(`${directory}/validation.json`,JSON.stringify({pixels,panel,sources,manualPlayback:true},null,2)+'\n')
  console.log(JSON.stringify({pixels,manualPlayback:true},null,2))
} finally {
  await c.evaluate(`delete window.__BRUSH_TEST_PHASES__;__ANIME__.effect.brush.store.reset();__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(()=>{})
  c.close()
}
