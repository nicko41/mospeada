import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/anime', began = Date.now()
fs.mkdirSync(directory, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(expression, attempts = 180) {
  for (let i = 0; i < attempts; i++) { if (await c.evaluate(expression)) return; await wait(350) }
  throw Error('Timed out: ' + expression)
}
async function key(code) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.slice(3).toLowerCase() })
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase() })
}
async function view(position = [1.95, 1.8, 2.4], target = [0, 1.2, 0]) {
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.setCameraMode(3);d.runtime.paused=true;
    d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(...${JSON.stringify(target)})));
    d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`)
  await wait(400)
}
async function screenshot(name) {
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from(shot.data, 'base64'))
}
async function mode(value, compare = false) {
  await c.evaluate(`__ANIME__.state.set({mode:'${value}',compare:${compare}})`); await wait(700)
}

try {
  await until('!!window.__ANIME__?.state.snapshot().ready && !!window.__MOSPEADA__?.rig')
  await c.evaluate(`(()=>{const d=__MOSPEADA__;d.reset('highway');d.runtime.paused=true;d.runtime.state.idleBlend=0;d.runtime.state.lean=0;d.rig.update(d.runtime.state,d.sample,d.config);__ANIME__.state.reset()})()`)
  await key('KeyN'); await until('__ANIME__.effect.uniforms.uAnimeDay.value===1')
  await view()
  const initial = await c.evaluate(`({size:[__ANIME__.effect.target.width,__ANIME__.effect.target.height],glbs:performance.getEntriesByType('resource').filter(r=>r.name.includes('.glb')).length, geometries:__ANIME__.renderer.info.memory.geometries, programs:__ANIME__.renderer.info.programs.length})`)
  await mode('PBR'); await screenshot('01-pbr-day')
  await mode('ANIME'); await screenshot('02-anime-day')
  await mode('ANIME', true); await screenshot('03-comparison-day')

  // All renders/readbacks below happen inside ONE browser task: weather,
  // lighting, skeletons and the simulation cannot advance between images.
  const reversibility = await c.evaluate(`(()=>{
    const {effect:e,renderer:r,state}=__ANIME__, gl=r.getContext(), day=e.uniforms.uAnimeDay.value;
    const config={...state.snapshot(),mode:'PBR',compare:false}, size=e.size;
    const read=()=>{const b=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,b);return b};
    const difference=(a,b,leftOnly=false)=>{let pixels=0,max=0,total=0;for(let i=0;i<a.length;i+=4){if(leftOnly&&(i/4)%size.x>=Math.floor(size.x*.5)-2)continue;let changed=false;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);max=Math.max(max,d);total+=d;changed ||= d>0}if(changed)pixels++}return {pixels,max,total}};
    e.collect();e.sync();
    const originals=e.bindings.map(b=>({object:b.object,material:b.source,geometry:b.object.geometry}));
    const bones=[];e.scene.traverse(n=>{if(n.isBone)bones.push([n,n.matrixWorld.elements.slice()])});
    r.setRenderTarget(null);r.render(e.scene,e.camera);const direct=read();
    e.render(config,day);const before=read();
    e.render({...config,mode:'ANIME'},day);const anime=read();
    e.render(config,day);const after=read();
    e.render({...config,mode:'ANIME',compare:true,split:.5},day);const comparison=read();
    const controls={};
    for(const [name,change] of Object.entries({celOff:{cel:false},levels2:{levels:2},levels5:{levels:5},shadowZero:{shadow:0},outlinesOff:{outlines:false},wideOutline:{width:3},redOutline:{color:'#803040'},reflectionsOff:{highlights:0}})){
      e.render({...config,mode:'ANIME',...change},day);controls[name]=difference(anime,read()).pixels;
    }
    e.render(config,day);
    return {directPbr:difference(direct,before),pbrRoundtrip:difference(before,after),comparisonPbr:difference(before,comparison,true),anime:difference(before,anime),controls,
      originalMaterials:originals.every(b=>b.object.material===b.material),originalGeometries:originals.every(b=>b.object.geometry===b.geometry),
      unchangedBones:bones.every(([b,m])=>b.matrixWorld.elements.every((v,i)=>v===m[i])),bones:bones.length,glError:gl.getError()};
  })()`)
  assert.equal(reversibility.directPbr.pixels, 0, 'PBR must equal the original direct renderer')
  assert.equal(reversibility.pbrRoundtrip.pixels, 0, 'PBR must survive switching without pixel differences')
  assert.equal(reversibility.comparisonPbr.pixels, 0, 'The PBR half must be the actual PBR framebuffer')
  assert.ok(reversibility.anime.pixels > 1000)
  for (const [name, pixels] of Object.entries(reversibility.controls)) assert.ok(pixels > 0, name + ' must visibly affect the image')
  assert.ok(reversibility.originalMaterials && reversibility.originalGeometries && reversibility.unchangedBones)
  assert.equal(reversibility.glError, 0)
  console.log('Reversibility and visual controls:', JSON.stringify(reversibility))

  // Exercise the actual React panel, not only its developer store.
  await c.openSettings('Anime')
  await wait(150)
  await c.evaluate(`{const s=document.querySelector('[aria-label="Niveles de iluminación"]');s.value='4';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.anime-settings input[type=checkbox]').click()}`)
  await wait(150)
  assert.equal(await c.evaluate('__ANIME__.state.snapshot().levels'), 4)
  assert.equal(await c.evaluate('__ANIME__.state.snapshot().cel'), false)
  const panel = await c.evaluate(`(()=>{const set=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};set('Intensidad de sombras','0.54');set('Grosor de contornos','1.8');set('Color de contornos','#152a45');set('Reflejos estilizados','0.8');document.querySelectorAll('.anime-settings input[type=checkbox]')[1].click();return __ANIME__.state.snapshot()})()`)
  assert.equal(panel.shadow, 0.54); assert.equal(panel.width, 1.8)
  assert.equal(panel.color, '#152a45'); assert.equal(panel.highlights, 0.8); assert.equal(panel.outlines, false)
  await c.evaluate(`{const p=document.querySelector('.anime-settings');[...p.querySelectorAll('button')].find(b=>b.textContent==='Restablecer estilo').click()}`)
  await mode('ANIME')
  await screenshot('04-anime-settings')
  await c.closeSettings()

  await view([1.1, 1.8, 1.4], [0, 1.35, 0])
  await mode('PBR'); await screenshot('05-helmet-pbr')
  await mode('ANIME'); await screenshot('06-helmet-anime')
  await view([-2.5, 1.5, -2.7], [0, 1, 0]); await screenshot('07-armor-rear-anime')
  await key('KeyM'); await until('__ANIME__.effect.uniforms.uAnimeDay.value===0')
  await view([1.9, 1.3, 2.5], [0, 0.95, 0.2]); await screenshot('08-anime-night-optics')
  const night = await c.evaluate(`({headlights:__MOSPEADA__.rig.lighting.headlights.map(h=>({intensity:h.light.intensity,emission:h.lens.material.emissiveIntensity})),amber:__MOSPEADA__.rig.lighting.amberLights.map(h=>h.light.intensity)})`)
  assert.ok(night.headlights.every(l => l.intensity > 2000 && l.emission > 0))
  assert.ok(night.amber.every(i => i > 0))
  await view([0, 2.4, -4.8], [0, 0.45, 12]); await screenshot('09-anime-night-road')
  await key('KeyN'); await until('__ANIME__.effect.uniforms.uAnimeDay.value===1')
  await view()

  // Animation + weather remain live with both shaders. Use the game's input.
  await c.evaluate('__MOSPEADA__.runtime.paused=false')
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' })
  await wait(1600)
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' })
  const moving = await c.evaluate(`({speed:__MOSPEADA__.runtime.state.speed,sceneFog:__MOSPEADA__.scene.fog.density,grass:__MOSPEADA__.scene.getObjectByName('Grass_original_field').count})`)
  assert.ok(moving.speed > 0)
  assert.equal(moving.sceneFog, 0.068); assert.equal(moving.grass, 11000)
  await c.evaluate(`__MOSPEADA__.runtime.paused=true;__MOSPEADA__.reset('highway');__MOSPEADA__.runtime.state.idleBlend=0;__MOSPEADA__.runtime.state.lean=0`)
  await view()

  const performanceResults = {}
  for (const value of ['PBR', 'ANIME']) {
    await mode(value); await wait(1000)
    performanceResults[value] = await c.evaluate(`new Promise(resolve=>{const intervals=[];let last=performance.now(),start=last;
      function tick(now){intervals.push(now-last);last=now;if(now-start<6000)requestAnimationFrame(tick);else{intervals.sort((a,b)=>a-b);
        const median=intervals[Math.floor(intervals.length*.5)];resolve({medianMs:median,p95Ms:intervals[Math.floor(intervals.length*.95)],fps:1000/median,frames:intervals.length,renderCalls:__ANIME__.effect.stats.renderCalls})}}
      requestAnimationFrame(tick)})`)
  }
  const environment = await c.evaluate(`(()=>{const r=__ANIME__.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),resolution:[g.drawingBufferWidth,g.drawingBufferHeight],dpr:r.getPixelRatio(),samples:__ANIME__.effect.target.samples,glbs:performance.getEntriesByType('resource').filter(r=>r.name.includes('.glb')).length,shaderError:__ANIME__.state.snapshot().error,programs:r.info.programs.length,invalidPrograms:r.info.programs.filter(p=>p.program&&!g.getProgramParameter(p.program,g.LINK_STATUS)).map(p=>p.name)}})()`)
  assert.equal(environment.glbs, initial.glbs, 'Switching must not reimport GLBs')
  assert.equal(environment.shaderError, '')
  assert.deepEqual(environment.invalidPrograms, [])
  const errors = c.events.filter(e=>e.method==='Runtime.exceptionThrown' && e.params.timestamp>=began).map(e=>e.params.exceptionDetails.text)
  assert.deepEqual(errors, [])
  const hashes = Object.fromEntries(['assets/scott-bernard-gear.glb','public/models/mospeada/scott-bernard-gear.glb','public/models/mospeada/cyclone-vr052f.glb'].map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))
  const cameras = []
  for (let cameraMode = 0; cameraMode < 4; cameraMode++) {
    await c.evaluate(`__MOSPEADA__.setCameraMode(${cameraMode})`); await wait(400)
    cameras.push(await c.evaluate(`({mode:__MOSPEADA__.runtime.cameraMode,sameCamera:__ANIME__.effect.camera===__MOSPEADA__.camera,width:__ANIME__.effect.composite.uniforms.uWidth.value,gl:__ANIME__.renderer.getContext().getError()})`))
  }
  assert.ok(cameras.every(camera=>camera.sameCamera && camera.gl===0 && camera.width===1.2))
  await view()
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1.5,mobile:false})
  await until('__ANIME__.effect.target.width===1920 && __ANIME__.effect.target.height===1080')
  const resize = await c.evaluate(`({size:[__ANIME__.effect.target.width,__ANIME__.effect.target.height],outlinePixels:__ANIME__.effect.composite.uniforms.uWidth.value,aspect:__ANIME__.camera.aspect,gl:__ANIME__.renderer.getContext().getError()})`)
  assert.ok(Math.abs(resize.outlinePixels-1.8)<0.00001); assert.equal(resize.gl,0)
  await c.send('Emulation.clearDeviceMetricsOverride')
  await until(`__ANIME__.effect.target.width===${initial.size[0]} && __ANIME__.effect.target.height===${initial.size[1]}`)
  const result = { date: new Date().toISOString(), reversibility, panel, night, moving, cameras, resize, environment, performance: performanceResults, sourceHashes: hashes, errors,
    performanceContext: 'Isolated headless Chrome on the local GPU, full environment, 6 seconds per mode; not the user session. Comparison renders both modes and costs an additional scene pass.' }
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify(result,null,2))
  await mode('ANIME', false)
} finally { c.close() }
