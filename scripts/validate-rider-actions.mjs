import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), directory = 'artifacts/driving/rider'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
try {
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const reuse = process.argv.includes('--reuse')
  const origin = await c.evaluate('performance.timeOrigin')
  if (!reuse) await c.send('Page.reload')
  for (let i = 0; i < 300; i++) {
    if (await c.evaluate(`(${reuse} || performance.timeOrigin!==${origin}) && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector('#entry-preloader')`).catch(() => false)) break
    await wait(250)
  }
  await c.evaluate(`(async()=>{
    const {advanceBike}=await import('/src/vehicle/bikePhysics.js'),d=__MOSPEADA__,frames={};
    d.reset('highway');d.runtime.paused=true;let s=d.runtime.state;s.idleBlend=0;frames.seated=structuredClone(s);
    for(const [name,steer]of [['coleada-left',1],['coleada-right',-1]]){
      d.reset('highway');s=d.runtime.state;s.speed=20;s.parked=false;s.idleBlend=0;
      for(let i=0;i<66;i++)advanceBike(s,{handbrake:true,steer},1/120,d.rig.metrics,d.sample);
      frames[name]=structuredClone(s);
    }
    d.reset('jump');s=d.runtime.state;s.speed=25;s.parked=false;s.idleBlend=0;let peak=0,departed=false;
    for(let i=0;i<1200;i++){
      advanceBike(s,{},1/120,d.rig.metrics,d.sample);
      if(s.z> -134&&s.airborne){departed=true;const gap=Math.max(s.frontAirGap,s.rearAirGap);if(gap>peak){peak=gap;frames['jump-standing']=structuredClone(s)}}
      if(departed&&s.frontGrounded&&s.rearGrounded){
        frames.touchdown=structuredClone(s);
        for(let j=0;j<90;j++){advanceBike(s,{},1/120,d.rig.metrics,d.sample);if(j===8)frames['landing-flex']=structuredClone(s)}
        frames['landed-seated']=structuredClone(s);break;
      }
    }
    window.__RIDER_ACTION_FRAMES__=frames;
  })()`)
  const report = { startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  for (const name of ['seated', 'jump-standing', 'touchdown', 'landing-flex', 'landed-seated', 'coleada-left', 'coleada-right']) {
    report[name] = await c.evaluate(`(()=>{
      const d=__MOSPEADA__,r=d.rig;d.runtime.state=structuredClone(__RIDER_ACTION_FRAMES__['${name}']);d.runtime.paused=true;
      const s=d.runtime.state;r.update(s,d.sample,d.config);d.setCameraMode(3);
      const local=bone=>r.body.worldToLocal(bone.getWorldPosition(d.camera.position.clone()));
      const contactPoints=a=>a.soleContactIndices.map(index=>r.body.worldToLocal(r.arms[0].skin.localToWorld(r.arms[0].skin.getVertexPosition(index,d.camera.position.clone()))));
      if('${name}'==='seated')window.__RIDER_BOOT_CONTACTS__=r.legs.map(contactPoints);
      d.runtime.orbit.target.copy(r.root.localToWorld(d.camera.position.clone().set(0,1.15,0)));
      d.camera.position.copy(r.root.localToWorld(d.camera.position.clone().set(${name === 'coleada-right' ? -3.25 : 3.25},1.85,.45)));d.runtime.orbit.update();
      let gloveViolation=-Infinity;
      for(const a of r.arms){const skin=a.skin,indices=skin.geometry.attributes.skinIndex,weights=skin.geometry.attributes.skinWeight;
        for(let i=0;i<indices.count;i++){let weight=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===a.boneIndex)weight+=weights.getComponent(i,j);if(weight<.7)continue;
          const p=r.body.worldToLocal(skin.localToWorld(skin.getVertexPosition(i,d.camera.position.clone())));
          for(const plane of a.enclosurePlanes)gloveViolation=Math.max(gloveViolation,plane.normal.dot(p)-plane.constant)}}
      return{stand:s.riderStand,airborne:s.airborne,dab:[s.riderDabLeft,s.riderDabRight],lean:s.lean,hips:local(r.bones.get('Hips')).toArray(),hands:r.arms.map(a=>a.error),gloveViolation,
        legs:r.legs.map((a,i)=>{const hip=a.upper.getWorldPosition(d.camera.position.clone()),knee=a.elbow.getWorldPosition(d.camera.position.clone()),foot=a.hand.getWorldPosition(d.camera.position.clone());
          const soleNormal=a.soleNormal.clone().applyQuaternion(a.hand.getWorldQuaternion(r.body.quaternion.clone())).applyQuaternion(r.body.getWorldQuaternion(r.body.quaternion.clone()).invert());
          const points=contactPoints(a),reference=window.__RIDER_BOOT_CONTACTS__[i];
          return{side:a.side,error:a.error,foot:local(a.hand).toArray(),peg:a.target.toArray(),knee:local(a.elbow).toArray(),soleDot:soleNormal.y,soleContactShift:Math.max(...points.map((p,j)=>p.distanceTo(reference[j]))),extension:hip.distanceTo(foot)/(hip.distanceTo(knee)+knee.distanceTo(foot))}})};
    })()`)
    const pose = report[name]
    assert.ok(pose.hands.every(e => e < 0.005) && pose.legs.every(l => l.error < 0.015), name + ' IK reach')
    assert.ok(pose.gloveViolation < 0.008, name + ' hands inside covers: ' + pose.gloveViolation)
    await wait(250)
    fs.writeFileSync(directory + '/' + name + '.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    if (name === 'jump-standing') {
      await c.evaluate(`__ANIME__.state.set({mode:'ANIME'})`); await wait(250)
      fs.writeFileSync(directory + '/jump-standing-anime.png', Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      await c.evaluate(`__ANIME__.state.set({mode:'PBR'})`)
    }
  }
  assert.ok(report['jump-standing'].stand > 0.99 && report['jump-standing'].hips[1] > report.seated.hips[1] + 0.29)
  for (const leg of report['jump-standing'].legs) {
    assert.ok(leg.extension > 0.93)
    assert.ok(leg.foot.every((n, i) => Math.abs(n - leg.peg[i]) < 1e-5))
    assert.ok(leg.soleDot > 0.99999 && leg.soleContactShift < 0.01 && Math.abs(leg.knee[0]) < 0.32)
  }
  assert.ok(report['landing-flex'].stand < report.touchdown.stand && report['landed-seated'].stand < 0.01)
  assert.ok(report['coleada-left'].dab[0] > 0.9 && report['coleada-left'].dab[1] < 0.01)
  assert.ok(report['coleada-right'].dab[1] > 0.9 && report['coleada-right'].dab[0] < 0.01)
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(directory + '/validation.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await c.evaluate(`delete window.__RIDER_ACTION_FRAMES__;delete window.__RIDER_BOOT_CONTACTS__;__ANIME__.state.set({mode:'PBR'});__MOSPEADA__.reset('highway');__MOSPEADA__.setCameraMode(0)`).catch(() => {})
  c.close()
}
