import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/canyon-textures',wait=ms=>new Promise(r=>setTimeout(r,ms)),report={}
fs.mkdirSync(dir,{recursive:true})
try{
 for(let i=0;i<1200;i++){if(await c.evaluate('!!window.__MOSPEADA__?.runtime.scottInstance&&!document.querySelector("#entry-preloader")'))break;await wait(100)}
 report.glStart=await c.evaluate('__ANIME__.renderer.getContext().getError()')
 await c.evaluate(`(async()=>{
  const [T,terrain,M,resources,rides]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/world/forest/forestStage2Terrain.js'),import('/src/world/forest/forestCanyonMaterials.js'),import('/src/loading/resources.js'),import('/src/vehicle/rideSurface.js')]);
  const r=__MOSPEADA__.runtime;r.paused=true;r.cameraController.updateCanyon=()=>false;r.cameraController.update=()=>{};
  __ANIME__.scene.traverse(m=>{if(m.isMesh&&m.userData.rideSurface)m.visible=false});
  (await import('/src/world/weatherState.js')).weatherState.setPreset('sunny');
  const textures=await Promise.all(['grass-01.jpg','dirt01.jpg','barranco.jpg','orilla-rio.png'].map(n=>resources.loadTexture('/assets/texturas/pasto/'+n)));
  for(const t of textures){t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.generateMipmaps=true}
  const [grass,dirt,cliff,shore]=textures,g=terrain.createStage2Terrain(),ground=M.stage2GroundMaterial(grass,dirt),wall=M.canyonEarthMaterial(cliff,{stratified:true}),bed=M.canyonShoreMaterial(shore,grass),group=new T.Group();
  for(const geometry of g.tops)group.add(new T.Mesh(geometry,ground));group.add(new T.Mesh(g.cliffs,wall),new T.Mesh(g.bed,bed));
  const river=await import('/src/world/forest/forestCanyon.js'),water=M.canyonRiverMaterial();group.add(new T.Mesh(river.createRiverGeometry(),water.material));
  __ANIME__.scene.add(group);group.updateMatrixWorld(true);window.__CANYON_TEXTURE_QA__={T,group,materials:[ground,wall,bed,water.material]};return true
 })()`)
 for(const[name,position,target]of[
  ['01-overhead-canyon',[1.27,13,-901.18],[1.27,-32,-901.179]],
  ['02-grass-bank-detail',[10,-20,-897],[10,-33,-896.999]],
  ['03-cliff-face',[1,-5,-885],[1,-8,-928]],
  ['04-upper-grass',[20,18,-970],[20,9,-969.999]],
 ]){
  await c.evaluate(`(()=>{const d=__MOSPEADA__,p=${JSON.stringify(position)},t=${JSON.stringify(target)};d.camera.position.fromArray(p);d.runtime.orbit.target.fromArray(t);d.camera.lookAt(d.runtime.orbit.target);d.camera.updateMatrixWorld(true);return true})()`);await wait(250)
  fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
 }
 report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);assert.equal(report.gl,0);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}finally{await c.send('Browser.close').catch(()=>{});c.close()}
