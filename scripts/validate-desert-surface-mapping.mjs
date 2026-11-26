import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'

const c=await connect({port:9334}),ev=code=>c.evaluate(code),dir='artifacts/desert-surface-mapping',wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(code,seconds=100){for(let i=0;i<seconds*4;i++){if(await ev(code).catch(()=>false))return;await wait(250)}throw Error('Timed out: '+code)}
async function frames(n=3){await ev(`new Promise(resolve=>{let n=${n};const tick=()=>{if(--n)requestAnimationFrame(tick);else resolve(true)};requestAnimationFrame(tick)})`)}
async function camera(position,target){await ev(`(()=>{const d=__MOSPEADA__,w=__FOREST_STAGE4__.world;d.setCameraMode(3);d.runtime.orbit.enableDamping=false;d.runtime.orbit.maxDistance=6000;d.runtime.orbit.minDistance=.5;d.runtime.orbit.target.set(${target.join(',')}).add(w.position);d.camera.position.set(${position.join(',')}).add(w.position);d.runtime.orbit.update();d.camera.updateMatrixWorld(true);return true})()`);await frames()}
async function capture(name){const data=await ev(`(()=>{const a=__ANIME__;a.effect.render(a.state.snapshot(),1);return a.renderer.domElement.toDataURL('image/png')})()`);fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(data.split(',')[1],'base64'))}
try{
 await until('!!window.__MOSPEADA__?.runtime.scottInstance&&!!window.__HORIZON_CARRIER__&&!document.querySelector("#entry-preloader")')
 await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false})
 await ev(`(()=>{window.__FOREST_OPENING__?.finish();const r=__MOSPEADA__.runtime,w=__FOREST_STAGE4__.world;if(!w.bound)w.bind({x:0,y:0,z:-2400});w.requestClimax();for(let i=0;i<35;i++)w.updateClimax(4400,4455);r.resetAt(w.startAt(900));r.pendingDefeatRetry=true;r.paused=false;return true})()`)
 await until('!!__DESERT_SCOUTS__.climax&&__DESERT_SCOUTS__.sequence.phase==="battle"&&!__MOSPEADA__.runtime.pendingDefeatRetry')
 await ev(`(async()=>{const d=__MOSPEADA__,r=d.runtime,w=__FOREST_STAGE4__.world,{createBikeState}=await import('/src/vehicle/bikePhysics.js');r.paused=true;r.keys={};r.combatVFX?.clear();for(let i=0;i<40;i++)w.updateClimax(4400,4455);Object.assign(r.state,createBikeState(w.startAt(4400),d.rig.metrics,d.sample));r.randEscape.resumeClimax(r.state,w);r.randEscape.protected=true;d.setCameraMode(3);return true})()`)
 await frames(8)
 const report=await ev(`(()=>{const h=__HORIZON_CARRIER__,w=__FOREST_STAGE4__.world;return{visible:h.root.visible,scale:h.placement.scale,dimensions:h.placement.size.toArray(),bounds:{min:h.placement.bounds.min.toArray(),max:h.placement.bounds.max.toArray()},ground:h.placement.ground,groundUniform:h.ground.value,anchor:w.position.toArray(),lodTriangles:h.lod.levels.map(l=>l.object.geometry.index.count/3),static:h.lod.levels.every(l=>!l.object.isSkinnedMesh&&!l.object.castShadow&&!l.object.userData.rideSurface),colliders:0}})()`)
 assert.equal(report.visible,true);assert.ok(report.dimensions[2]>900);assert.ok(report.bounds.min[0]>300);assert.deepEqual(report.lodTriangles,[70000,15000]);assert.equal(report.static,true)
 // Broad scene composition, using the live desert terrain and anime renderer.
 await camera([-100,210,-4100],[850,10,-4670]);await capture('01-general')
 // The live Scott and the original Scouts remain on the battle strip.
 await ev(`(()=>{const d=__MOSPEADA__,p=__DESERT_SCOUTS__.climax,s=d.runtime.state;for(let i=0;i<5;i++){const r=p.scouts[i],x=s.x+[-32,-12,16,35,50][i],z=s.z-65-i*13;r.position.set(x,d.sample(x,z)+3,z);r.yaw=0;r.pitch=r.bank=0;r.view.root.visible=true;p.applyView(r);r.view.motion?.update(r,.016,d.sample);r.view.motion?.sync()}return true})()`)
 await frames()
 const scott=await ev('(()=>{const s=__MOSPEADA__.runtime.state,w=__FOREST_STAGE4__.world;return{x:s.x-w.position.x,y:s.height-w.position.y,z:s.z-w.position.z}})()')
 await camera([scott.x-12,scott.y+5,scott.z+14],[scott.x+130,scott.y+12,scott.z-100]);await capture('02-combat-background')
 await camera([scott.x-6,scott.y+2.8,scott.z+10],[scott.x+85,scott.y+7,scott.z-30]);await capture('03-scale-scott')

 // Low reverse views reproduce the formerly floating old mountain edges.
 await camera([scott.x,scott.y+2.5,scott.z],[scott.x-1000,scott.y+35,-1700]);await capture('04-old-mountains-left')
 await camera([scott.x,scott.y+2.5,scott.z],[scott.x+1300,scott.y+55,-1900]);await capture('05-old-mountains-right')
 await camera([scott.x-18,scott.y+4,scott.z+16],[scott.x-1100,scott.y+30,scott.z-180]);await capture('06-new-textured-ridges')
 await camera([900,40,-3100],[1500,80,-1950]);await capture('07-originals-texture-detail')
 await camera([-2300,10,-4400],[-3400,70,-4750]);await capture('08-new-ridges-texture-detail')

 await camera([0,-17,-760],[-8,-8,-620]);await capture('09-cliff-front')
 await camera([18,-15,-678],[3,-9,-620]);await capture('10-cliff-close')
 await camera([90,-14,-705],[-110,-4,-620]);await capture('11-cliff-oblique')
 report.mapping=await ev('(()=>{const m=__FOREST_STAGE4__.materials;return{floorSampler:m.desert.map.wrapS,surfaceSamplers:m.surfaceTextures.map(t=>t.wrapS),sharedSurfaceMaps:m.mountains.map===m.cliff.map,sandShared:m.mountains.userData.desertBlend.uniforms.uDesertSand.value===m.cliff.userData.desertBlend.uniforms.uDesertSand.value,terrain:m.terrainSlopes.userData.desertSurface,cliff:m.cliff.userData.desertSurface,mountains:m.mountains.userData.desertSurface}})()')
 assert.equal(report.mapping.floorSampler,1002);assert.deepEqual(report.mapping.surfaceSamplers,[1000,1000]);assert.ok(report.mapping.sharedSurfaceMaps&&report.mapping.sandShared)
 report.mountains=await ev('(()=>{const w=__FOREST_STAGE4__.world,p=w.climaxPlain,f=p.scenery.formations;return{sharedTexturedMaterial:f.material===w.materials.mountains&&!!f.material.map,flatShading:f.material.flatShading,texture:f.material.map?.name,footingTextured:p.footing.material===f.material,visualHalfWidth:p.horizon.geometry.boundingBox.max.x,rideHalfWidth:3000,staticSkirt:!p.horizon.userData.rideSurface,sector:p.horizonSector}})()')
 assert.ok(report.mountains.sharedTexturedMaterial&&report.mountains.footingTextured);assert.ok(report.mountains.visualHalfWidth>6000)
 report.integrity=await ev(`(()=>{const a=__ANIME__;return{gl:a.renderer.getContext().getError(),shader:a.state.snapshot().error,scottVariant:__MOSPEADA__.runtime.scottInstance.modelComparison.variant,carrierLod:__HORIZON_CARRIER__.lod.getCurrentLevel()}})()`)
 assert.equal(report.integrity.gl,0);assert.equal(report.integrity.shader,'');assert.equal(report.integrity.scottVariant,'v3')
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text)
 assert.deepEqual(report.errors,[]);fs.writeFileSync(`${dir}/scene-validation.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{c.close()}
