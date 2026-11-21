import fs from 'node:fs'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { connect } from './browser-cdp.mjs'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(c, expression, timeout = 180000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await c.evaluate(expression)) return; await wait(300) }
  throw Error('Timed out: ' + expression)
}
export async function validateAnime(c, directory = 'artifacts/anime') {
  fs.mkdirSync(directory, { recursive: true })
  await until(c, '!!window.__ANIME__?.state.snapshot().ready && !document.getElementById("entry-preloader")')
  await c.openSettings('Anime')
  assert.equal(await c.evaluate(`[...document.querySelectorAll('button')].some(b=>['PBR','Comparar'].includes(b.textContent.trim()))`), false)
  assert.equal(await c.evaluate('!!document.querySelector(".anime-comparison, .anime-divider, .anime-switcher")'), false)
  assert.equal(await c.evaluate('__ANIME__.state.snapshot().mode'), 'ANIME')
  await c.closeSettings()
  const integrity = await c.evaluate(`(()=>{
    const {effect:e,state}=__ANIME__, originals=e.bindings.map(b=>({object:b.object,material:b.source,geometry:b.object.geometry}));
    const bones=[];e.scene.traverse(n=>{if(n.isBone)bones.push([n,n.matrixWorld.elements.slice()])});
    e.render(state.snapshot(),e.uniforms.uAnimeDay.value);
    return {materials:originals.every(b=>b.object.material===b.material),geometries:originals.every(b=>b.object.geometry===b.geometry),bones:bones.length,unchangedBones:bones.every(([b,m])=>b.matrixWorld.elements.every((v,i)=>v===m[i])),samples:e.target.samples,size:[e.target.width,e.target.height],noPbrTarget:!e.pbrTexture,gl:__ANIME__.renderer.getContext().getError()}
  })()`)
  assert.ok(integrity.materials && integrity.geometries && integrity.unchangedBones && integrity.noPbrTarget)
  assert.equal(integrity.gl, 0)
  await until(c, '__ANIME__.state.snapshot().nightReady')
  const lighting=[]
  for (const [code,day] of [['KeyM',0],['KeyN',1]]) {
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()})
    await c.send('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()})
    await until(c,`__ANIME__.effect.uniforms.uAnimeDay.value===${day}`)
    const result=await c.evaluate(`(()=>{const r=__ANIME__.renderer,g=r.getContext();return {day:__ANIME__.effect.uniforms.uAnimeDay.value,gl:g.getError(),shaderError:__ANIME__.state.snapshot().error,invalidPrograms:r.info.programs.filter(p=>p.program&&!g.getProgramParameter(p.program,g.LINK_STATUS)).map(p=>p.name)}})()`)
    assert.equal(result.gl,0);assert.equal(result.shaderError,'');assert.deepEqual(result.invalidPrograms,[]);lighting.push(result)
    const shot=await c.send('Page.captureScreenshot',{format:'png'})
    fs.writeFileSync(`${directory}/anime-${day?'day':'night'}.png`,Buffer.from(shot.data,'base64'))
  }
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text)
  assert.deepEqual(errors,[])
  const result={date:new Date().toISOString(),integrity,lighting,errors}
  fs.writeFileSync(`${directory}/validation.json`,JSON.stringify(result,null,2)+'\n')
  return result
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const c=await connect()
  try { console.log(JSON.stringify(await validateAnime(c),null,2)) } finally { c.close() }
}
