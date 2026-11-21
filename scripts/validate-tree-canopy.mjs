import fs from 'node:fs'
import assert from 'node:assert/strict'
process.env.MOSPEADA_TEST_URL='http://127.0.0.1:5175/.local/forest-canopy-review.html'
const {connect}=await import('./browser-cdp.mjs'),c=await connect(),dir='artifacts/forest-canopy-test',report={}
try{
 let ready=false
 for(let i=0;i<160;i++){if(await c.evaluate('!!window.__CANOPY_REVIEW__')){ready=true;break}if(c.events.some(e=>e.method==='Runtime.exceptionThrown'))break;await new Promise(r=>setTimeout(r,200))}
 if(!ready)throw Error(JSON.stringify(c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded')))
 await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
 for(const view of ['compare','original','front','side','rear','under','cyclone']){
  report[view]=await c.evaluate(`__CANOPY_REVIEW__.draw('${view}')`)
  fs.writeFileSync(`${dir}/${view}.png`,Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  assert.equal(report[view].gl,0)
 }
 report.volume=await c.evaluate(`(()=>{const q=__CANOPY_REVIEW__,t=q.test;return {cards:t.cards.length,atlasDraws:t.batches.length,triangles:t.stats.cardTriangles,anchors:t.anchors.map(v=>v.toArray()),fit:t.fitScale.toArray(),depths:t.cards.map(c=>c.position.z),rotations:t.cards.map(c=>[c.pitch,c.yaw,c.roll]),opaqueMaterials:t.batches.every(b=>!b.material.transparent&&b.material.depthWrite&&b.material.alphaTest===.55),sharedBark:t.bark[0].geometry===t.original.children[0].geometry}})()`)
 assert.equal(report.volume.atlasDraws,2);assert.ok(report.volume.cards<=60&&report.volume.opaqueMaterials&&report.volume.sharedBark)
 report.rotation=await c.evaluate(`(()=>{const q=__CANOPY_REVIEW__,t=q.test,before=t.batches.map(b=>b.instanceMatrix.array.slice()),versions=t.batches.map(b=>b.instanceMatrix.version),calls=[],start=q.renderer.info.programs.length;t.setMode('anime');for(let i=0;i<36;i++){const angle=i*Math.PI/18;q.camera.position.set(-15+Math.sin(angle)*48,q.y+16,-17+Math.cos(angle)*48);q.camera.lookAt(-15,q.y+16,-17);q.camera.updateMatrixWorld();q.effect.render(q.settings,1);calls.push(q.effect.stats.renderCalls)}return {programsAdded:q.renderer.info.programs.length-start,maxCalls:Math.max(...calls),minCalls:Math.min(...calls),unchanged:t.batches.every((b,i)=>versions[i]===b.instanceMatrix.version&&b.instanceMatrix.array.every((v,j)=>v===before[i][j])),gl:q.renderer.getContext().getError()}})()`)
 assert.ok(report.rotation.unchanged);assert.equal(report.rotation.programsAdded,0);assert.equal(report.rotation.gl,0)
 report.errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error').map(e=>e.params)
 assert.deepEqual(report.errors,[])
 fs.writeFileSync(`${dir}/visual-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,volume:{...report.volume,anchors:undefined,depths:undefined,rotations:undefined}},null,2))
}finally{c.close()}
