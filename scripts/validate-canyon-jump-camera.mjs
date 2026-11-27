import assert from 'node:assert/strict'
import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
// The native game runs the actual Stage 2 geometry/materials in an isolated
// scene so camera/defeat checks do not require a second full foliage world.
const c=await connect(),dir='artifacts/canyon-jump-camera',report={},wait=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(dir,{recursive:true})
async function until(expression,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(80)}throw Error('Timed out: '+expression)}
async function key(code,down){await c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code.startsWith('Shift')?'Shift':code.slice(3).toLowerCase()})}
async function tap(code){await key(code,true);await key(code,false)}
async function photo(name){fs.writeFileSync(dir+'/'+name+'.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))}
async function reset(){await key('KeyW',false);await c.evaluate(`(()=>{const r=__MOSPEADA__.runtime,q=__CANYON_CAMERA_QA__;r.levelProgress=new q.Progress();r.resetAt(q.checkpoint());r.levelProgress.observe(r.state);return true})()`);await wait(150)}
async function sample(){return c.evaluate(`(()=>{const d=__MOSPEADA__,r=d.runtime,f=r.scottInstance.defeatMotion,T=__CANYON_CAMERA_QA__.T,hip=f?.active?f.hip.bone.getWorldPosition(new T.Vector3()):new T.Vector3(r.state.x,r.state.height+1,r.state.z),bike=r.vehicleRig.root.position.clone();const project=p=>p.clone().project(d.camera).toArray();return{pose:(()=>{const b=r.scottInstance.modelComparison.v3.retarget.bones,p=n=>b.get(n).getWorldPosition(new T.Vector3());return{hands:p('LeftHand').distanceTo(p('RightHand')),feet:p('LeftFoot').distanceTo(p('RightFoot')),flat:Math.abs(p('Head').y-p('Hips').y)}})(),scottVisible:r.scottInstance.mountedMotion.wrapper.visible,bikeVisible:r.vehicleRig.root.visible,direction:d.camera.getWorldDirection(new T.Vector3()).toArray(),phase:r.cameraController.canyonShot?.phase,angle:r.cameraController.canyonShot?.angle,outcome:r.cameraController.canyonJump.lastOutcome,position:d.camera.position.toArray(),target:r.orbit.target.toArray(),scott:hip.toArray(),bike:bike.toArray(),screenScott:project(hip),screenBike:project(bike),airBoosts:r.state.airBoostCount,crash:!!r.canyonCrash,shortFall:!!r.canyonFall,ready:!!r.defeat?.ready,settled:r.bikeDefeatMotion?.settled,orbit:r.orbit.enabled,z:r.state.z}})()`)}
try{
 await until("!!window.__MOSPEADA__?.runtime.scottInstance&&!!window.__FRONT_BATTLOID__&&!document.querySelector('#entry-preloader')",120000)
 report.glStart=await c.evaluate('__ANIME__.renderer.getContext().getError()')
 await c.evaluate(`(async()=>{
  const [T,terrain,config,{ForestStage2Progress:Progress},rides,materials,river,resources]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/world/forest/forestStage2Terrain.js'),import('/src/world/forest/forestStage2Config.js'),import('/src/world/forest/forestStage2Progress.js'),import('/src/vehicle/rideSurface.js'),import('/src/world/forest/forestCanyonMaterials.js'),import('/src/world/forest/forestCanyon.js'),import('/src/loading/resources.js')]);
  (await import('/src/world/weatherState.js')).weatherState.setPreset('sunny');
  const q=window.__CANYON_CAMERA_QA__={T,Progress,checkpoint:config.stage2Checkpoint,config,terrain,original:new Map(),group:new T.Group(),running:true};
  const disable=()=>__ANIME__.scene.traverse(o=>{if(o.isMesh&&o.userData.rideSurface&&!o.userData.canyonQA){if(!q.original.has(o))q.original.set(o,{active:o.userData.rideSurfaceActive,visible:o.visible});o.userData.rideSurfaceActive=false;o.visible=false}});disable();
  const [grass,cliff,shore]=await Promise.all(['grass-01.jpg','barranco.jpg','orilla-rio.png'].map(n=>resources.loadTexture('/assets/texturas/pasto/'+n)));for(const t of[grass,cliff,shore]){t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.MirroredRepeatWrapping}
  const g=terrain.createStage2Terrain(),ground=new T.MeshLambertMaterial({map:grass}),wall=materials.canyonEarthMaterial(cliff,{stratified:true}),bed=materials.canyonShoreMaterial(shore,grass);
  for(const geometry of g.tops){const mesh=new T.Mesh(geometry,ground);Object.assign(mesh.userData,{canyonQA:true,rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:config.stage2EarthWeight});q.group.add(mesh)}
  const cliffMesh=new T.Mesh(g.cliffs,wall);cliffMesh.userData.rideBarrier=true;q.group.add(cliffMesh,new T.Mesh(g.bed,bed));const water=materials.canyonRiverMaterial();q.group.add(new T.Mesh(river.createRiverGeometry(),water.material));q.water=water;
  __ANIME__.scene.add(q.group);q.group.updateMatrixWorld(true);q.unregister=rides.registerRideSurfaces(q.group);
  const tick=()=>{if(!q.running)return;disable();q.water.time.value+=1/60;requestAnimationFrame(tick)};requestAnimationFrame(tick);return true
 })()`)
 await tap('KeyV');await reset();await key('KeyW',true)
 await until('__MOSPEADA__.runtime.state.airborne&&__MOSPEADA__.runtime.state.z<-795');await wait(120);await tap('ShiftLeft')
 await until('__MOSPEADA__.runtime.cameraController.canyonShot?.angle>3.13')
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.halfTurn=await sample();assert.ok(report.halfTurn.angle>=Math.PI-.02);await photo('01-airborne-180')
 await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await key('KeyW',true)
 await until("__MOSPEADA__.runtime.cameraController.canyonJump.lastOutcome?.kind==='success'&&!__MOSPEADA__.runtime.cameraController.canyonShot")
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.success=await sample();assert.equal(report.success.crash,false);assert.equal(report.success.airBoosts,1);assert.ok(Math.abs(report.success.outcome.angle-Math.PI*2)<.02);assert.equal(report.success.orbit,true);await photo('02-success-360-follow')
 await reset();await key('KeyW',true);await until('!!__MOSPEADA__.runtime.canyonFall&&__MOSPEADA__.runtime.scottInstance.defeatMotion.age>.45')
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.shortHidden=await sample();assert.equal(report.shortHidden.phase,'conceal');assert.equal(report.shortHidden.scottVisible,true);assert.equal(report.shortHidden.bikeVisible,true);assert.ok(Math.abs(report.shortHidden.screenScott[1])>1||report.shortHidden.screenScott[2]>1);assert.ok(report.shortHidden.position[2]<-930&&report.shortHidden.direction[2]>.999);await photo('03-short-jump-hidden')
 await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await until("__MOSPEADA__.runtime.cameraController.canyonShot?.phase==='approach'&&__MOSPEADA__.runtime.cameraController.canyonShot.age>.2")
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.approach=await sample();assert.ok(report.approach.ready&&report.approach.direction[2]>.999);assert.ok(report.approach.position[2]>report.shortHidden.position[2]);assert.equal(report.approach.position[1],report.shortHidden.position[1]);await photo('07-approach-from-opposite-bank')
 await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await until("__MOSPEADA__.runtime.cameraController.canyonShot?.phase==='reveal'&&__MOSPEADA__.runtime.cameraController.canyonShot.age>.4")
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.tilt=await sample();assert.ok(report.tilt.direction[1]<0&&report.tilt.direction[2]>0);assert.equal(report.tilt.position[1],report.shortHidden.position[1]);await photo('08-downward-tilt')
 await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await until("__MOSPEADA__.runtime.cameraController.canyonShot?.phase==='settled'")
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.shortRest=await sample();assert.ok(report.shortRest.ready&&report.shortRest.settled&&report.shortRest.scottVisible&&report.shortRest.bikeVisible);assert.ok(report.shortRest.direction[1]<-.9999);assert.ok(report.shortRest.pose.hands>1&&report.shortRest.pose.feet>.5&&report.shortRest.pose.flat<.15);assert.ok(report.shortRest.scott[1]<-20&&report.shortRest.bike[1]<-20);assert.equal(report.shortRest.position[1],report.shortHidden.position[1])
 for(const point of[report.shortRest.screenScott,report.shortRest.screenBike])assert.ok(Math.abs(point[0])<.9&&Math.abs(point[1])<.9)
 await photo('04-short-jump-bodies-on-floor')
 await reset();await c.evaluate(`(()=>{const q=__CANYON_CAMERA_QA__,d=__MOSPEADA__,r=d.runtime,wall= q.T;return true})()`)
 await c.evaluate(`(async()=>{const {canyonWallPoint}=await import('/src/world/forest/forestCanyon.js'),q=__CANYON_CAMERA_QA__,r=__MOSPEADA__.runtime,w=canyonWallPoint(q.config.stage2PathX(-930),.15,true,q.terrain.stage2Height),s=r.state;Object.assign(s,{x:w.x,z:w.z+5,height:w.y-.85,frontSpring:w.y-.85,rearSpring:w.y-.85,frontVelocity:-2,rearVelocity:-2,verticalVelocity:-2,airborne:true,frontGrounded:false,rearGrounded:false,frontOverVoid:true,rearOverVoid:true,speed:40,parked:false,idleBlend:0});r.cameraController.reset(s);return true})()`)
 await key('KeyW',true);await until('!!__MOSPEADA__.runtime.canyonCrash');await wait(180)
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.wallHidden=await sample();assert.equal(report.wallHidden.phase,'conceal');assert.equal(report.wallHidden.scottVisible,true);assert.equal(report.wallHidden.bikeVisible,true);assert.ok(Math.abs(report.wallHidden.screenScott[1])>1||report.wallHidden.screenScott[2]>1);await photo('05-wall-impact-hidden')
 await c.evaluate('__MOSPEADA__.runtime.paused=false;true');await until("__MOSPEADA__.runtime.cameraController.canyonShot?.phase==='settled'")
 await c.evaluate('__MOSPEADA__.runtime.paused=true;true');report.wallRest=await sample();assert.ok(report.wallRest.ready&&report.wallRest.settled&&report.wallRest.scottVisible&&report.wallRest.bikeVisible);assert.ok(report.wallRest.direction[1]<-.9999);assert.ok(report.wallRest.pose.hands>1&&report.wallRest.pose.feet>.5&&report.wallRest.pose.flat<.15);for(const point of[report.wallRest.screenScott,report.wallRest.screenBike])assert.ok(Math.abs(point[0])<.9&&Math.abs(point[1])<.9);await photo('06-wall-bodies-on-floor')
 await reset();report.retry=await sample();assert.equal(report.retry.crash,false);assert.equal(report.retry.shortFall,false);assert.equal(report.retry.orbit,true)
 report.gl=await c.evaluate('__ANIME__.renderer.getContext().getError()');report.consoleErrors=c.events.filter(e=>e.method==='Log.entryAdded'&&e.params.entry.level==='error').map(e=>e.params.entry.text)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);assert.deepEqual(report.errors,[])
 fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));assert.equal(report.gl,0)
}catch(error){console.log(JSON.stringify(report,null,2));throw error}finally{
 for(const code of['KeyW','ShiftLeft'])await key(code,false).catch(()=>{})
 await c.evaluate(`if(window.__CANYON_CAMERA_QA__){const q=__CANYON_CAMERA_QA__;q.running=false;q.unregister();__ANIME__.scene.remove(q.group);for(const[o,old]of q.original){o.visible=old.visible;o.userData.rideSurfaceActive=old.active}q.group.traverse(m=>m.geometry?.dispose())};true`).catch(()=>{})
 await c.send('Browser.close').catch(()=>{});c.close()
}
