import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),ev=s=>c.evaluate(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),dir='artifacts/scout-right-leg'
fs.mkdirSync(dir,{recursive:true})
try{
 let ready=false;for(let i=0;i<600;i++){if(await ev('!!window.__MOSPEADA__?.runtime.state&&!!window.__FOREST_STAGE4__?.world&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}await wait(250)}assert.ok(ready)
 await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 const report=await ev(`(async()=>{
  window.__FOREST_OPENING__?.finish();const T=await import('/node_modules/.vite/deps/three.js'),{GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),{createScoutView}=await import('/src/world/forest/invidScoutAsset.js'),{createScoutSquad,renderScoutSquad}=await import('/src/world/forest/scoutSquadRendering.js'),d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world
  if(!w.bound)w.bind({x:0,y:0,z:-2400});r.resetAt(w.startAt(950));r.paused=true;r.keys={};const origin=new T.Vector3(r.state.x,r.state.height+3,r.state.z-10),focus=origin.clone().add(new T.Vector3(0,3,0)),loader=new GLTFLoader(),assets=await Promise.all([loader.loadAsync('/.local/invid-scout-before-leg-fix.glb'),loader.loadAsync('/models/mospeada/invid-scout-rigged.glb?leg-seam-qa')]),views=assets.map((a,i)=>{const v=createScoutView(a.scene,90+i,a.animations);v.root.position.copy(origin);v.root.visible=true;v.motion.reset();const action=v.motion.select('Hover',true);action.time=0;v.motion.mixer.update(0);v.motion.sync();return v}),groups=views.map(v=>{const group=new T.Group();d.scene.add(group);const squad=createScoutSquad(group,[v]);squad.scouts=[{view:v}];return {group,squad}}),q=window.__SCOUT_LEG_QA__={T,views,groups,origin,focus,renderScoutSquad}
  q.render=(which,angle)=>{for(let i=0;i<groups.length;i++)groups[i].group.visible=i===which;d.camera.position.copy(focus).add(new T.Vector3(...angle));d.camera.lookAt(focus);d.camera.fov=38;d.camera.updateProjectionMatrix();d.camera.updateMatrixWorld(true);renderScoutSquad(groups[which].squad,d.camera.position);__ANIME__.effect.render(__ANIME__.state.snapshot(),1);return __ANIME__.renderer.domElement.toDataURL()}
  const g=__ANIME__.renderer.getContext(),read=()=>{const out=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,out);return out},images=[],stats=[]
  for(const [i,angle]of [[-6,1,7],[6,1,7],[-8,1,0]].entries()){
   images.push({name:'before-'+i,image:q.render(0,angle)});const before=read();images.push({name:'after-'+i,image:q.render(1,angle)});const after=read();let changed=0;for(let p=0;p<before.length;p+=4)if(Math.abs(before[p]-after[p])+Math.abs(before[p+1]-after[p+1])+Math.abs(before[p+2]-after[p+2])>15)changed++;stats.push({angle,changed})
  }
  return{images,stats,gl:g.getError(),shader:__ANIME__.state.snapshot().error}
 })()`)
 for(const item of report.images)fs.writeFileSync(dir+'/'+item.name+'.png',Buffer.from(item.image.split(',')[1],'base64'));delete report.images
 assert.ok(report.stats.some(s=>s.changed>50));assert.equal(report.gl,0);assert.equal(report.shader,'')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 report.rigManifest=JSON.parse(fs.readFileSync('public/models/mospeada/invid-scout-rigged-manifest.json'));report.originalHash=crypto.createHash('sha256').update(fs.readFileSync('assets/invid/scout/invid-scout.glb')).digest('hex')
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rigManifest:undefined},null,2))
}finally{c.close()}
