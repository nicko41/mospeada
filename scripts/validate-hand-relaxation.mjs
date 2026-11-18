import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/hand-relaxation', wait = ms => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(directory, { recursive: true })
async function settle() {
  await c.evaluate(`(async()=>{const {updateScottGameplay}=await import('/src/vehicle/scottGameplay.js'),a=__SCOTT_ORIGINAL__,d=__MOSPEADA__;d.runtime.paused=false;for(let i=0;i<8;i++)updateScottGameplay(a.instance,a.authored,[...a.source.animations,...a.authored.clips],d.runtime,a.wrapper.current,.1);d.runtime.paused=true})()`)
}
async function shot(name) {
  await wait(250)
  fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
try {
  for(let i=0;i<500;i++){if(await c.evaluate('!!window.__SCOTT_ORIGINAL__?.instance.hands?.length && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false))break;await wait(200)}
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.evaluate(`(async()=>{const {requestRiderToggle}=await import('/src/vehicle/riderPresence.js'),{advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__;d.reset('highway');const s=d.runtime.state,config={...d.config,dismountDuration:d.runtime.scottData.duration,mountAnchor:d.runtime.scottData.keyPoses[0].pelvis};requestRiderToggle(s,config);for(let i=0;i<600;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample,()=>true,config,()=>true);d.rig.update(s,d.sample,d.config);d.runtime.paused=true;})()`)
  await settle(); await wait(400)
  const report = await c.evaluate(`(()=>{const a=__SCOTT_ORIGINAL__,h=a.instance.hands[0],g=h.geometry,source=h.source;return{mode:__MOSPEADA__.runtime.state.riderMode,originalClips:a.source.animations.length,bones:a.instance.bones.size,modifiedVertices:h.affected.length,activeVariant:a.instance.skins[0].mesh.geometry===h.geometry,sameBindPositions:g.attributes.position===source.attributes.position,sameWeights:g.attributes.skinWeight===source.attributes.skinWeight,sameIndices:g.attributes.skinIndex===source.attributes.skinIndex,sourceHasMorph:Object.keys(source.morphAttributes).length>0,seat:__MOSPEADA__.rig.surfaces.filter(m=>m.userData.sourcePiece==='rear_sit + rear_sit').map(m=>({roughness:m.material.roughness,metalness:m.material.metalness,shine:m.material.userData.animeSurfaceShine}))}})()`)
  assert.equal(report.mode, 'onFoot'); assert.equal(report.originalClips, 16); assert.equal(report.bones, 24)
  assert.ok(report.activeVariant && report.sameBindPositions && report.sameWeights && report.sameIndices && !report.sourceHasMorph)
  for (const state of ['before', 'after']) {
    await c.evaluate(`__SCOTT_ORIGINAL__.instance.hands.forEach(h=>h.update('${state === 'before' ? 'mounting' : 'onFoot'}',1))`)
    for (const view of ['front', 'side', 'close']) {
      await c.evaluate(`(()=>{const d=__MOSPEADA__,s=d.runtime.state,p=s.pedestrian,a=__SCOTT_ORIGINAL__,v=d.camera.position.clone();d.setCameraMode(3);const target=v.set(p.x,p.ground+1.1,p.z);if('${view}'==='close'){const mesh=a.instance.skins[0].mesh,hand=a.instance.hands[0],side=hand.sides[0],ids=hand.affected.filter(i=>{const j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;return[0,1,2,3].some(k=>j.array[i*4+k]===side.joint&&w.array[i*4+k]>.8)});target.set(0,0,0);for(const i of ids)target.add(mesh.localToWorld(mesh.getVertexPosition(i,new v.constructor())));target.divideScalar(ids.length);d.runtime.orbit.target.copy(target);d.camera.position.copy(target).add(v.clone().set(.55,.12,.40).applyAxisAngle(v.clone().set(0,1,0),p.yaw))}else{d.runtime.orbit.target.copy(target);d.camera.position.copy(target).add(v.clone().set('${view}'==='side'?3.1:0,.1,'${view}'==='side'?0:3.1).applyAxisAngle(v.clone().set(0,1,0),p.yaw))}d.runtime.orbit.update()})()`)
      await shot(`game-${state}-${view}`)
    }
  }
  await c.evaluate(`__MOSPEADA__.reset('highway');__MOSPEADA__.runtime.paused=true`)
  await settle(); await wait(300)
  report.ridingInfluence = await c.evaluate('__SCOTT_ORIGINAL__.instance.hands[0].influence');report.gripInfluence=await c.evaluate('__SCOTT_ORIGINAL__.instance.skins[0].mesh.morphTargetInfluences[1]');assert.equal(report.gripInfluence,1)
  assert.equal(report.ridingInfluence, 0)
  await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.body.localToWorld(v.set(0,1.1,0)));d.camera.position.copy(d.rig.body.localToWorld(v.set(2.8,1.6,1.2)));d.runtime.orbit.update()})()`)
  await shot('game-riding-compact-grip')
  for (const mode of ['PBR', 'ANIME']) {
    await c.evaluate(`__ANIME__.state.set({mode:'${mode}'})`)
    await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.body.localToWorld(v.set(0,.99,-.56)));d.camera.position.copy(d.rig.body.localToWorld(v.set(1.3,1.6,-1.5)));d.runtime.orbit.update()})()`)
    await shot('seat-' + mode.toLowerCase())
  }
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.evaluate(`__ANIME__.state.set({mode:'ANIME'});__MOSPEADA__.reset('highway')`).catch(() => {})
  c.close()
}
