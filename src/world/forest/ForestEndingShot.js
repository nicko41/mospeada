import {MathUtils,Quaternion,Vector3} from 'three'
import {createBikeState,advanceBike} from '../../vehicle/bikePhysics.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {setCameraFov} from '../../vehicle/cameraFraming.js'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'
import {FOREST_MUSIC} from './ForestMusic.js'

const timing={victoryHold:4.2,cut:.35,blackHold:4,audioFade:FOREST_MUSIC.victoryFade,audioEnd:FOREST_MUSIC.victoryEnd}
const rideDuration=timing.audioEnd-timing.victoryHold-timing.cut-timing.blackHold-timing.audioFade,stretch=rideDuration/9.2
export const FOREST_ENDING=Object.freeze({
  ...timing,victoryOrbit:1.5,victoryRadius:6.5,victoryHeight:2.6,
  fadeIn:.45,pullback:4.8*stretch,accelerate:5.2*stretch,releaseCamera:1.6*stretch,
  fadeStart:7.7*stretch,duration:rideDuration,near:1.85,wide:11,drift:.38/stretch,fov:38,
  speed:18,scottExitSpeed:42,randExitSpeed:37,randLane:2.8,randLead:1.8,
})
const up=new Vector3(0,1,0),free=()=>true

// A victory-only director. Both existing bikes still use advanceBike, native
// suspension, rider poses, wheel spins, dust and the rear-pivot Ctrl wheelie.
export class ForestEndingShot{
  constructor(runtime,sample,{onPhase=()=>{},onOpacity=()=>{},onVictoryFrame=()=>{},onComplete=()=>{}}={}){
    Object.assign(this,{runtime,sample,onPhase,onOpacity,onVictoryFrame,onComplete})
    this.head=new Vector3();this.focus=new Vector3();this.victoryCamera=new Vector3();this.victoryCenter=new Vector3();this.victoryRotation=new Quaternion();this.desiredRotation=new Quaternion();this.actorState=null;this.phase='idle';this.age=0;this.elapsed=0;this.opacity=0;this.composed=false;this.headOffset=null
  }
  get holding(){return this.phase!=='idle'}
  setPhase(phase){this.phase=phase;this.age=0;this.phaseStarted=this.elapsed;this.onPhase(phase)}
  advanceClock(dt){
    const music=this.runtime.opening?.music,audio=music?.tracks?.victory
    const playing=audio&&!music.failed?.has('victory')&&!audio.ended&&(this.audioClock||!audio.paused&&audio.readyState>=2)
    if(playing){this.audioClock=true;this.elapsed=Math.max(this.elapsed,audio.currentTime)}
    else this.elapsed+=dt
    this.age=this.elapsed-this.phaseStarted
  }
  rideTime(){return this.age*FOREST_ENDING.duration/this.rideDuration}
  veil(value){this.opacity=value;this.onOpacity(value)}
  begin(){
    const r=this.runtime
    if(this.holding||!r.randEscape?.active)return false
    this.orbit=r.orbit?{enabled:r.orbit.enabled,damping:r.orbit.enableDamping}:null
    if(r.orbit){r.orbit.enabled=false;r.orbit.enableDamping=false}
    r.cameraController?.end();r.cameraController?.middleLook?.end?.()
    r.keys={};r.input={};r.boostQueued=false
    if(r.gallant){r.gallant.aiming=r.gallant.firing=r.gallant.missileQueued=false;r.gallant.aimLock.clear()}
    this.victoryElapsed=0;this.victoryAngle=null;this.elapsed=0;this.audioClock=false
    r.desertPatrol?.stopCombat();r.opening?.music?.startVictory?.();this.setPhase('victory');this.onVictoryFrame(0);this.veil(0);return true
  }
  reset(){
    const r=this.runtime
    if(this.holding)r.opening?.music?.cancelVictory?.()
    if(this.camera&&this.oldFov!==undefined)setCameraFov(this.camera,this.oldFov)
    if(this.orbit&&r.orbit){r.orbit.enabled=this.orbit.enabled;r.orbit.enableDamping=this.orbit.damping}
    this.camera=null;this.oldFov=undefined;this.orbit=null;this.composed=false;this.headOffset=null
    this.elapsed=0;this.audioClock=false;this.setPhase('idle');this.veil(0);this.actorState=r.state
  }
  compose(world){
    const r=this.runtime,rand=r.randEscape,depth=Math.max(C.start+C.descent+60,world.distance(r.state.z)+100)
    world.updateClimax(depth,depth)
    const x=world.position.x+climaxPathX(depth),z=world.position.z-depth,rx=x-FOREST_ENDING.randLane,rz=z-FOREST_ENDING.randLead
    for(const [px,pz,m]of [[x,z,r.vehicleRig.metrics],[rx,rz,rand.metrics]])for(const at of [m.frontZ,m.rearZ])if(!Number.isFinite(this.sample(px,pz-at)))return false
    // Recompose only behind the short black cut, including Armor victories.
    r.armorController?.reset();r.transformEntry?.reset();r.scottInstance?.missilePose?.cancel()
    r.scottInstance?.armorArticulation?.restore();r.combatVFX?.clear();r.missileVFX?.clear()
    if(r.gallant)for(const missile of r.gallant.missiles?.records||[])missile.active=false
    Object.assign(r.state,createBikeState({x,z,yaw:Math.PI},r.vehicleRig.metrics,this.sample))
    rand.state=createBikeState({x:rx,z:rz,yaw:Math.PI},rand.metrics,this.sample)
    for(const s of [r.state,rand.state]){s.speed=FOREST_ENDING.speed;s.parked=false;s.idleBlend=0}
    rand.active=true;rand.protected=true;rand.lookWeight=0;rand.threats=[];rand.state.randLook=0
    this.rideDuration=Math.max(.1,FOREST_ENDING.audioEnd-FOREST_ENDING.blackHold-FOREST_ENDING.audioFade-this.elapsed)
    this.laneX=x;this.cameraZ=z-.55;this.syncRand();this.composed=true;this.setPhase('ride');return true
  }
  syncRand(){
    const rand=this.runtime.randEscape,s=rand.state
    rand.x=s.x;rand.z=s.z;rand.height=s.height;rand.speed=s.speed
    rand.position.set(s.x,s.height,s.z);rand.forward.set(Math.sin(s.yaw),0,Math.cos(s.yaw))
    rand.vx=rand.forward.x*s.speed;rand.vz=rand.forward.z*s.speed;rand.vy=s.verticalVelocity||0
  }
  advanceVictory(dt){
    const r=this.runtime,armor=r.armorController,s=r.state
    if(armor?.active&&armor.state){
      if(!armor.state.groundLanding&&(armor.state.mode==='ARMOR_HOVER'||!armor.state.grounded))armor.startLanding('toggle')
      armor.update({forward:0,side:0,yaw:armor.state.yaw,boost:false,rise:false,descend:false},dt)
      return armor.state.grounded&&(!armor.state.groundLanding||armor.state.groundLanding.finished)
    }
    advanceBike(s,{throttle:0,steer:0,brake:.25,boost:false,wheelie:false},dt,r.vehicleRig.metrics,this.sample,free,bikeConfig)
    return !s.airborne&&s.frontGrounded&&s.rearGrounded&&s.wheelieAngle<.05
  }
  update(delta,world){
    const r=this.runtime
    if(this.actorState!==r.state){this.reset();return}
    if(!this.holding&&r.climaxSequence?.phase==='victory'&&r.climaxSequence.completed)this.begin()
    if(!this.holding||this.phase==='done'||r.paused||!world?.bound)return
    const dt=Math.min(.1,Math.max(0,delta));this.advanceClock(dt)
    if(this.phase==='victory'){
      this.victoryElapsed+=dt;const landed=this.advanceVictory(dt);this.onVictoryFrame(this.age)
      if(this.age>=FOREST_ENDING.victoryHold&&landed)this.setPhase('cut')
      return
    }
    if(this.phase==='black-hold'){
      if(this.elapsed>=FOREST_ENDING.audioEnd-FOREST_ENDING.audioFade)this.setPhase('audio-out')
      return
    }
    if(this.phase==='audio-out'){
      r.opening?.music?.setVictoryGain?.(1-MathUtils.smoothstep(this.elapsed,FOREST_ENDING.audioEnd-FOREST_ENDING.audioFade,FOREST_ENDING.audioEnd))
      if(this.elapsed>=FOREST_ENDING.audioEnd){r.opening?.music?.finishVictory?.();this.setPhase('done');r.paused=true;r.keys={};this.onComplete()}
      return
    }
    if(this.phase==='cut'){
      this.victoryElapsed+=dt;this.advanceVictory(dt)
      this.veil(MathUtils.smoothstep(this.age,0,FOREST_ENDING.cut))
      if(this.age>=FOREST_ENDING.cut)this.compose(world)
      return
    }
    const t=this.rideTime(),depart=t>=FOREST_ENDING.accelerate
    const steps=Math.max(1,Math.ceil(dt/bikeConfig.fixedStep)),step=dt/steps
    for(let i=0;i<steps;i++)for(const [s,m,target,wheelie]of [
      [r.state,r.vehicleRig.metrics,depart?FOREST_ENDING.scottExitSpeed:FOREST_ENDING.speed,depart],
      [r.randEscape.state,r.randEscape.metrics,depart?FOREST_ENDING.randExitSpeed:FOREST_ENDING.speed,false],
    ])advanceBike(s,{throttle:MathUtils.clamp((target-s.speed)*.35,0,1),steer:0,wheelie},step,m,this.sample,free,bikeConfig)
    this.syncRand()
    if(!depart)this.cameraZ=r.state.z-.55
    else this.cameraZ-=FOREST_ENDING.speed*(1-MathUtils.smoothstep(t,FOREST_ENDING.accelerate,FOREST_ENDING.accelerate+FOREST_ENDING.releaseCamera))*dt
    this.veil(Math.max(1-MathUtils.smoothstep(t,0,FOREST_ENDING.fadeIn),MathUtils.smoothstep(t,FOREST_ENDING.fadeStart,FOREST_ENDING.duration)))
    if(t>=FOREST_ENDING.duration){this.setPhase('black-hold');this.veil(1)}
  }
  presentCamera(camera){
    if(!this.holding)return
    const r=this.runtime,t=['done','audio-out','black-hold'].includes(this.phase)?FOREST_ENDING.duration:this.composed?this.rideTime():this.age
    if(!this.camera){this.camera=camera;this.oldFov=camera.fov}
    if(!this.composed){
      const hip=r.scottInstance?.bones?.get('mixamorigHips')
      if(hip)hip.getWorldPosition(this.focus);else this.focus.set(r.state.x,r.state.height+1,r.state.z)
      if(this.victoryAngle===null){this.victoryCamera.copy(camera.position);this.victoryCenter.copy(this.focus);this.victoryRotation.copy(camera.quaternion);this.victoryAngle=Math.atan2(camera.position.x-this.focus.x,camera.position.z-this.focus.z)}
      const time=this.victoryElapsed,angle=this.victoryAngle+FOREST_ENDING.victoryOrbit*(time-.35*(1-Math.exp(-time/.35))),blend=MathUtils.smoothstep(time,0,1)
      const x=this.focus.x+Math.sin(angle)*FOREST_ENDING.victoryRadius,z=this.focus.z+Math.cos(angle)*FOREST_ENDING.victoryRadius,y=this.focus.y+FOREST_ENDING.victoryHeight
      this.head.copy(this.victoryCamera).add(this.focus).sub(this.victoryCenter)
      camera.position.set(MathUtils.lerp(this.head.x,x,blend),MathUtils.lerp(this.head.y,y,blend),MathUtils.lerp(this.head.z,z,blend))
      camera.lookAt(this.focus);this.desiredRotation.copy(camera.quaternion);camera.quaternion.slerpQuaternions(this.victoryRotation,this.desiredRotation,blend);setCameraFov(camera,MathUtils.lerp(this.oldFov,48,blend));camera.updateMatrixWorld(true);return
    }
    if(this.headOffset===null){
      const head=r.scottInstance?.bones?.get('mixamorigHead')
      if(head)head.getWorldPosition(this.head)
      this.headOffset=head?this.head.y-r.state.height:1.8
    }
    const distance=MathUtils.lerp(FOREST_ENDING.near,FOREST_ENDING.wide,MathUtils.smoothstep(t,0,FOREST_ENDING.pullback))+Math.max(0,t-FOREST_ENDING.pullback)*FOREST_ENDING.drift
    camera.position.set(this.laneX+distance,r.state.height+this.headOffset,this.cameraZ)
    // Fixed east-to-west optical axis: world -Z always travels screen right.
    camera.quaternion.setFromAxisAngle(up,Math.PI/2);setCameraFov(camera,FOREST_ENDING.fov);camera.updateMatrixWorld(true)
  }
}
