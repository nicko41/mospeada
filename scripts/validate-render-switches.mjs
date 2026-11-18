import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), wait = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1422, height: 904, deviceScaleFactor: 1, mobile: false })
  const origin = await c.evaluate('performance.timeOrigin')
  if (!process.argv.includes('--reuse')) await c.send('Page.reload')
  let ready = false
  for (let i = 0; i < 240; i++) {
    await wait(350)
    ready = await c.evaluate(`(performance.timeOrigin!==${origin} || ${process.argv.includes('--reuse')}) && !!window.__ANIME__?.state.snapshot().ready && !document.getElementById('entry-preloader')`).catch(() => false)
    if (ready) break
  }
  assert.ok(ready, 'Both styles, lighting states and startup passes must finish preparing')
  const result = await c.evaluate(`(()=>{
    const {effect:e,renderer:r,state}=__ANIME__,d=__MOSPEADA__,g=r.getContext(),config={...state.snapshot(),compare:false},samples=[];
    d.runtime.paused=true;
    const startupError=g.getError();
    const beforeMeshes=e.bindings.map(b=>[b.object,b.source,b.object.geometry]);
    for(const [name,mode,day]of [['dayPBR','PBR',1],['nightPBR-first','PBR',0],['nightPBR-repeat','PBR',0],['nightANIME-first','ANIME',0],['nightANIME-repeat','ANIME',0],['dayANIME-first','ANIME',1],['dayANIME-repeat','ANIME',1],['dayPBR-return','PBR',1]]){
      d.rig.lighting.update(day);const programs=r.info.programs.length,start=performance.now();e.render({...config,mode},day);g.finish();
      samples.push({name,ms:performance.now()-start,newPrograms:r.info.programs.length-programs,calls:e.stats.renderCalls,gl:g.getError()});
    }
    d.rig.lighting.update(1);e.render({...config,mode:'PBR'},1);
    const read=()=>{const bytes=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,bytes);return bytes};
    r.render(e.scene,e.camera);const direct=read();e.render({...config,mode:'PBR'},1);const pbr=read();
    e.render({...config,mode:'ANIME'},1);e.render({...config,mode:'PBR'},1);const returned=read();
    const changed=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n};
    const pbrPixels={direct:changed(direct,pbr),roundtrip:changed(pbr,returned)};
    return {initialContextError:e.stats.preparation?.initialGLError,startupError,samples,pbrPixels,originalMeshes:beforeMeshes.every(([o,m,geometry])=>o.material===m&&o.geometry===geometry),nightShadowMaps:d.rig.lighting.headlights.every(h=>!!h.light.shadow.map),
      invalidPrograms:r.info.programs.filter(p=>p.program&&!g.getProgramParameter(p.program,g.LINK_STATUS)).map(p=>p.name),error:state.snapshot().error,
      maskFormat:e.target.textures[1].format,programs:r.info.programs.length,context:'Frozen scene, 1422x904. Each measurement renders then calls gl.finish; excludes startup precompilation, not a gameplay FPS benchmark.'};
  })()`)
  console.log(JSON.stringify(result, null, 2))
  assert.deepEqual(result.pbrPixels,{direct:0,roundtrip:0})
  assert.ok(result.originalMeshes && result.nightShadowMaps)
  assert.equal(result.error, ''); assert.deepEqual(result.invalidPrograms, [])
  assert.equal(result.startupError, 0)
  assert.ok(result.samples.every(sample=>sample.gl===0))
  assert.ok(result.samples.every(sample=>sample.newPrograms===0), 'Switching between prepared modes/light states must not compile new GPU programs')
  assert.ok(result.samples.every(sample=>sample.ms<1000), 'Switches must not stall for seconds')
  fs.mkdirSync('artifacts/anime', { recursive: true })
  fs.writeFileSync('artifacts/anime/switch-performance.json', JSON.stringify(result,null,2)+'\n')
} finally { c.close() }
