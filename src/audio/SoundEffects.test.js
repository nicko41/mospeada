import test from 'node:test'
import assert from 'node:assert/strict'
import {SoundEffects} from './SoundEffects.js'
import {SOUND_EFFECTS,GALLANT_SHOT_URLS,PLAYER_INITIAL_AUDIO_URLS} from './gameAudio.js'
import fs from 'node:fs'

function fixture({state='running',random=()=>0}={}){
  const nodes=[],requests=[],decodes=[],gestures=new Map()
  const parameter=(value=1)=>({value,events:[],cancelScheduledValues(time){this.events.push(['cancel',time])},cancelAndHoldAtTime(time){this.events.push(['hold',time])},setValueAtTime(value,time){this.value=value;this.events.push(['set',value,time])},setTargetAtTime(value,time,constant){this.value=value;this.events.push(['target',value,time,constant])},linearRampToValueAtTime(value,time){this.events.push(['ramp',value,time])}})
  const node=properties=>({...properties,connect(target){this.target=target},disconnect(){this.disconnected=true}})
  const context={state,currentTime:2,destination:{},createGain(){const gain=node({gain:parameter()});nodes.push(gain);return gain},
    createBiquadFilter(){return node({frequency:parameter(350),Q:parameter(1)})},
    createBufferSource(){return {...node({playbackRate:parameter(),detune:parameter(0)}),start(){this.started=true},stop(time){this.stoppedAt=time??context.currentTime}}},
    async decodeAudioData(bytes){const buffer={bytes};decodes.push(buffer);return buffer},resume(){this.resumes=(this.resumes||0)+1;this.state='running';return Promise.resolve()}}
  const audio=new SoundEffects(SOUND_EFFECTS,{createContext:()=>context,random,fetchAudio:async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>url}}})
  const target={addEventListener(name,handler){gestures.set(name,handler)},removeEventListener(name,handler){assert.equal(gestures.get(name),handler);gestures.delete(name)}}
  return {audio,context,nodes,requests,decodes,gestures,target,prepare:()=>Promise.all(GALLANT_SHOT_URLS.map(url=>audio.loadBuffer(url)))}
}

test('stable loop controls do not cancel and reschedule identical audio ramps every frame',async()=>{
 const f=fixture();await f.audio.loadBuffer(SOUND_EFFECTS.cycloneEngineLoop.variants[0].url)
 const voice=f.audio.play('cycloneEngineLoop',{loop:true,filter:{frequency:1000}}),gain=f.audio.voiceGains.get(voice).gain,filter=f.audio.voiceFilters.get(voice).frequency
 for(let i=0;i<240;i++){f.context.currentTime+=1/60;f.audio.modulate(voice,{playbackRate:1.2,gain:.4,frequency:2000})}
 for(const param of[voice.playbackRate,gain,filter])assert.equal(param.events.filter(e=>e[0]==='target').length,1)
 f.audio.modulate(voice,{gain:0,timeConstant:.12});f.audio.modulate(voice,{gain:0,timeConstant:.025})
 assert.equal(gain.events.filter(e=>e[0]==='target').length,3,'Changing pause smoothing still takes effect immediately')
 assert.equal(gain.events.at(-1)[3],.025);f.audio.stop(voice,.08);f.audio.modulate(voice,{gain:0})
 assert.equal(gain.events.filter(e=>e[0]==='target').length,4,'A separately scheduled fade invalidates the cached target')
 voice.onended();assert.equal(f.audio.voices.size,0)
})

test('inaudible distance-attenuated one-shots do not allocate or start sources',async()=>{
 const f=fixture();await f.prepare();const nodes=f.nodes.length
 assert.equal(f.audio.play('gallantShot',{gain:0}),null);assert.equal(f.nodes.length,nodes);assert.equal(f.audio.voices.size,0)
 assert.ok(f.audio.play('gallantShot',{gain:.01}));assert.equal(f.audio.voices.size,1)
})

test('concurrent preparation downloads and decodes each original MP3 once, even before audio is unlocked',async()=>{
  const f=fixture({state:'suspended'})
  await Promise.all([f.prepare(),f.prepare(),f.prepare()])
  assert.equal(f.requests.length,2);assert.equal(f.decodes.length,2);assert.equal(f.context.state,'suspended')
  for(const url of GALLANT_SHOT_URLS)assert.ok(fs.statSync(new URL(url)).size>1000)
})

