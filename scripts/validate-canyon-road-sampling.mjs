import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const dir='artifacts/canyon-road-sampling';fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(dir+'/inspect.html','<!doctype html><html><body style="margin:0"></body></html>')
const c=await connect(),ev=code=>c.evaluate(code),report={},wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(code,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){if(await ev(code).catch(()=>false))return;await wait(150)}throw Error('Timed out: '+code)}
async function photo(name){fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
// Restore only the old fixed soil crop in a QA material. Live materials never
// expose this switch; the grass, masks and lighting are shared in the A/B.
const beforeFactory=String.raw`function beforeMaterial(M,T,grass,dirt){
 const m=M.stage2GroundMaterial(grass,dirt),compile=m.onBeforeCompile;
 m.onBeforeCompile=shader=>{compile(shader);const original=shader.fragmentShader;shader.fragmentShader=original.replace(/vec2 groundUv=vStage2Ground\/6\.0,dirtUv=[\s\S]*?diffuseColor\*=groundPaint;/,'vec2 groundUv=vStage2Ground/6.0;diffuseColor*=mix(texture2D(map,groundUv),texture2D(stage2Dirt,groundUv),stage2Earth(vStage2Ground));');if(shader.fragmentShader===original)throw Error('QA old crop did not match');const soil=shader.uniforms.stage2Dirt.value;soil.wrapS=soil.wrapT=T.RepeatWrapping;soil.needsUpdate=true};
 m.customProgramCacheKey=()=> 'qa-stage2-fixed-soil';return m;
}`.replaceAll(String.fromCharCode(92,92),String.fromCharCode(92))
try{
 await c.send('Page.navigate',{url:'http://127.0.0.1:5173/'+dir+'/inspect.html'})
 await until(`document.documentURI.endsWith('/${dir}/inspect.html')&&document.readyState==='complete'`,10000)
 await ev(`(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),M=await import('/src/world/forest/forestCanyonMaterials.js'),{loadTexture}=await import('/src/loading/resources.js');
  ${beforeFactory}
  const [grass,dirt]=await Promise.all(['grass-01.jpg','dirt01.jpg'].map(n=>loadTexture('/assets/texturas/pasto/'+n)));
  for(const t of [grass,dirt]){t.colorSpace=T.SRGBColorSpace;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.generateMipmaps=true;t.anisotropy=8}
  const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(800,1200);document.body.appendChild(renderer.domElement);
  const scene=new T.Scene();scene.add(new T.AmbientLight(0xffffff,1));const camera=new T.OrthographicCamera(-20,20,30,-30,.1,100);camera.position.set(1.258397959,30,-650);camera.up.set(0,0,-1);camera.lookAt(1.258397959,0,-650);
  const geometry=new T.PlaneGeometry(40,60);geometry.rotateX(-Math.PI/2);geometry.translate(1.258397959,0,-650);
  const before=beforeMaterial(M,T,grass,dirt),after=M.stage2GroundMaterial(grass,dirt),mesh=new T.Mesh(geometry,before);scene.add(mesh);window.__ROAD_QA__={renderer,scene,camera,mesh,before,after,frames:[]};return true
 })()`)
 for(const name of ['before','after']){
  const png=await ev(`(()=>{const q=__ROAD_QA__;q.mesh.material=q.${name};q.renderer.render(q.scene,q.camera);const pixels=new Uint8Array(800*1200*4);q.renderer.getContext().readPixels(0,0,800,1200,6408,5121,pixels);q.frames.push(pixels);return q.renderer.domElement.toDataURL('image/png').split(',')[1]})()`)
  fs.writeFileSync(dir+'/00-overhead-'+name+'.png',Buffer.from(png,'base64'))
 }
 report.surface=await ev(`(()=>{
  const q=__ROAD_QA__,[before,after]=q.frames,W=800,H=1200,lum=(data,i)=>data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
  const correlation=data=>{let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;for(let y=10;y<H-130;y++)for(let x=383;x<417;x++){const a=lum(data,(y*W+x)*4),b=lum(data,((y+120)*W+x)*4);n++;sx+=a;sy+=b;sxx+=a*a;syy+=b*b;sxy+=a*b}return(n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy))};
  let grassDelta=0;for(let y=10;y<H-10;y++)for(let x=560;x<700;x++)for(let k=0;k<3;k++)grassDelta=Math.max(grassDelta,Math.abs(before[(y*W+x)*4+k]-after[(y*W+x)*4+k]));
  return {oldSixMetreCorrelation:correlation(before),newSixMetreCorrelation:correlation(after),maximumGrassPixelChange:grassDelta,gl:q.renderer.getContext().getError()}
 })()`)
 assert.equal(report.surface.gl,0);assert.equal(report.surface.maximumGrassPixelChange,0);assert.ok(report.surface.oldSixMetreCorrelation>.97);assert.ok(report.surface.newSixMetreCorrelation<.7)
 console.log('Surface:',JSON.stringify(report.surface))
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
 await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest&intro=1'})
 await until("!!window.__FOREST_STAGE2__&&!!window.__MOSPEADA__?.runtime.scottInstance&&!document.querySelector('#entry-preloader')")
 await ev(`(async()=>{window.__FOREST_OPENING__?.finish();const T=await import('/node_modules/.vite/deps/three.js'),M=await import('/src/world/forest/forestCanyonMaterials.js'),{loadTexture}=await import('/src/loading/resources.js');${beforeFactory};const [grass,dirt]=await Promise.all(['grass-01.jpg','dirt01.jpg'].map(n=>loadTexture('/assets/texturas/pasto/'+n)));window.__ROAD_GAME_QA__={current:__FOREST_STAGE2__.ground,old:beforeMaterial(M,T,grass,dirt)};return true})()`)
 for(const [name,z]of [['01-first-hill',-515],['02-approach',-655],['03-landing-bank',-970]]){
  await ev(`(async()=>{const r=__MOSPEADA__.runtime,q=__ROAD_GAME_QA__,{stage2PathX}=await import('/src/world/forest/forestStage2Config.js'),z=${z},x=stage2PathX(z);r.resetAt({x,z,yaw:Math.PI,label:'Canyon road QA'});r.keys={};r.paused=true;r.cameraController.update=()=>{};__MOSPEADA__.camera.position.set(x+2.4,r.state.height+2.4,z+3.7);r.orbit.target.set(x,r.state.height+1.0,z-5);__MOSPEADA__.camera.lookAt(r.orbit.target);__MOSPEADA__.camera.updateMatrixWorld(true);q.meshes=[];__ANIME__.scene.traverse(m=>{if(m.material===q.current)q.meshes.push(m)});return true})()`)
  for(const state of ['before','after']){
   await ev(`(()=>{const q=__ROAD_GAME_QA__;q.meshes.forEach(m=>m.material=q.${state==='before'?'old':'current'});__ANIME__.effect.collect();return true})()`);await wait(200);await photo(name+'-'+state)
  }
 }
 report.game=await ev(`({gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error})`)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
 assert.equal(report.game.gl,0);assert.equal(report.game.shader,'');assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 if(!process.env.MOSPEADA_KEEP_QA)await c.send('Browser.close').catch(()=>{});c.close()
}
