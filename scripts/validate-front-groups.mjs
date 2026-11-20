import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms))
const dir='artifacts/front-battloid/choreography-v2',report={samples:[]}
fs.mkdirSync(dir,{recursive:true})
try{
  let ready=false
  for(let i=0;i<200;i++){
    ready=await c.evaluate('!!window.__FRONT_BATTLOID__?.store.snapshot().ready && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false)
    if(ready)break
    await wait(200)
  }
  assert.ok(ready,'Game must finish loading')
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await c.evaluate('__MOSPEADA__.runtime.paused=true;__FRONT_BATTLOID__.entry.reset()')
  await c.openSettings('Clima')
  await c.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Día soleado').click()`)
  await c.closeSettings();await wait(1300)
  // Isolate the front presentation layer, keeping the real Scott T-pose.
  await c.evaluate('__FRONT_BATTLOID__.entry.poseBlend=1;true')
  for(const [name,progress,elapsed]of [['rest',0,0],['cover-turn',0,.3],['cover-open',0,.53],['tank-dip',0,.75],['tank-down',0,.98],['travel',.4,1.8],['final',1,3],['restore',0,0]]){
    await c.evaluate(`__FRONT_BATTLOID__.entry.phase='complete';__FRONT_BATTLOID__.entry.elapsed=${elapsed};__FRONT_BATTLOID__.store.seek(${progress});true`);await wait(150)
    report.samples.push(await c.evaluate(`(()=>{
      const e=__FRONT_BATTLOID__.effect,names=new Map(e.data.pieces.map(p=>[p.id,p.name]));
      const named=(p,name)=>p.record.pieceIds.some(id=>names.get(id)===name);
      const pose=__FRONT_BATTLOID__.entry.choreography;
      return {progress:${progress},pose,groups:e.motionGroups.filter(g=>g.role==='hinge').map(g=>{
        const h=g.parts.find(p=>named(p,'Headlight_Housing')),inv=h.mesh.matrixWorld.clone().invert();
        const rigid=g.parts.filter(p=>named(p,'Headlight_Front_Frame')||named(p,'Headlight_Front_Glass'));
        if(rigid.length!==2)throw Error('Missing rigid frame/glass members');
        const baked=g.sourceBaked.clone().multiply(g.source.clone().invert());
        const authored=e.data.motionGroups.find(p=>p.id===g.id),point=g.current.clone().premultiply(e.rig.body.matrixWorld);
        const pin=h.mesh.position.clone().fromArray(authored.hinge.source).applyMatrix4(baked).applyMatrix4(h.mesh.matrixWorld);
        const origin=pin.clone().setFromMatrixPosition(point);
        return{id:g.id,surfaces:g.parts.length,hingeError:${elapsed===0&&progress===0?'0':'pin.distanceTo(origin)'},rigidError:Math.max(...rigid.flatMap(p=>inv.clone().multiply(p.mesh.matrixWorld).elements.map((v,i)=>Math.abs(v-(i%5===0?1:0)))))};
      })};
    })()`))
    for(const g of report.samples.at(-1).groups){assert.equal(g.surfaces,8);assert.ok(g.rigidError<1e-7);assert.ok(g.hingeError<1e-7)}
    for(const [view,position] of [['front',[1.1,1.5,3.0]],['side',[3.1,1.5,.3]]]){
      await c.evaluate(`(()=>{const d=__MOSPEADA__,v=d.camera.position.clone();d.setCameraMode(3);d.runtime.orbit.target.copy(d.rig.root.localToWorld(v.set(0,1.35,0)));d.camera.position.copy(d.rig.root.localToWorld(v.set(...${JSON.stringify(position)})));d.runtime.orbit.update()})()`)
      await wait(200)
      fs.writeFileSync(`${dir}/${name}-${view}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    }
  }
  report.integrity=await c.evaluate(`({clips:__SCOTT_ORIGINAL__.source.animations.length,gl:__ANIME__.renderer.getContext().getError(),shader:__ANIME__.state.snapshot().error})`)
  assert.deepEqual(report.integrity,{clips:16,gl:0,shader:''})
  report.openings=await c.evaluate('__MOSPEADA__.rig.headlightOpenings')
  assert.deepEqual(report.openings.map(p=>p.removedTriangles),[14,14])
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}finally{
  await c.send('Browser.close').catch(()=>{});c.close()
}
