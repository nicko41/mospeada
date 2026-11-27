import {enemyDistanceGain} from './enemyAudio.js'

// One continuous loop while spawned drones live, independent of encounter
// phase changes. The last explosion stops it; the next wave gets a new voice.
export class DroneFlightSound{
  constructor(audio){this.audio=audio;this.loop=null}
  update({encounter,listener,enabled=true,paused=false}){
    let distance=Infinity,alive=0
    for(const drone of encounter?.drones||[]){
      if(!drone.spawned||drone.dead)continue
      alive++
      if(listener)distance=Math.min(distance,Math.hypot(drone.position.x-listener.x,drone.position.y-listener.y,drone.position.z-listener.z))
    }
    if(!alive){if(this.loop)this.audio.stop(this.loop,.1);this.loop=null;return}
    if(this.loop&&this.audio.isPlaying?.(this.loop)===false)this.loop=null
    const gain=enabled&&!paused?(listener?enemyDistanceGain(distance):1):0
    if(gain>0&&!this.loop)this.loop=this.audio.play('droneFlight',{loop:true,fadeIn:.25})
    if(this.loop)this.audio.modulate(this.loop,{gain,timeConstant:paused?.03:.12})
  }
  dispose(){if(this.loop)this.audio.stop(this.loop,0);this.loop=null}
}
