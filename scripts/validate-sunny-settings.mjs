import fs from 'node:fs'
import assert from 'node:assert/strict'
import { connect } from './browser-cdp.mjs'

const c = await connect(), wait = ms => new Promise(r => setTimeout(r, ms)), dir = 'artifacts/sunny-settings'
fs.mkdirSync(dir, { recursive: true })
const click = label => c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click()})()`)
const capture = async name => fs.writeFileSync(`${dir}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
try {
  await c.send('Page.bringToFront')
  await c.send('Page.reload', { ignoreCache:false }); await wait(1000)
  for (let i=0; i<200; i++) {
    if (await c.evaluate('!!window.__MOSPEADA__?.rig && __ANIME__.state.snapshot().ready && !document.querySelector("#entry-preloader")').catch(()=>false)) break
    await wait(200)
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false })
  await c.evaluate('__MOSPEADA__.runtime.paused=true')
  await c.evaluate(`document.querySelector('[aria-label="Cerrar ajustes"]')?.click()`); await wait(100)
  assert.equal(await c.evaluate('!!document.querySelector(".anime-switcher,.weathering-toggle,.vfx-toggle,.ride-settings")'), false)
  await c.evaluate(`(()=>{window.__weatherAudio=[];const pause=HTMLMediaElement.prototype.pause,play=HTMLMediaElement.prototype.play;window.__audioPause=pause;window.__audioPlay=play;
    HTMLMediaElement.prototype.pause=function(){__weatherAudio.push({type:'pause',src:this.src});return pause.call(this)};
    HTMLMediaElement.prototype.play=function(){__weatherAudio.push({type:'play',src:this.src});return play.call(this)};})()`)
  await click('Ajustes'); await click('Día soleado'); await wait(2200)
  const sunny = await c.evaluate(`(async()=>{
    const w=__CYCLONE_WEATHERING__.weather,{lightningState:l}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/world/Lightning.jsx')).name),d=__MOSPEADA__;let sky,rain;
    d.scene.traverse(n=>{if(n.material?.uniforms?.uClear)sky=n.material.uniforms.uClear.value;if(n.isLineSegments&&n.geometry.attributes.position.count===1040)rain=n.visible});
    return{preset:w.snapshot(),rainIntensity:w.rainIntensity,fog:d.scene.fog.density,sky,rain,event:l.eventId,pausedSounds:__weatherAudio.filter(e=>e.type==='pause').map(e=>e.src.split('/').pop()),shader:__ANIME__.state.snapshot().error};
  })()`)
  console.log('Sunny', sunny)
  assert.equal(sunny.preset,'sunny'); assert.equal(sunny.rainIntensity,0); assert.equal(sunny.rain,false); assert.equal(sunny.sky,1); assert.equal(sunny.fog,0); assert.equal(sunny.pausedSounds.length,3); assert.equal(sunny.shader,'')
  await capture('01-sunny-settings')
  await wait(5500)
  assert.equal(await c.evaluate(`(async()=> (await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/world/Lightning.jsx')).name)).lightningState.eventId)()`),sunny.event)
  assert.equal(await c.evaluate('__weatherAudio.filter(e=>e.type==="play").length'),0)
  const panels={}
  for (const [label,selector] of [['Anime','.anime-settings[aria-label="Ajustes Anime"]'],['Reflejo','.surface-brush-settings'],['Suciedad','.weathering-settings'],['VFX · terreno','.vfx-settings'],['Conducción','.ride-tuning']]) {
    await click(label); await wait(70)
    panels[label]=await c.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`); assert.equal(panels[label],true)
  }
  await click('Anime'); await click('Comparar'); await click('×'); await wait(100)
  assert.equal(await c.evaluate('!!document.querySelector(".anime-comparison")'),true)
  await click('Ajustes'); await click('Comparar'); await click('Clima'); await click('Tormenta'); await wait(100)
  assert.equal(await c.evaluate('__CYCLONE_WEATHERING__.weather.rainIntensity'),1)
  await click('Día soleado'); await click('×'); await wait(300); await capture('02-clean-hud-sunny')
  await c.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:false }); await click('Ajustes'); await wait(150)
  const bounds=await c.evaluate('(()=>{const r=document.querySelector(".ride-settings").getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,screen:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth}})()')
  assert.ok(bounds.x>=0&&bounds.right<=390&&bounds.bottom<=844&&!bounds.overflow)
  await capture('03-mobile-settings')
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')
  assert.equal(errors.length,0,JSON.stringify(errors))
  fs.writeFileSync(`${dir}/validation.json`,JSON.stringify({sunny,panels,bounds,errors},null,2)+'\n')
  console.log({panels,bounds,errors})
} finally {
  await c.send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false }).catch(()=>{})
  await c.evaluate(`document.querySelector('[aria-label="Cerrar ajustes"]')?.click();if(window.__audioPause){HTMLMediaElement.prototype.pause=__audioPause;HTMLMediaElement.prototype.play=__audioPlay}__MOSPEADA__.reset('highway')`).catch(()=>{})
  c.close()
}
