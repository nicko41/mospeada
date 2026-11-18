import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/scott-animated', wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function ready(expression) { for (let i = 0; i < 300; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(200) } throw Error('Browser did not become ready') }
async function shot(name) { await wait(180); fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
try {
  await c.send('Page.bringToFront')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/scott-lab.html' })
  await ready('!!window.__SCOTT_LAB__')
  const clips = await c.evaluate('__SCOTT_LAB__.state.asset.animations.map(c=>({name:c.name,duration:c.duration}))')
  assert.equal(clips.length, 16)
  for (const clip of clips) {
    await c.evaluate(`document.getElementById('time').value='0.35';__SCOTT_LAB__.setClip(${JSON.stringify(clip.name)});__SCOTT_LAB__.view('front')`)
    await shot('clip-' + clip.name)
  }
  await c.evaluate(`__SCOTT_LAB__.setClip('rest');document.getElementById('hand').value='0.12';__SCOTT_LAB__.renderPose();__SCOTT_LAB__.view('shoulders')`)
  await shot('shoulders-clean')
  for (const [name, amount] of [['rest', '0.12'], ['fist', '1'], ['grip', '0.85']]) {
    await c.evaluate(`document.getElementById('hand').value='${amount}';__SCOTT_LAB__.renderPose();__SCOTT_LAB__.view('hand')`)
    await shot('hand-' + name)
  }
  await c.evaluate(`document.getElementById('model').value='original';__SCOTT_LAB__.select()`)
  await c.evaluate(`__SCOTT_LAB__.setClip('rest');__SCOTT_LAB__.view('shoulders')`); await shot('shoulders-original')
  await c.evaluate(`__SCOTT_LAB__.view('hand')`); await shot('hand-original')
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await ready('!!window.__MOSPEADA__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  const report = { clips, startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  Object.assign(report, await c.evaluate(`(async()=>{
    const{advanceBike}=await import('/src/vehicle/bikePhysics.js'),{requestRiderToggle}=await import('/src/vehicle/riderPresence.js'),d=__MOSPEADA__,frames={},contacts=[];
    d.reset('highway');d.runtime.paused=true;let s=d.runtime.state;frames.idle=structuredClone(s);
    s.speed=15;s.parked=false;s.idleBlend=0;for(let i=0;i<60;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);frames.driving=structuredClone(s);
    d.reset('highway');d.runtime.paused=true;s=d.runtime.state;requestRiderToggle(s);
    for(let i=0;i<180;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);frames.standing=structuredClone(s);
    for(const[name,input]of[['walking',{walkForward:1,walkYaw:s.yaw}],['running',{walkForward:1,walkYaw:s.yaw,run:true}],['crouch',{crouch:true}],['recovered',{}]]){
      for(let i=0;i<120;i++){
        advanceBike(s,input,1/120,d.rig.metrics,d.sample);d.rig.update(s,d.sample,d.config);
        if(i===75)frames[name]=structuredClone(s);
        if(i%12===0)for(const l of d.rig.legs){
          if(name!=='crouch'&&!s.pedestrian.feet[l.side])continue;
          let clearance=Infinity;for(const index of l.soleContactIndices){const p=l.skin.localToWorld(l.skin.getVertexPosition(index,d.camera.position.clone()));clearance=Math.min(clearance,p.y-d.sample(p.x,p.z))}
          contacts.push({pose:name,side:l.side,error:l.onFootError,clearance});
        }
      }
    }
    s.fist=true;frames.fist=structuredClone(s);
    s.pedestrian.x=s.x+Math.cos(s.yaw)*1.1;s.pedestrian.z=s.z-Math.sin(s.yaw)*1.1;requestRiderToggle(s);
    for(let i=0;i<180;i++)advanceBike(s,{},1/120,d.rig.metrics,d.sample);frames.remounted=structuredClone(s);
    window.__SCOTT_GAME_FRAMES__=frames;
    return{bones:d.rig.bones.size,fingerJoints:d.rig.fingers.fingers.length,animationClips:d.rig.animations.actions.size,drivingLean:d.rig.animations.drivingLean,crouchTime:d.rig.animations.crouchTime,contacts,programsBefore:__ANIME__.renderer.info.programs.length};
  })()`))
  assert.equal(report.bones, 54); assert.equal(report.fingerJoints, 30); assert.equal(report.animationClips, 16)
  assert.ok(report.contacts.every(p => p.error < 0.025 && p.clearance > -0.01 && p.clearance < 0.03), JSON.stringify(report.contacts.filter(p => p.error >= 0.025 || p.clearance <= -0.01 || p.clearance >= 0.03)))
  report.poses = []
  for (const name of ['idle', 'driving', 'standing', 'walking', 'running', 'crouch', 'recovered', 'fist', 'remounted']) {
    const result = await c.evaluate(`(()=>{
      const d=__MOSPEADA__;d.runtime.state=structuredClone(__SCOTT_GAME_FRAMES__.${name});d.runtime.paused=true;const s=d.runtime.state,r=d.rig;r.update(s,d.sample,d.config);d.setCameraMode(3);
      const p=s.dismountBlend?s.pedestrian:{x:s.x,z:s.z,ground:d.sample(s.x,s.z)},h=s.pedestrian?.crouchBlend||0;
      d.runtime.orbit.target.set(p.x,p.ground+1-h*.25,p.z);const offset=d.camera.position.clone().set(2.5,1.7,2.6).applyAxisAngle(d.camera.position.clone().set(0,1,0),s.yaw);d.camera.position.set(p.x,p.ground,p.z).add(offset);d.runtime.orbit.update();
      let gloveViolation=-Infinity;
      if(!s.dismountBlend)for(const a of r.arms)for(const skin of a.skins){const owned=new Set(skin.skeleton.bones.map((b,i)=>{for(let n=b;n;n=n.parent)if(n===a.hand)return i;return -1}).filter(i=>i>=0));const indices=skin.geometry.attributes.skinIndex,weights=skin.geometry.attributes.skinWeight;
        for(let i=0;i<indices.count;i++){let weight=0;for(let j=0;j<4;j++)if(owned.has(indices.getComponent(i,j)))weight+=weights.getComponent(i,j);if(weight<.7)continue;const p=r.body.worldToLocal(skin.localToWorld(skin.getVertexPosition(i,d.camera.position.clone())));for(const plane of a.enclosurePlanes)gloveViolation=Math.max(gloveViolation,plane.normal.dot(p)-plane.constant)}}
      return{name:'${name}',mode:s.riderMode,handErrors:r.arms.map(a=>a.error),legErrors:r.legs.map(a=>s.dismountBlend?a.onFootError:a.error),gloveViolation:Number.isFinite(gloveViolation)?gloveViolation:null,hip:r.bones.get('Hips').getWorldPosition(d.camera.position.clone()).toArray()};
    })()`)
    if (result.gloveViolation !== null) assert.ok(result.gloveViolation < 0.008, JSON.stringify(result))
    assert.ok(result.legErrors.every(e => e < 0.025), JSON.stringify(result))
    report.poses.push(result); await shot('game-' + name)
    if (['driving', 'crouch'].includes(name)) { await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await shot('game-' + name + '-anime'); await c.evaluate(`__ANIME__.state.set({mode:'PBR'})`) }
  }
  report.programsAfter = await c.evaluate('__ANIME__.renderer.info.programs.length')
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(`${directory}/browser-validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, clips: clips.length, contacts: report.contacts.length }, null, 2))
} finally {
  await c.evaluate(`if(window.__MOSPEADA__){delete window.__SCOTT_GAME_FRAMES__;__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)}`).catch(() => {})
  c.close()
}
