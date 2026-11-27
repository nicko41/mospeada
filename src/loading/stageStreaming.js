import {LEVEL_ASSETS} from './levelAssets.js'
import {loadGLTF,loadTexture,loadJSON,loadAudio,prepareTexture} from './resources.js'
const listeners=new Set(),states=Object.fromEntries(['stage2','stage3','stage4','scouts','horizon','rand'].map(id=>[id,{id,phase:'idle',parts:0,error:''}]))
let revision=0,started=false
const publish=()=>{revision++;listeners.forEach(f=>f())}
const expected={stage2:1,stage3:2,stage4:1,scouts:1,horizon:1,rand:1}
const entered=new Promise(resolve=>{if(typeof window!=='undefined')window.addEventListener('game-ready',resolve,{once:true})})
const graphicsStarted=new Promise(resolve=>{if(typeof window!=='undefined')window.addEventListener('startup-assets-ready',resolve,{once:true})})
export const stageStreaming={states,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},snapshot:()=>revision,
 download(id){
  const state=states[id];if(state.downloadPromise)return state.downloadPromise
  state.phase='fetching';state.startMs=performance.now();publish()
  state.downloadPromise=(async()=>{
   const set=LEVEL_ASSETS[id],combat=id==='stage3'||id==='scouts'
   await Promise.all([Promise.all((set.gltf||[]).map(loadGLTF)),Promise.all((set.texture||[]).map(url=>loadTexture(url,{hold:combat}))),Promise.all((set.json||[]).map(loadJSON)),Promise.all((set.audio||[]).map(loadAudio))])
   state.networkReadyMs=performance.now();publish()
  })().catch(error=>{state.phase='error';state.error=error.message;publish();throw error})
  state.downloadPromise.catch(()=>{});return state.downloadPromise
 },
 prefetchNearRoute(){return this.download('stage3')},
 async fetch(id,renderer){
  const state=states[id];if(state.promise)return state.promise
  state.promise=(async()=>{
   const set=LEVEL_ASSETS[id],combat=id==='stage3'||id==='scouts';await this.download(id)
   // World materials configure their samplers before their own preparation.
   // Combat maps already belong to the initial VFX pools and need an upload
   // here because those pools live outside the deferred scene subtree.
   if(combat){await entered;for(const url of set.texture||[])await prepareTexture(url,renderer,id+' texture')}
   state.phase='mounting';state.downloadedMs=performance.now();publish()
  })().catch(error=>{state.phase='error';state.error=error.message;publish();throw error})
  state.promise.catch(()=>{});return state.promise
 },
 partReady(id,key){const s=states[id];s.preparedParts||=new Set();s.preparedParts.add(key);s.parts=s.preparedParts.size;if(s.parts>=expected[id]){s.preparedMs=performance.now();s.phase=id==='stage4'&&!s.placed?'prepared':'ready';if(s.phase==='ready')s.readyMs=s.preparedMs}publish()},
 placed(id){const s=states[id];if(s.placed)return;s.placed=true;if(s.parts>=expected[id]){s.phase='ready';s.readyMs=performance.now()}publish()},
 unplaced(id){const s=states[id];if(!s.placed)return;s.placed=false;delete s.readyMs;if(s.parts>=expected[id])s.phase='prepared';publish()},
 fail(id,error){const s=states[id];s.phase='error';s.error=error.message;publish()},
 downloaded(id){
  if(states[id].networkReadyMs)return Promise.resolve()
  return new Promise((resolve,reject)=>{const check=()=>{const s=states[id];if(s.networkReadyMs||s.error){listeners.delete(check);s.error?reject(Error(s.error)):resolve()}};listeners.add(check);check()})
 },
 start(renderer){if(started)return;started=true
  // Network priority follows route order. CPU construction/GPU preparation
  // consumes the independent cooperative queue while downloads continue.
  ;(async()=>{
   await this.fetch('stage2',renderer);await graphicsStarted
   this.fetch('stage3',renderer).catch(()=>{});await this.downloaded('stage3')
   this.fetch('stage4',renderer).catch(()=>{});await this.downloaded('stage4')
   await Promise.all([this.fetch('scouts',renderer),this.fetch('rand',renderer)]);await this.fetch('horizon',renderer)
  })().catch(()=>{})
 },
 ready(id){return states[id]?.phase==='ready'},
 prepared(id){return ['prepared','ready'].includes(states[id]?.phase)},
}