test('new Gallant default/alt choices are exactly 80/20 without changing pitch',async()=>{
  let sample=0
  const f=fixture({random:()=>sample});await f.prepare()
  const counts=new Map()
  for(let i=0;i<1000;i++){
    sample=(i+.5)/1000
    const voice=f.audio.play('gallantShot'),url=voice.buffer.bytes
    counts.set(url,(counts.get(url)||0)+1)
    assert.equal(voice.playbackRate.value,1);assert.equal(voice.detune.value,0)
    voice.onended()
  }
  assert.deepEqual(GALLANT_SHOT_URLS.map(url=>url.split('/').at(-1)),['gallant-shot-default.mp3','gallant-shot-alt.mp3'])
  assert.deepEqual(GALLANT_SHOT_URLS.map(url=>counts.get(url)),[800,200])
  assert.equal(f.requests.length,2);assert.equal(f.decodes.length,2)
})

test('consecutive shots overlap on the same buffer and release each source independently',async()=>{
  const f=fixture();await f.prepare()
  const first=f.audio.play('gallantShot'),second=f.audio.play('gallantShot')
  assert.notEqual(first,second);assert.equal(first.buffer,second.buffer)
  assert.ok(first.started&&second.started);assert.equal(f.audio.voices.size,2);assert.equal(first.disconnected,undefined)
  first.onended();assert.equal(f.audio.voices.size,1);assert.ok(first.disconnected);assert.equal(second.disconnected,undefined)
  second.onended();assert.equal(f.audio.voices.size,0)
})

test('SFX and per-effect volumes update active voices independently and clamp to 0–1',async()=>{
  const f=fixture({random:()=>.85});await f.prepare()
  f.audio.setVolume('gallantShot',.35)
  const voice=f.audio.play('gallantShot')
  assert.equal(voice.target.gain.value,.35)
  f.audio.setMasterVolume(.5);assert.equal(voice.target.target.gain.value,.5);assert.equal(voice.target.gain.value,.35)
  f.audio.setVolume('gallantShot',0);assert.equal(voice.target.gain.value,0)
  f.audio.setVolume('gallantShot',2);assert.equal(voice.target.gain.value,1)
  f.audio.setMasterVolume(-1);assert.equal(f.audio.master.gain.value,0)
})

test('only the main Gallant variant is softened, while boost and all strafes use subtle independent gains',async()=>{
  let sample=0
  const f=fixture({random:()=>sample})
  await Promise.all(Object.values(SOUND_EFFECTS).flatMap(effect=>effect.variants.map(variant=>f.audio.loadBuffer(variant.url))))
  const main=f.audio.play('gallantShot');assert.equal(f.audio.voiceGains.get(main).gain.value,.8);assert.equal(main.target.target.gain.value,.35)
  for(sample of [.85,.95]){const alternate=f.audio.play('gallantShot');assert.equal(f.audio.voiceGains.has(alternate),false);assert.equal(alternate.target.gain.value,.35)}
  assert.equal(f.audio.play('cycloneBoost').target.gain.value,.25)
  for(sample of [.1,.5,.9])assert.equal(f.audio.play('armorStrafe').target.gain.value,.22)
})

test('dirt pass supports 120% gain without raising other effect or master limits',async()=>{
  const f=fixture();await f.audio.loadBuffer(SOUND_EFFECTS.terrainDirtPass.variants[0].url)
  const loop=f.audio.play('terrainDirtPass',{loop:true}),bus=f.audio.gains.get('terrainDirtPass')
  assert.equal(bus.gain.value,.57);assert.equal(loop.playbackRate.value,1)
  f.audio.setVolume('terrainDirtPass',1.1);assert.equal(bus.gain.value,1.1)
  f.audio.setVolume('terrainDirtPass',2);assert.equal(bus.gain.value,1.2)
  f.audio.setVolume('terrainGrassPass',2);assert.equal(f.audio.getVolume('terrainGrassPass'),1)
  f.audio.setMasterVolume(2);assert.equal(f.audio.masterVolume,1)
})

test('unprepared or suspended playback never fetches, resumes, or queues a late sound',async()=>{
  const f=fixture({state:'suspended'})
  assert.equal(f.audio.play('gallantShot'),null);assert.equal(f.requests.length,0)
  await f.prepare();assert.equal(f.audio.play('gallantShot'),null);assert.equal(f.context.resumes,undefined)
  await f.audio.unlock();assert.equal(f.audio.voices.size,0)
  assert.ok(f.audio.play('gallantShot'));assert.equal(f.requests.length,2)
})

