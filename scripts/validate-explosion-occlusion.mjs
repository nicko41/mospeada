import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir='artifacts/explosion-occlusion',report={},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ev=code=>c.evaluate(code)
fs.mkdirSync(dir,{recursive:true})
const frames=()=>ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
const capture=async name=>{const url=await ev('__ANIME__.effect.render(__ANIME__.state.snapshot(),1);__ANIME__.renderer.domElement.toDataURL()');fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(url.split(',')[1],'base64'))}
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1000,height:1000,deviceScaleFactor:1,mobile:false})
 let ready=false
 for(let i=0;i<720;i++){if(await ev('!!window.__MOSPEADA__?.runtime.combatVFX&&!!window.__FOREST_STAGE4__&&window.__ANIME__?.state.snapshot().ready&&!document.querySelector("#entry-preloader")').catch(()=>false)){ready=true;break}await wait(250)}
 assert.ok(ready,'Game and combat renderer are ready')
 await ev(`(async()=>{window.__FOREST_OPENING__?.finish();const T=await import('/node_modules/.vite/deps/three.js'),d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});r.resetAt(w.startAt(900));r.paused=true;r.transformEntry.store.set({inspection:true});r.transformEntry.scrub(1);window.__OCCLUSION_QA__={T,fx:r.combatVFX};return true})()`)
 await frames()
 await ev(`(()=>{const r=__MOSPEADA__.runtime;if(!r.armorController.activate())throw Error('Armor did not activate');r.armorController.sync();r.armorController.camera.yaw=r.state.yaw;r.armorController.camera.pitch=.08;r.armorController.camera.intro=1;return true})()`)
 await wait(500);await frames()
 await ev(`(()=>{
  const q=__OCCLUSION_QA__,d=__MOSPEADA__,r=d.runtime,T=q.T,fx=q.fx
  fx.clear(true);q.context=r.desertPatrol?.active?r.desertPatrol:r.gallant
  const center=r.scottInstance.bones.get('mixamorigSpine2').getWorldPosition(new T.Vector3()),forward=d.camera.getWorldDirection(new T.Vector3()),right=new T.Vector3(1,0,0).applyQuaternion(d.camera.quaternion)
  forward.y=0;forward.normalize();q.point=center.clone().addScaledVector(forward,9).addScaledVector(right,-.7)
  fx.destroyTarget({position:q.point.clone().add(new T.Vector3(0,-5.2*.48,0)),height:5.2,dead:true});fx.update(0,q.context,r.gallant.weapon,d.camera)
  q.materials=[fx.impacts.halos.material,...[1,2,4].map(i=>fx.systemBatches[i].material)]
  q.setDepth=enabled=>{for(const m of q.materials)m.depthTest=enabled;for(const record of __ANIME__.effect.records.values())if(q.materials.includes(record.source))record.variant.depthTest=enabled}
  q.read=()=>{const a=__ANIME__,g=a.renderer.getContext();a.effect.render(a.state.snapshot(),1);const p=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,p);return p}
  q.measure=()=>{
   const a=__ANIME__,renderer=a.renderer,w=renderer.domElement.width,h=renderer.domElement.height,scene=d.scene,hidden=[],target=new T.WebGLRenderTarget(w,h),white=new T.MeshBasicMaterial({color:'white',fog:false,side:T.DoubleSide}),mask=new Uint8Array(w*h*4)
   const background=scene.background,fog=scene.fog,override=scene.overrideMaterial,auto=renderer.autoClear,renderTarget=renderer.getRenderTarget(),shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,clear=renderer.getClearColor(new T.Color()).clone(),alpha=renderer.getClearAlpha()
   scene.traverse(o=>{if(!o.isMesh&&!o.isSprite&&!o.isLine&&!o.isPoints)return;let hero=false;for(let n=o;n;n=n.parent)if(n===r.scottInstance.model||n===r.vehicleRig.root)hero=true;if(!hero){hidden.push([o,o.visible]);o.visible=false}})
   try{scene.background=new T.Color('black');scene.fog=null;scene.overrideMaterial=white;renderer.autoClear=true;renderer.shadowMap.autoUpdate=renderer.shadowMap.needsUpdate=false;renderer.setRenderTarget(target);renderer.setClearColor('black',1);renderer.render(scene,d.camera);renderer.readRenderTargetPixels(target,0,0,w,h,mask)}
   finally{for(const[o,visible]of hidden)o.visible=visible;scene.background=background;scene.fog=fog;scene.overrideMaterial=override;renderer.autoClear=auto;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.setRenderTarget(renderTarget);renderer.setClearColor(clear,alpha);white.dispose();target.dispose()}
   const on=q.read(),rootVisible=fx.root.visible,batches=[...fx.batches].map(b=>[b,b.visible]);fx.root.visible=false;for(const[b]of batches)b.visible=false
   const off=q.read();fx.root.visible=rootVisible;for(const[b,visible]of batches)b.visible=visible
   let interior=0,leaked=0,outside=0
   for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
    const i=(y*w+x)*4,inside=mask[i]>250&&mask[i-12]>250&&mask[i+12]>250&&mask[i-12*w]>250&&mask[i+12*w]>250
    const changed=Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>6
    if(inside){interior++;if(changed)leaked++}else if(mask[i]<20&&changed)outside++
   }
   return{interiorPixels:interior,leakedPixels:leaked,visibleExplosionPixels:outside}
  }
  return true
 })()`)
 const step=seconds=>ev(`(()=>{const q=__OCCLUSION_QA__,d=__MOSPEADA__;for(let t=0;t<${seconds};t+=1/120){__MOSPEADA_VFX__.vfx.update(1/120);q.fx.update(1/120,q.context,d.runtime.gallant.weapon,d.camera)}return true})()`)
 await step(.12);await frames()
 report.fixedIgnition=await ev('__OCCLUSION_QA__.measure()');await capture('01-armor-explosion-behind-fixed')
 await ev('__OCCLUSION_QA__.setDepth(false);true')
 report.previousIgnition=await ev('__OCCLUSION_QA__.measure()');await capture('02-previous-depth-disabled-regression')
 await ev('__OCCLUSION_QA__.setDepth(true);true')
 await step(.14);await frames();report.fixedFire=await ev('__OCCLUSION_QA__.measure()');await capture('03-armor-fire-and-halo-occluded')
 await step(.6);await frames();report.fixedSmoke=await ev('__OCCLUSION_QA__.measure()');await capture('04-armor-smoke-behind')
 assert.ok(report.previousIgnition.leakedPixels>100,'Regression reproduces the explosion painting over Scott')
 for(const result of[report.fixedIgnition,report.fixedFire,report.fixedSmoke]){
  assert.ok(result.interiorPixels>10000,'Mask covers the real Scott skin and Armor geometry')
  assert.ok(result.leakedPixels<=result.interiorPixels*.002,'Opaque Scott and Armor hide the explosion behind them')
  assert.ok(result.visibleExplosionPixels>200,'Explosion remains visible around the silhouette')
 }
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await ev('window.__OCCLUSION_QA__?.setDepth?.(true);if(window.__MOSPEADA__){__MOSPEADA__.runtime.paused=true;__MOSPEADA__.runtime.keys={}};true').catch(()=>{});c.close()}
