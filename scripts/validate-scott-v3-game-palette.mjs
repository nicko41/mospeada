import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const directory='artifacts/scott-v3/palette/ingame',label=process.argv[2]||'current',armor=process.argv[3]==='armor'
fs.mkdirSync(directory,{recursive:true})
const c=await connect({port:Number(process.env.MOSPEADA_TEST_PORT||9333)})
try{
 const deadline=Date.now()+180000
 while(!await c.evaluate('!!window.__MOSPEADA__?.runtime.scottInstance && !!window.__ANIME__?.state.snapshot().ready')){
  if(Date.now()>deadline)throw Error('Timed out waiting for the game renderer')
  await new Promise(resolve=>setTimeout(resolve,500))
 }
 if(armor){
  await c.evaluate(`(()=>{const d=window.__MOSPEADA__,f=window.__FRONT_BATTLOID__;d.runtime.paused=true;f.store.set({inspection:true});f.entry.scrub(1)})()`)
  await new Promise(resolve=>setTimeout(resolve,1200))
 }
 const report=await c.evaluate(`(()=>{
  const d=window.__MOSPEADA__,a=window.__ANIME__;
  if(!d?.runtime.scottInstance||!a?.state.snapshot().ready)throw Error('Game renderer not ready');
  d.runtime.paused=true;d.runtime.keys={};d.setCameraMode(3);
  const v=d.runtime.scottInstance.modelComparison.v3,skin=v.skins[0],e=a.effect;
  d.camera.position.copy(d.rig.root.localToWorld(d.camera.position.clone().set(${armor?'2.4,1.5,3.5':'3.1,1.05,.1'})));
  d.camera.zoom=${armor?'1.25':'1'};d.camera.updateProjectionMatrix();
  d.runtime.orbit.target.copy(d.rig.root.localToWorld(d.camera.position.clone().set(0,${armor?'1.05':'.85'},0)));d.runtime.orbit.update();
  const records=[...e.records.values()].filter(r=>[skin.original,skin.clean,skin.mesh.material].includes(r.source)||r.source.userData.scottV3Palette);
  const uniforms=records.map(r=>{const s={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\\n#include <color_fragment>',uniforms:{}};r.source.onBeforeCompile(s);return {key:r.source.customProgramCacheKey(),green:s.uniforms.uV3PaletteGreen?.value.map(x=>x.toArray()),white:s.uniforms.uV3PaletteWhite?.value.map(x=>x.toArray()),paintGain:s.uniforms.uV3LowerLegPaintGain?.value,regionCount:s.uniforms.uV3PaletteRegions?.value.length}});
  const gl=a.renderer.getContext();
  const compiled=records.map(r=>{const p=a.renderer.properties.get(r.variant).currentProgram,location=p?.program&&gl.getUniformLocation(p.program,'uV3LowerLegPaintGain');return {hasV3Palette:!!p?.cacheKey?.includes('cyclone-lower-legs-palette-v4'),gain:location?gl.getUniform(p.program,location):null}});
  return {variant:d.runtime.scottInstance.modelComparison.variant,assembly:d.runtime.transformEntry?.assemblyProgress,anime:a.state.snapshot(),uniforms,compiled,glError:gl.getError(),badPrograms:a.renderer.info.programs.filter(p=>p.program&&!gl.getProgramParameter(p.program,gl.LINK_STATUS)).length};
 })()`)
 assert.equal(report.variant,'v3');assert.equal(report.glError,0);assert.equal(report.badPrograms,0)
 if(armor)assert.equal(report.assembly,1,'Armor assembly incomplete')
 assert.ok(report.uniforms.some(x=>x.green?.length>=4),'Live V3 palette shader missing')
 assert.ok(report.compiled.some(x=>x.gain>1),'Paint compensation missing from the actual GPU program')
 await new Promise(resolve=>setTimeout(resolve,1500))
 const shot=await c.send('Page.captureScreenshot',{format:'png'})
 fs.writeFileSync(`${directory}/${label}.png`,Buffer.from(shot.data,'base64'))
 fs.writeFileSync(`${directory}/${label}.json`,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
}finally{c.close()}
