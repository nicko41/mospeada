import { sampleFrontSequence } from './frontTransformMath.js'
import { wheelStartProgress } from './wheelMotion.js'
import { Vector3 } from 'three'
import {returnProgress,sampleReturnPhases,RETURN_BOOST_TIME,RETURN_ASSEMBLY_TIME,RETURN_POSE_TIME} from './returnChoreography.js'

const clamp = n => Math.max(0, Math.min(1, n))
const smooth = n => { const t=clamp(n);return t*t*(3-2*t) }
const ramp=(a,b,n)=>smooth((n-a)/(b-a))
const POSE_TIME=.4, RETURN_TIME=.4
// Start almost immediately after CHEST settles, while the torso is rising.
// Finish before the .4 s T-pose transition ends; no extra assembly-clock wait.
const CUFF_DELAY=.02, CUFF_TRAVEL=.24
const RETURN_TILT=.55, RETURN_DROP_TIME=.22, RETURN_HOLD_TIME=.02, RETURN_LEVEL_TIME=.32

export function canStartFrontTransformation(state) {
  return state?.riderMode==='mounted' && state.speed>0 && !state.reverseIntent
}

// Cinematic director around the existing driving simulation. It supplies
// ordinary wheelie/boost inputs, then one explicit launch of the axle supports.
// Regular driving, wheelie, jump and boost implementations stay untouched.
export class FrontTransformEntry {
  constructor(store,runtime,random=Math.random) {
    this.store=store;this.runtime=runtime;this.state=null;this.phase='idle';this.time=0
    this.random=random;this.transformationCount=0;this.orbitCamera=true
    this.poseBlend=0;this.paused=false;this.flightActive=false;this.messageTime=0;this.elapsed=0;this.returnMotion=null
    this.actorOffset=new Vector3();this.departure=new Vector3();this.returnOffset=new Vector3();this.armorBoostCount=0
    this.returnFlight=false;this.returnLaunchPending=false
    this.mechanicalStarted=false
    this.publish()
  }
  publish(message='') {
    this.store.set({phase:this.phase,poseBlend:this.poseBlend,sequencePaused:this.paused,entryRunning:!['idle','complete'].includes(this.phase)&&!this.paused,inspection:this.poseBlend>0||this.store.snapshot().progress>0,message})
  }
  stage(phase){this.phase=phase;this.time=0;this.publish()}
  request() {
    if(this.runtime.stage3?.encounter.active)return
    if(!this.store.snapshot().ready)return
    const s=this.runtime.state
    if(this.returnFlight)return
    if(this.phase==='complete'||this.phase==='armorboost'){
      this.runtime.armorController?.deactivate()
      // Absorb the cinematic offset at the next physics boundary, then lift
      // the real axle supports. The assembly stays in the same world place.
      this.reverseMotion={...this.choreography,progress:this.store.snapshot().progress}
      this.state=s;this.returnFlight=true;this.returnLaunchPending=true
      this.paused=false;this.store.pause();this.armorBoostCount++;this.stage('returnboost');return
    }
    if(this.phase==='wheelie'||this.phase==='boost'){
      if(this.phase==='boost'&&this.choreography.chestLift>0){
        this.returnMotion={...this.choreography};this.returnFrom=this.poseBlend
        this.paused=false;this.store.pause();this.stage('returning');return
      }
      this.reset();return
    }
    if(this.phase==='reversing'&&this.store.snapshot().progress>0){
      this.paused=false;this.store.set({direction:1,playing:true});this.stage('transforming');return
    }
    if(['airpose','transforming','armorboost','complete','returning'].includes(this.phase)||this.store.snapshot().progress>0||this.poseBlend>0){
      this.reverseMotion={...this.choreography,progress:this.store.snapshot().progress}
      this.returnOffset.copy(this.actorOffset)
      this.paused=false;this.store.set({direction:-1,playing:true});this.stage('reversing');return
    }
    if(!canStartFrontTransformation(s)){
      this.messageTime=2.5;this.publish('Avanzá para transformar · no se activa detenido ni en reversa');return
    }
    this.orbitCamera=this.transformationCount===0||this.random()<.5
    this.transformationCount++
    this.state=s;this.paused=false;this.boostCount=s.boostCount;this.boostAge=-1;this.elapsed=0;this.reverseMotion=null;this.returnMotion=null
    this.actorOffset.set(0,0,0)
    this.returnFlight=false;this.returnLaunchPending=false
    this.mechanicalStarted=false
    s.wheelieTime=0;s.wheelieExhausted=false
    this.store.reset();this.stage('wheelie')
  }
  resetLevelCamera(){this.transformationCount=0;this.orbitCamera=true}
  reset() {
    this.phase='idle';this.time=0;this.poseBlend=0;this.paused=false;this.flightActive=false;this.state=null;this.elapsed=0;this.reverseMotion=null;this.returnMotion=null
    this.actorOffset.set(0,0,0);this.departure.set(0,0,0);this.returnOffset.set(0,0,0)
    this.returnFlight=false;this.returnLaunchPending=false
    this.mechanicalStarted=false
    this.store.reset();this.publish()
  }
  pause(){this.paused=true;this.store.pause();this.publish()}
  resume(){
    if(this.phase==='idle'||this.phase==='complete'){this.request();return}
    this.paused=false
    if(this.phase==='transforming'||this.phase==='reversing')this.store.resume()
    this.publish()
  }
  scrub(progress){
    if(!this.store.snapshot().inspection)return
    this.paused=true;this.poseBlend=1;this.store.seek(progress)
    this.actorOffset.set(0,0,0)
    this.returnFlight=false;this.returnLaunchPending=false
    this.mechanicalStarted=false
    this.phase=this.store.snapshot().progress>=1?'complete':'transforming';this.publish()
  }
  get blocksRiderChange(){return this.phase!=='idle'}
  completeAssembly(){
    if(this.paused||this.returnFlight||this.phase!=='transforming'||this.assemblyProgress<1)return false
    // The mechanical clock starts during torso rise. Its completed animation
    // must not wait for the slower inspection clock to catch up afterwards.
    if(this.store.snapshot().progress<1)this.store.seek(1)
    this.actorOffset.set(0,0,0);this.departure.set(0,0,0);this.stage('complete');return true
  }
  get returnProgress(){return returnProgress(this)}
  get assemblyProgress(){return this.mechanicalStarted?this.mechanicalProgress:this.store.snapshot().progress}
  get mechanicalProgress(){
    const p=this.store.snapshot().progress
    if(this.returnFlight)return sampleReturnPhases(this.returnProgress).mechanical
    if(this.phase==='returning')return(this.returnMotion?.mechanicalProgress??p)*(1-smooth(this.time/RETURN_TIME))
    if(this.phase==='reversing'){
      const from=this.reverseMotion
      return(from?.mechanicalProgress??p)*(from?.progress>0?smooth(p/from.progress):1)
    }
    if(!this.mechanicalStarted)return p
    // Short inspection durations must still let the leg prepare before the
    // wheel reaches Scott; start moving immediately, with a bounded first sweep.
    const preparationDuration=Math.max(2,this.store.snapshot().duration)
    if(this.phase==='airpose')return clamp(wheelStartProgress+this.time/preparationDuration)
    if(this.phase==='transforming')return clamp(wheelStartProgress+POSE_TIME/preparationDuration+p)
    return p
  }
  get actorPose(){
    if(this.returnFlight){
      const tuck=this.phase==='returnboost'?smooth(this.time/.18):1
      return{arms:1,legs:1,returnTuck:tuck,leftToeDown:1-tuck,rightToeDown:1-tuck}
    }
    const sequence=sampleFrontSequence(this.assemblyProgress)
    if(!this.mechanicalStarted)return sequence
    const p=this.mechanicalProgress
    return{...sequence,departureBoost:this.phase==='armorboost'?ramp(0,.10,this.time)*(1-ramp(.30,.65,this.time)):0,legs:Math.max(sequence.legs,ramp(.22,.4,p)),legLift:ramp(.22,.4,p)*(1-ramp(.7,.88,p)),leftToeDown:ramp(.7,.88,p),rightToeDown:ramp(.22,.64,p)}
  }
  get assemblyDuration(){return this.returnFlight?RETURN_ASSEMBLY_TIME:this.store.snapshot().duration}
  get returnTilt(){
    if(!this.returnFlight)return 0
    // Only the completed bike settles tail-first as Scott takes his weight
    // on the pegs. Armor and the entire assembly sequence stay upright.
    const t=this.phase==='returnpose'?this.time:this.phase==='falling'?RETURN_POSE_TIME+this.time:-1
    if(t<0)return 0
    return RETURN_TILT*smooth(t/RETURN_DROP_TIME)*(1-smooth((t-RETURN_DROP_TIME-RETURN_HOLD_TIME)/RETURN_LEVEL_TIME))
  }
  get armorBoostLevel(){return this.phase==='returnboost'?Math.max(0,1-this.time/RETURN_BOOST_TIME):this.phase==='armorboost'?Math.max(0,1-this.time/.42):0}
  get upwardBoost(){return this.phase==='returnboost'}
  get cameraProgress(){return this.orbitCamera?this.framingProgress:null}
  get framingProgress(){
    if(['idle','reversing','returning','returnboost','returnpose','falling'].includes(this.phase))return null
    if(this.mechanicalStarted)return this.assemblyProgress
    return ['complete','armorboost'].includes(this.phase)?1:clamp(this.elapsed/(this.store.snapshot().duration+.8))
  }
  get choreography(){
    if(this.phase==='idle')return null
    const sequence=sampleFrontSequence(this.assemblyProgress)
    if(this.phase==='returning'){
      const fade=1-smooth(this.time/RETURN_TIME),from=this.returnMotion
      if(!from)return null
      return{turn:(from.turn||0)*fade,separate:(from.separate||0)*fade,chestLift:(from.chestLift||0)*fade,torsoFollow:from.chestLift?1:0,cuffs:(from.cuffs??0)*fade,covers:sequence.covers,fold:sequence.fold,mechanicalProgress:this.mechanicalProgress}
    }
    if(this.phase==='reversing'||this.returnFlight){
      const from=this.reverseMotion,fade=from?.progress>0?smooth(this.store.snapshot().progress/Math.min(.25,from.progress)):1
      return{turn:(from?.turn??1)*fade,separate:(from?.separate??1)*fade,chestLift:(from?.chestLift??1)*fade,torsoFollow:from?.torsoFollow||0,cuffs:(from?.cuffs??1)*fade,covers:sequence.covers,fold:sequence.fold,mechanicalProgress:this.mechanicalProgress}
    }
    const chestLift=this.phase==='wheelie'?0:this.phase==='boost'?smooth(Math.max(0,this.boostAge)/.14):1
    const cuffs=this.phase==='wheelie'||this.phase==='boost'?0:this.phase==='airpose'?clamp((this.time-CUFF_DELAY)/CUFF_TRAVEL):1
    return{turn:smooth(this.elapsed/.36),covers:sequence.covers,separate:smooth((this.elapsed-.36)/.18),fold:sequence.fold,chestLift,cuffs,torsoFollow:this.phase==='boost'||this.phase==='airpose'?1:0,mechanicalProgress:this.mechanicalProgress}
  }
  get physicsConfig(){return this.flightActive?{flightEnabled:true,airGravityScale:this.gravityScale}:null}
  beforePhysics(input,dt) {
    const s=this.runtime.state
    if(this.state&&s!==this.state){this.reset();return input}
    if(this.messageTime>0){this.messageTime-=dt;if(this.messageTime<=0)this.publish()}
    if(this.phase==='idle'||this.phase==='complete')return input
    if(s.riderMode!=='mounted'){this.reset();return input}
    if(!this.paused){this.time+=dt;this.elapsed+=dt}
    if((this.phase==='wheelie'||this.phase==='boost')&&(s.blocked||s.speed<=0||this.time>5)){this.reset();return input}
    if(this.phase==='wheelie'||this.phase==='boost')return{...input,throttle:1,wheelie:true,boost:this.phase==='boost'&&this.boostAge<0&&!this.paused,brake:0,brakeReverse:false,reverse:false,handbrake:false}
    if(this.returnFlight)return{...input,wheelie:false,boost:false,reverse:false,brakeReverse:false,handbrake:false}
    return input
  }
  afterPhysics(dt,metrics,config) {
    const s=this.runtime.state
    if(this.flightActive&&!s.airborne&&s.frontGrounded&&s.rearGrounded)this.flightActive=false
    if(this.paused||dt<=0)return
    if(this.phase==='returnboost'){
      if(this.returnLaunchPending){
        this.returnLaunchPending=false
        s.x+=this.actorOffset.x;s.z+=this.actorOffset.z
        s.frontSpring+=this.actorOffset.y;s.rearSpring+=this.actorOffset.y
        this.actorOffset.set(0,0,0)
        this.launch(s,metrics,config,RETURN_BOOST_TIME+RETURN_ASSEMBLY_TIME+RETURN_POSE_TIME+.35,3)
      }
      if(this.time>=RETURN_BOOST_TIME){this.store.set({direction:-1,playing:true});this.stage('reversing')}
    }
    // Descending terrain can unload the rear wheel, so its exhibition wheelie
    // cannot reach the supported angle. Continue the cinematic from that real
    // airborne frame instead of waiting for flat ground to regain traction.
    else if(this.phase==='wheelie'&&this.time>=.4&&(s.wheelieAngle>=.42||!s.rearGrounded)){this.boostCount=s.boostCount;this.stage('boost')}
    else if(this.phase==='boost'){
      if(this.boostAge<0&&s.boostCount>this.boostCount)this.boostAge=0
      if(this.boostAge>=0)this.boostAge+=dt
      if(this.boostAge>=.14){this.launch(s,metrics,config);this.mechanicalStarted=true;this.stage('airpose')}
    }
    else if(this.phase==='airpose'){
      if(!s.airborne)return
      this.poseBlend=smooth(this.time/POSE_TIME);this.publish()
      if(this.time>=POSE_TIME){this.poseBlend=1;this.store.set({progress:0,direction:1,playing:true});this.stage('transforming')}
    }
    else if(this.phase==='transforming'&&this.assemblyProgress>=1){
      // Assembly completion releases Armor controls immediately. No final
      // cinematic boost, leg-opening gesture or presentation-only travel.
      this.completeAssembly()
    }
    else if(this.phase==='reversing'){
      const p=this.store.snapshot().progress
      if(this.returnFlight){
        // Hold the tucked legs and forward-bent elbows until the last part
        // returns. Only the completed bike receives the standing jump pose.
        this.poseBlend=1
        if(p<=0){this.flightActive=false;this.store.pause();this.stage('returnpose')}
      }else{
        this.actorOffset.copy(this.returnOffset).multiplyScalar(smooth(p/(this.reverseMotion?.progress||1)))
        if(p<=0){this.returnFrom=this.poseBlend;this.returnMotion={...this.choreography};this.store.pause();this.stage('returning')}
      }
    }
    else if(this.phase==='returnpose'){
      this.poseBlend=1-smooth(this.time/RETURN_POSE_TIME);this.publish()
      if(this.time>=RETURN_POSE_TIME){this.poseBlend=0;this.stage('falling')}
    }
    else if(this.phase==='falling'){
      if(s.frontGrounded&&s.rearGrounded&&!s.airborne){this.state=null;this.returnFlight=false;this.stage('idle')}
    }
    else if(this.phase==='returning'){
      this.poseBlend=this.returnFrom*(1-smooth(this.time/RETURN_TIME));this.publish()
      if(this.time>=RETURN_TIME){this.poseBlend=0;this.state=null;this.stage('idle')}
    }
  }
  launch(s,m,c,airTime=POSE_TIME+this.store.snapshot().duration+.6,apex=3.8) {
    // Default duration: about three seconds aloft with a 3.8 m apex. Slower
    // inspection durations receive their own gravity, never a global setting.
    const velocity=4*apex/airTime,gravity=8*apex/(airTime*airTime)
    this.gravityScale=gravity/c.gravity;this.flightActive=true
    s.frontSpring=Math.max(s.frontSpring,s.frontTarget+c.forkExtension*.872+.1)
    s.rearSpring=Math.max(s.rearSpring,s.rearTarget+c.rearExtension+.1)
    s.frontVelocity=velocity;s.rearVelocity=velocity;s.verticalVelocity=velocity
    s.frontGrounded=false;s.rearGrounded=false;s.frontTerrainGrounded=false;s.frontWheelieLifted=false
    s.frontAirGap=.1;s.rearAirGap=.1;s.airborne=true;s.airTime=0;s.parked=false
    s.height=(s.frontSpring+s.rearSpring)/2;s.pitch=-Math.atan2(s.frontSpring-s.rearSpring,m.wheelbase)
  }
}