test('initial gestures unlock synchronously, retry denied resumes, and recover interrupted audio',async()=>{
  const f=fixture({state:'suspended'}),remove=f.audio.installUnlock(f.target)
  let resumes=0
  f.context.resume=()=>{resumes++;return Promise.reject(Error('NotAllowedError'))}
  f.gestures.get('pointerdown')();assert.equal(resumes,1)
  await Promise.resolve();assert.equal(f.context.state,'suspended')
  f.context.resume=()=>{resumes++;f.context.state='running';return Promise.resolve()}
  f.gestures.get('keydown')();assert.equal(resumes,2);assert.equal(f.context.state,'running')
  f.context.state='interrupted';f.gestures.get('pointerdown')();assert.equal(resumes,3)
  remove();assert.equal(f.gestures.size,0)
})

test('unsupported audio allows preparation to finish; failed downloads can be retried by the resource loader',async()=>{
  const unsupported=new SoundEffects(SOUND_EFFECTS,{createContext:()=>null})
  assert.equal(await unsupported.loadBuffer('test'),null);assert.equal(unsupported.play('gallantShot'),null)
  const f=fixture();let attempts=0
  f.audio.fetchAudio=async()=>({ok:++attempts>1,status:503,arrayBuffer:async()=>new ArrayBuffer(0)})
  await assert.rejects(f.audio.loadBuffer('test'),/503/)
  await f.audio.loadBuffer('test');assert.equal(attempts,2);assert.equal(f.decodes.length,1)
})

test('loop voices use cached buffers and independent fades without affecting overlapping Gallant shots',async()=>{
  const f=fixture();await f.prepare()
  const url=SOUND_EFFECTS.cycloneEngineLoop.variants[0].url
  await f.audio.loadBuffer(url)
  const shot=f.audio.play('gallantShot'),loop=f.audio.play('cycloneEngineLoop',{loop:true,fadeIn:.12})
  assert.equal(loop.loop,true);assert.equal(shot.loop,false);assert.equal(loop.playbackRate.value,1)
  const gain=f.audio.voiceGains.get(loop)
  assert.deepEqual(gain.gain.events,[['set',0,2],['ramp',1,2.12]])
  f.audio.stop(loop,.12);assert.equal(loop.stoppedAt,2.12);assert.equal(shot.stoppedAt,undefined)
  loop.onended();assert.equal(f.audio.isPlaying(loop),false);assert.ok(gain.disconnected);assert.equal(f.audio.isPlaying(shot),true)
  assert.equal(f.requests.length,3);assert.equal(f.decodes.length,3)
})

test('Armor steps favor step2 at 80%, share step1 with landings, and strafe variants are non-looping',async()=>{
  let sample=0
  const f=fixture({random:()=>sample}),urls=[...new Set(Object.values(SOUND_EFFECTS).flatMap(effect=>effect.variants.map(variant=>variant.url)))]
  await Promise.all(urls.map(url=>f.audio.loadBuffer(url)))
  const counts=new Map()
  for(let i=0;i<1500;i++){sample=(i+.5)/1500;const voice=f.audio.play('armorStep');counts.set(voice.buffer.bytes,(counts.get(voice.buffer.bytes)||0)+1);voice.onended()}
  assert.deepEqual(SOUND_EFFECTS.armorStep.variants.map(v=>counts.get(v.url)),[1200,100,100,100])
  const landing=f.audio.play('armorLanding')
  assert.equal(landing.buffer.bytes,SOUND_EFFECTS.armorStep.variants[1].url)
  for(sample of [.1,.5,.9]){const voice=f.audio.play('armorStrafe');assert.equal(voice.loop,false)}
  assert.equal(f.requests.length,22);assert.equal(f.decodes.length,22)
})

test('both transformation directions reuse the initial cached sound once per activation, without looping or changing pitch',async()=>{
  const f=fixture(),url=SOUND_EFFECTS.cycloneTransform.variants[0].url
  assert.ok(PLAYER_INITIAL_AUDIO_URLS.includes(url));assert.ok(fs.statSync(new URL(url)).size>1000)
  await Promise.all([f.audio.loadBuffer(url),f.audio.loadBuffer(url)])
  const forward=f.audio.play('cycloneTransform'),reverse=f.audio.play('cycloneTransform')
  assert.equal(forward.buffer,reverse.buffer);assert.equal(forward.loop,false);assert.equal(reverse.loop,false)
  assert.equal(forward.playbackRate.value,1);assert.equal(reverse.playbackRate.value,1)
  f.audio.setVolume('cycloneTransform',.4);assert.equal(forward.target.gain.value,.4)
  assert.equal(f.requests.length,1);assert.equal(f.decodes.length,1)
})

