import {FOREST_STAGE4,stage4Edge} from './forestStage4Config.js'

export const FOREST_MUSIC=Object.freeze({introEnd:33,crossfade:4,desertFade:.8,volume:.48,victoryEnd:25,victoryFade:2})
const clamp=n=>Math.max(0,Math.min(1,n))

export function reachedDesertDrop(state,world){
  if(!state||!world?.bound||!world.contains(state.x,state.z))return false
  const edge=stage4Edge(state.x-world.position.x)
  return world.distance(state.z)>=edge&&(state.airborne||state.height<world.position.y-FOREST_STAGE4.drop*.5)
}

// Streamed HTML audio elements, sharing the opening's original player.
// Media time drives the 33 s cue; no decoded WebAudio buffers or timer loop.
export class ForestMusic{
  constructor(urls,{createAudio=url=>new Audio(url),volume=FOREST_MUSIC.volume}={}){
    this.volume=volume;this.tracks={};this.needed=new Set();this.pending=new Map();this.blocked=new Set();this.failed=new Set();this.phase='intro';this.started=false;this.suspended=false;this.disposed=false
    for(const [key,url]of Object.entries(urls)){
      const audio=this.tracks[key]=createAudio(url)
      audio.preload='auto';audio.volume=0;audio.loop=key!=='intro'&&key!=='victory';audio.load()
      audio.addEventListener('error',()=>this.failed.add(key))
    }
  }
  play(key,retry=false){
    if(this.disposed||this.suspended||this.failed.has(key))return Promise.resolve()
    if(retry)this.blocked.delete(key)
    if(this.pending.has(key))return this.pending.get(key)
    const audio=this.tracks[key]
    if(!audio.paused||this.blocked.has(key))return Promise.resolve()
    // Invoke play synchronously so a pointer/key gesture authorizes this element.
    let playing
    try{playing=audio.play()}catch(error){playing=Promise.reject(error)}
    const pending=Promise.resolve(playing).then(()=>{
      if(this.disposed||this.suspended||!this.needed.has(key))audio.pause()
    }).catch(error=>{
      if(error.name==='NotAllowedError')this.blocked.add(key)
      else if(error.name!=='AbortError')this.failed.add(key)
      throw error
    }).finally(()=>{if(this.pending.get(key)===pending)this.pending.delete(key)})
    this.pending.set(key,pending);return pending
  }
  startIntro(){this.started=true;this.needed.add('intro');return this.play('intro',true)}
  startLifeline(){this.started=true;this.phase='lifeline';this.needed.add('lifeline');this.tracks.lifeline.volume=this.volume;return this.play('lifeline',true)}
  unlock(){if(!this.suspended)for(const key of this.needed)this.play(key,true).catch(()=>{})}
  suspend(value){
    if(this.suspended===value)return
    this.suspended=value
    if(value)for(const audio of Object.values(this.tracks))audio.pause()
    else for(const key of this.needed)this.play(key).catch(()=>{})
  }
  stop(key){this.tracks[key].volume=0;this.tracks[key].pause();this.needed.delete(key)}
  startVictory(){
    if(this.disposed||this.phase==='victory'||this.phase==='complete')return Promise.resolve()
    for(const key of [...this.needed])this.stop(key)
    this.started=true;this.phase='victory';this.victoryGain=1
    const audio=this.tracks.victory;if(!audio)return Promise.resolve()
    audio.currentTime=0;audio.volume=this.volume;this.needed.add('victory')
    return this.play('victory',true).catch(()=>{})
  }
  setVictoryGain(value){this.victoryGain=clamp(value);if(this.tracks.victory)this.tracks.victory.volume=this.volume*this.victoryGain}
  finishVictory(){if(this.tracks.victory){this.stop('victory');if(this.tracks.victory.currentTime>FOREST_MUSIC.victoryEnd)this.tracks.victory.currentTime=FOREST_MUSIC.victoryEnd}this.phase='complete'}
  cancelVictory(){
    if(this.disposed||this.phase!=='victory'&&this.phase!=='complete')return
    if(this.tracks.victory)this.stop('victory')
    this.startLifeline().catch(()=>{})
  }
  enterDesert(){
    if(this.phase==='cyclone'||this.phase==='victory'||this.phase==='complete')return
    this.started=true;this.phase='cyclone';this.desertAge=0
    this.outgoing={intro:this.tracks.intro.volume,lifeline:this.tracks.lifeline.volume}
    this.needed.add('cyclone');this.play('cyclone').catch(()=>{})
  }
  update(delta,{paused=false,state,world}={}){
    this.suspend(paused)
    if(this.disposed||this.suspended||!this.started)return
    if(reachedDesertDrop(state,world))this.enterDesert()
    if(this.phase==='victory'){
      const time=this.tracks.victory?.currentTime||0
      const fade=clamp((FOREST_MUSIC.victoryEnd-time)/FOREST_MUSIC.victoryFade)
      this.setVictoryGain(Math.min(this.victoryGain,fade*fade*(3-2*fade)))
      if(time>=FOREST_MUSIC.victoryEnd)this.finishVictory()
    }else if(this.phase==='intro'){
      const time=this.tracks.intro.currentTime
      const blend=clamp((time-(FOREST_MUSIC.introEnd-FOREST_MUSIC.crossfade))/FOREST_MUSIC.crossfade)
      this.tracks.intro.volume=this.volume*Math.min(1,time)*(1-blend)
      if(time>=FOREST_MUSIC.introEnd-FOREST_MUSIC.crossfade){this.needed.add('lifeline');this.tracks.lifeline.volume=this.volume*blend}
      if(time>=FOREST_MUSIC.introEnd||this.failed.has('intro')||this.tracks.intro.ended){
        this.stop('intro');this.phase='lifeline';this.needed.add('lifeline');this.tracks.lifeline.volume=this.volume
      }
    }else if(this.phase==='cyclone'){
      // Wait for real playback before advancing this short transition, so a
      // blocked/buffering incoming track cannot fade both outgoing tracks to silence.
      if(!this.tracks.cyclone.paused&&this.tracks.cyclone.readyState>=2)this.desertAge+=Math.max(0,Math.min(delta,.1))
      const blend=clamp(this.desertAge/FOREST_MUSIC.desertFade)
      this.tracks.cyclone.volume=this.volume*blend
      for(const key of ['intro','lifeline']){
        this.tracks[key].volume=this.outgoing[key]*(1-blend)
        if(blend===1&&this.needed.has(key))this.stop(key)
      }
    }
    for(const key of this.needed)this.play(key).catch(()=>{})
  }
  dispose(){
    this.disposed=true;this.needed.clear()
    for(const audio of Object.values(this.tracks)){audio.pause();audio.removeAttribute('src');audio.load()}
  }
}
