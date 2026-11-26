import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect({port:9365,urlPrefix:''}),directory='artifacts/desert-material-diagnostic'
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={modes:[]}
const origin=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:5173'
let captureEventStart=0
fs.mkdirSync(directory,{recursive:true})
async function until(expression,timeout=300000){const start=Date.now();while(Date.now()-start<timeout){if(await c.evaluate(expression).catch(()=>false))return;await sleep(500)}throw Error('Timed out: '+expression)}
try{
  await c.send('Network.enable')
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await c.send('Network.setCacheDisabled',{cacheDisabled:false})
  await c.send('Log.clear')
  const url=process.argv.includes('--reuse')?await c.evaluate('location.href'):origin+'/?intro=0&desertQA='+Date.now()
  report.url=url
  if(!process.argv.includes('--reuse')){
    await c.send('Page.navigate',{url})
    await until(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`)
  }
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
  await until('window.__ANIME__?.state.snapshot().openingReady&&window.__FOREST_STAGE4__?.world.userData.streamingPrepared&&Object.entries(window.__STREAMING__?.states||{}).every(([id,s])=>s.phase==="ready"||id==="stage4"&&s.phase==="prepared")')
  await c.evaluate(`(async()=>{
    const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;
    r.opening.finish();r.paused=true;__ANIME__.effect.allowBackgroundWork=()=>false;
    if(!w.bound)w.bind({x:0,y:0,z:-2400});
    r.resetAt({...w.startAt(1700),x:130,climax:false});r.paused=true;
    window.__DESERT_CAMERA_UPDATE__=r.cameraController.update;r.cameraController.update=()=>{};
    const module=await import('/scripts/desert-material-isolation.js');
    window.__DESERT_DIAGNOSTIC__=module.isolateDesert({scene:d.scene,world:w,runtime:r,effect:__ANIME__.effect,vfx:__MOSPEADA_VFX__,weatherStore:__CYCLONE_WEATHERING__.store});
    return true;
  })()`)
  await sleep(1500)
  report.fixture=await c.evaluate(`(()=>{
    const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;
    // Freeze frame callbacks for identical lighting, particles and camera.
    window.__DESERT_RAF__=window.requestAnimationFrame;window.__DESERT_PENDING_RAF__=[];
    window.requestAnimationFrame=fn=>{__DESERT_PENDING_RAF__.push(fn);return -1};
    const x=130,z=w.position.z-1700,y=d.sample(x,z);
    __ANIME__.renderer.setPixelRatio(1);__ANIME__.renderer.setSize(1440,960,false);d.camera.aspect=1.5;d.camera.updateProjectionMatrix();
    d.camera.position.set(x,y+3,z+4);d.camera.lookAt(x,y+.1,z-18);d.camera.updateMatrixWorld();
    window.__DESERT_CAPTURE__=(mode)=>{
      const q=__DESERT_DIAGNOSTIC__,a=__ANIME__,state=a.state.snapshot();q.set(mode);
      a.effect.render(state,1);const canvas=document.createElement('canvas');canvas.width=a.renderer.domElement.width;canvas.height=a.renderer.domElement.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(a.renderer.domElement,0,0);
      const roi={x:Math.floor(canvas.width*.08),y:Math.floor(canvas.height*.55),width:Math.floor(canvas.width*.84),height:Math.floor(canvas.height*.40)},pixels=ctx.getImageData(roi.x,roi.y,roi.width,roi.height).data;
      window.__DESERT_PIXELS__||={};__DESERT_PIXELS__[mode]=pixels;
      const ref=__DESERT_PIXELS__['dynamics-off'];let changed=0,max=0,sum=0;
      if(ref)for(let i=0;i<pixels.length;i+=4){let delta=0;for(let k=0;k<3;k++){const v=Math.abs(pixels[i+k]-ref[i+k]);delta=Math.max(delta,v);sum+=v}if(delta)changed++;max=Math.max(max,delta)}
      return {mode,png:canvas.toDataURL('image/png').split(',')[1],roi,changedPixels:ref?changed:null,maxChannelDifference:ref?max:null,meanAbsoluteChannelDifference:ref?sum/(pixels.length/4*3):null,glError:a.renderer.getContext().getError()};
    };
    const maps=[...new Set(__DESERT_DIAGNOSTIC__.originals.values())].flatMap(m=>[m.map,m.userData.desertBlend.uniforms.uDesertSand.value]);
    const alpha=[...new Set(maps)].map(t=>{const canvas=document.createElement('canvas');canvas.width=t.image.width;canvas.height=t.image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(t.image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let min=255,max=0;for(let i=3;i<data.length;i+=4){min=Math.min(min,data[i]);max=Math.max(max,data[i])}return {uuid:t.uuid,min,max}});
    return {x,z,y,camera:d.camera.position.toArray(),audit:__DESERT_DIAGNOSTIC__.audit,alpha};
  })()`)
  await sleep(500)
  const setupMessages=c.events.filter(e=>e.method==='Log.entryAdded'&&e.params.entry.url===url&&/WebGL|INVALID|shader error/i.test(e.params.entry.text)).map(e=>e.params.entry.text)
  report.setupWebglMessages=[...new Set(setupMessages)].map(text=>({text,count:setupMessages.filter(t=>t===text).length}))
  captureEventStart=c.events.length
  report.captureStartedAt=new Date().toISOString()
  // Reference first, then A/B in the very same frozen scene.
  for(const mode of ['dynamics-off','original','no-pebbles','blend-only','base-detail','base-sand','dynamics-off-repeat']){
    const result=await c.evaluate(`__DESERT_CAPTURE__(${JSON.stringify(mode==='dynamics-off-repeat'?'dynamics-off':mode)})`)
    fs.writeFileSync(directory+'/'+mode+'.png',Buffer.from(result.png,'base64'));delete result.png;result.name=mode
    report.modes.push(result);console.log(JSON.stringify(result));assert.equal(result.glError,0)
  }
  const captureEvents=c.events.slice(captureEventStart)
  report.errors=captureEvents.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails)
  report.webgl=captureEvents.filter(e=>e.method==='Log.entryAdded'&&/WebGL|INVALID|shader error/i.test(e.params.entry.text)).map(e=>e.params.entry)
  assert.ok(report.modes.find(m=>m.name==='no-pebbles').changedPixels>0)
  assert.ok(report.modes.find(m=>m.name==='original').maxChannelDifference<=1,'Dynamic systems do not produce the ground pattern')
  assert.equal(report.modes.at(-1).changedPixels,0,'Reference is exactly reproducible')
  assert.deepEqual(report.errors,[])
  assert.deepEqual(report.webgl,[])
  report.pass=true
}finally{
  await c.evaluate(`(()=>{if(!window.__DESERT_DIAGNOSTIC__)return;${process.argv.includes('--leave-base')&&report.pass?"__DESERT_DIAGNOSTIC__.set('base-detail');":"__DESERT_DIAGNOSTIC__.restore();__MOSPEADA__.runtime.cameraController.update=__DESERT_CAMERA_UPDATE__;"}if(window.__DESERT_RAF__){window.requestAnimationFrame=__DESERT_RAF__;for(const fn of __DESERT_PENDING_RAF__)requestAnimationFrame(fn)}return true})()`).catch(()=>{})
  fs.writeFileSync(directory+'/material-isolation.json',JSON.stringify(report,null,2))
  if(!process.argv.includes('--leave-base'))await c.send('Page.navigate',{url:'about:blank'}).catch(()=>{})
  c.close()
}
