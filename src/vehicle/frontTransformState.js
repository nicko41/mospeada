const listeners = new Set()
let entry=null
let value = { ready:false, error:'', progress:0, duration:2, playing:false, direction:1, surfaces:0, warnings:[], phase:'idle',poseBlend:0,sequencePaused:false,entryRunning:false,inspection:false,message:'' }
export const frontTransformState = {
  snapshot:()=>value,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
  set(next){value={...value,...next};listeners.forEach(fn=>fn())},
  bindEntry(controller){entry=controller},
  request(){entry?.request()},
  restart(){if(entry)entry.reset();else this.reset()},
  pauseSequence(){entry?.pause()},
  resumeSequence(){entry?.resume()},
  scrub(progress){entry?.scrub(progress)},
  stepSequence(seconds){entry?.scrub(value.progress+seconds/value.duration)},
  toggle(){if(!value.ready)return;this.set({direction:value.playing ? -value.direction : value.progress>=1 ? -1 : 1,playing:true})},
  pause(){this.set({playing:false})},
  resume(){if(value.ready)this.set({direction:value.progress>=1?-1:value.progress<=0?1:value.direction,playing:true})},
  seek(progress){this.set({progress:Math.max(0,Math.min(1,Number(progress)||0)),playing:false})},
  step(seconds){this.seek(value.progress+seconds/value.duration)},
  duration(seconds){this.set({duration:Math.max(.5,Math.min(8,Number(seconds)||2))})},
  reset(){this.set({progress:0,playing:false,direction:1})},
  advance(dt,duration=value.duration){
    if(!value.playing||!value.ready||dt<=0)return
    const raw=value.progress+value.direction*dt/duration
    const progress=raw<1e-10?0:raw>1-1e-10?1:raw
    this.set({progress,playing:progress>0&&progress<1})
  },
}
