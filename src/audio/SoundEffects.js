const volume=value=>Math.max(0,Math.min(1,Number(value)||0))

// Buffers and effect gains are shared. Only the inexpensive one-shot source
// is new for each voice, so consecutive effects can overlap naturally.
export class SoundEffects{
  constructor(effects,{createContext=()=>{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;return Context?new Context({latencyHint:'interactive'}):null},fetchAudio=url=>fetch(url),random=Math.random,masterVolume=1}={}){
    this.effects=effects;this.createContext=createContext;this.fetchAudio=fetchAudio;this.random=random
    this.masterVolume=volume(masterVolume);this.volumes=new Map();this.buffers=new Map();this.pending=new Map();this.gains=new Map();this.voices=new Set();this.voiceGains=new Map();this.voiceFilters=new Map()
  }
  context(){
    if(!this.audioContext){
      this.audioContext=this.createContext()
      if(this.audioContext){this.master=this.audioContext.createGain();this.master.gain.value=this.masterVolume;this.master.connect(this.audioContext.destination)}
    }
    return this.audioContext
  }
  loadBuffer(url){
    if(this.pending.has(url))return this.pending.get(url)
    const promise=(async()=>{
      const context=this.context()
      if(!context)return null // Unsupported browsers must still enter gameplay.
      const response=await this.fetchAudio(url)
      if(!response.ok)throw Error(`${response.status}: ${url}`)
      const buffer=await context.decodeAudioData(await response.arrayBuffer())
      this.buffers.set(url,buffer);return buffer
    })()
    this.pending.set(url,promise)
    promise.catch(()=>this.pending.delete(url))
    return promise
  }
  unlock(){
    // Called synchronously inside the player's gesture, never from a frame or
    // an async loading continuation. Failed unlocks retry on the next gesture.
    try{const context=this.context();if(context&&context.state!=='running')return Promise.resolve(context.resume()).catch(()=>{})}catch{}
    return Promise.resolve()
  }
  installUnlock(target){
    const unlock=()=>{this.unlock()}
    target.addEventListener('pointerdown',unlock,true);target.addEventListener('keydown',unlock,true)
    return()=>{target.removeEventListener('pointerdown',unlock,true);target.removeEventListener('keydown',unlock,true)}
  }
  getVolume(name){return this.volumes.get(name)??this.effects[name]?.volume??1}
  setVolume(name,value){
    if(!this.effects[name])throw Error(`Unknown sound effect: ${name}`)
    const level=volume(value);this.volumes.set(name,level)
    if(this.gains.has(name))this.gains.get(name).gain.value=level
  }
  setMasterVolume(value){this.masterVolume=volume(value);if(this.master)this.master.gain.value=this.masterVolume}
  isPlaying(source){return this.voices.has(source)}
  modulate(source,{playbackRate,gain,frequency,timeConstant=.025}){
    if(!this.voices.has(source))return
    const now=this.audioContext.currentTime
    const automate=(param,value)=>{
      if(!param||!Number.isFinite(value))return
      if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now)
      else{param.cancelScheduledValues(now);param.setValueAtTime(param.value,now)}
      param.setTargetAtTime(value,now,Math.max(.005,timeConstant))
    }
    automate(source.playbackRate,playbackRate)
    automate(this.voiceGains.get(source)?.gain,gain)
    automate(this.voiceFilters.get(source)?.frequency,frequency)
  }
  stop(source,fadeOut=.08){
    if(!this.voices.has(source))return
    try{
      const gain=this.voiceGains.get(source),context=this.audioContext
      if(gain&&fadeOut>0&&context.state==='running'){
        const now=context.currentTime
        gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+fadeOut)
        source.stop(now+fadeOut)
      }else source.stop()
    }catch{}
  }
  play(name,{loop=false,fadeIn=0,filter=null,playbackRate,gain=1}={}){
    const effect=this.effects[name],context=this.audioContext
    // Never fetch, decode, resume, or queue a late shot in the gameplay path.
    if(!effect||context?.state!=='running')return null
    const total=effect.variants.reduce((sum,v)=>sum+v.weight,0)
    let choice=this.random()*total,variant=effect.variants.at(-1)
    for(const candidate of effect.variants){choice-=candidate.weight;if(choice<0){variant=candidate;break}}
    const buffer=this.buffers.get(variant.url)
    if(!buffer)return null
    const voiceVolume=volume(variant.volume??1)*volume(gain)
    let source,voiceGain,voiceFilter
    try{
      let gain=this.gains.get(name)
      if(!gain){gain=context.createGain();gain.gain.value=this.getVolume(name);gain.connect(this.master);this.gains.set(name,gain)}
      source=context.createBufferSource();source.buffer=buffer;source.loop=loop;source.playbackRate.value=playbackRate??variant.playbackRate??effect.playbackRate??1
      // Fixed per-effect pitch and explicit loop rates share the same cached
      // buffers. Unconfigured effects retain playbackRate=1 and detune=0.
      if(loop||fadeIn>0||filter||voiceVolume!==1){
        voiceGain=context.createGain();voiceGain.gain.value=voiceVolume;voiceGain.connect(gain);this.voiceGains.set(source,voiceGain)
        if(filter){voiceFilter=context.createBiquadFilter();voiceFilter.type=filter.type||'lowpass';voiceFilter.frequency.value=filter.frequency??18000;voiceFilter.Q.value=.7;source.connect(voiceFilter);voiceFilter.connect(voiceGain);this.voiceFilters.set(source,voiceFilter)}
        else source.connect(voiceGain)
        if(fadeIn>0){voiceGain.gain.setValueAtTime(0,context.currentTime);voiceGain.gain.linearRampToValueAtTime(voiceVolume,context.currentTime+fadeIn)}
      }else source.connect(gain)
      this.voices.add(source)
      source.onended=()=>{source.disconnect();voiceFilter?.disconnect();voiceGain?.disconnect();this.voiceGains.delete(source);this.voiceFilters.delete(source);this.voices.delete(source)}
      source.start();return source
    }catch{if(source){source.disconnect();this.voiceGains.delete(source);this.voiceFilters.delete(source);this.voices.delete(source)}voiceFilter?.disconnect();voiceGain?.disconnect();return null}
  }
}