test('continuous loop modulation changes rate, filter and gain on the same nodes while one-shots retain their own settings',async()=>{
  const f=fixture();await f.prepare();await f.audio.loadBuffer(SOUND_EFFECTS.cycloneEngineLoop.variants[0].url)
  const loop=f.audio.play('cycloneEngineLoop',{loop:true,playbackRate:.65,filter:{type:'lowpass',frequency:1000}}),shot=f.audio.play('gallantShot')
  const filter=f.audio.voiceFilters.get(loop),gain=f.audio.voiceGains.get(loop)
  assert.equal(loop.target,filter);assert.equal(filter.target,gain);assert.equal(filter.type,'lowpass');assert.equal(loop.playbackRate.value,.65)
  f.audio.modulate(loop,{playbackRate:1.4,gain:.6,frequency:6000})
  assert.deepEqual(loop.playbackRate.events.at(-1),['target',1.4,2,.025])
  assert.equal(gain.gain.value,.6);assert.equal(filter.frequency.value,6000)
  f.audio.modulate(loop,{gain:0,timeConstant:.12});assert.equal(gain.gain.value,0);assert.equal(loop.stoppedAt,undefined)
  f.audio.modulate(loop,{gain:.5});assert.equal(f.audio.voices.size,2);assert.equal(shot.playbackRate.value,1)
  assert.equal(f.requests.length,3);assert.equal(f.decodes.length,3)
  loop.onended();assert.ok(filter.disconnected&&gain.disconnected);assert.equal(f.audio.voiceFilters.size,0)
})

test('the replacement Scout orb plays lower at a fixed pitch, overlaps on one cached buffer, and leaves other SFX unchanged',async()=>{
  const f=fixture(),url=SOUND_EFFECTS.scoutOrb.variants[0].url
  assert.match(url,/\/01-invid-laser.mp3$/);assert.ok(fs.statSync(new URL(url)).size>1000)
  await f.audio.loadBuffer(url);await f.audio.loadBuffer(url)
  const first=f.audio.play('scoutOrb'),second=f.audio.play('scoutOrb')
  assert.equal(first.playbackRate.value,.8);assert.equal(second.playbackRate.value,.8);assert.equal(first.detune.value,0)
  assert.equal(first.buffer,second.buffer);assert.equal(first.loop,false);assert.equal(first.disconnected,undefined)
  assert.equal(f.requests.length,1);assert.equal(f.decodes.length,1)
  assert.equal(f.audio.play('scoutOrb',{playbackRate:.9}).playbackRate.value,.9)
  await f.prepare();assert.equal(f.audio.play('gallantShot').playbackRate.value,1)
})

test('Invid explosions choose the three original files equally, while drones use their separate sound and share cached buffers',async()=>{
  let sample=0
  const f=fixture({random:()=>sample}),variants=SOUND_EFFECTS.invidExplosion.variants
  const urls=[...variants,...SOUND_EFFECTS.droneExplosion.variants,...SOUND_EFFECTS.droneFlight.variants].map(variant=>variant.url)
  for(const url of urls)assert.ok(fs.statSync(new URL(url)).size>1000)
  await Promise.all(urls.map(url=>f.audio.loadBuffer(url)))
  const counts=new Map()
  for(let n=0;n<300;n++){sample=(n+.5)/300;const source=f.audio.play('invidExplosion');counts.set(source.buffer.bytes,(counts.get(source.buffer.bytes)||0)+1);assert.equal(source.playbackRate.value,1);assert.equal(source.loop,false);source.onended()}
  assert.deepEqual(variants.map(variant=>counts.get(variant.url)),[100,100,100])
  const first=f.audio.play('droneExplosion'),second=f.audio.play('droneExplosion')
  assert.match(first.buffer.bytes,/drone-explode.mp3$/);assert.equal(first.buffer,second.buffer);assert.equal(first.loop,false)
  assert.equal(f.requests.length,5);assert.equal(f.decodes.length,5)
})

test('full-volume Invid explosions retain independent per-voice distance gains',async()=>{
  const f=fixture();await f.audio.loadBuffer(SOUND_EFFECTS.invidExplosion.variants[0].url)
  assert.equal(SOUND_EFFECTS.invidExplosion.volume,1)
  const near=f.audio.play('invidExplosion',{gain:1}),far=f.audio.play('invidExplosion',{gain:.2})
  assert.equal(near.target.gain.value,1);assert.equal(far.target.gain.value,.2);assert.equal(far.target.target.gain.value,1)
  assert.equal(near.buffer,far.buffer)
})
