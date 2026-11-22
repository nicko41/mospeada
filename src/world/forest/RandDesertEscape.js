import {CatmullRomCurve3,MathUtils,Vector3} from 'three'
import {createBikeState} from '../../vehicle/bikePhysics.js'
import {FOREST_STAGE4} from './forestStage4Config.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {updateRoadResponse} from '../../vehicle/roadResponse.js'
import {updateVerticalDynamics} from '../../vehicle/verticalDynamics.js'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'

export const RAND_ESCAPE=Object.freeze({speed:19,centerFollow:3,margin:240})
// One broad irregular circuit in the real desert. It keeps moving without
// teleports or a finite route endpoint while Scott fights the patrol.
const course=new CatmullRomCurve3([[180,-20],[100,-155],[-85,-180],[-200,-60],[-140,100],[45,130],[170,80]].map(([x,z])=>new Vector3(x,0,z)),true,'centripetal')
course.arcLengthDivisions=2048;course.updateArcLengths()
const courseLength=course.getLength()
export class RandDesertEscape{
  constructor(sample,metrics){
    this.sample=sample;this.metrics=metrics;this.position=new Vector3();this.forward=new Vector3(0,0,-1);this.center=new Vector3();this.offset=new Vector3();this.tangent=new Vector3();this.previous=new Vector3();this.lookAt=new Vector3();this.reset()
  }
  reset(){this.active=false;this.distance=0;this.time=0;this.hits=0;this.hitFlash=0;this.vx=this.vy=this.vz=0;this.state=null;this.x=this.z=this.height=0;this.speed=0;this.climaxPhase=null;this.phaseAge=0;this.lookWeight=0;this.health=100;this.dead=false;this.hurtCooldown=0;this.protected=false;this.threats=[]}
  receiveHit(){
    if(this.dead||this.protected)return
    this.hits++;this.hitFlash=.22
    if(this.climaxPhase&&this.hurtCooldown<=0){this.health=Math.max(0,this.health-8);this.dead=this.health===0;this.hurtCooldown=.65}
  }
  beginClimax(scott,world){
    if(this.climaxPhase)return
    if(!this.active)this.update(.001,scott,world,true)
    this.climaxPhase='braking';this.phaseAge=0;this.health=100;this.dead=false
    this.escapeStartX=this.x;this.escapeStartDepth=world.distance(this.z);this.joinDepth=Math.max(C.start-80,this.escapeStartDepth+140)
  }
  resumeClimax(scott,world){
    const depth=world.distance(scott.z)+55,x=world.position.x+climaxPathX(depth),z=world.position.z-depth
    if(!Number.isFinite(this.sample(x,z-this.metrics.frontZ))||!Number.isFinite(this.sample(x,z-this.metrics.rearZ)))return false
    this.reset();this.x=x;this.z=z;this.state=createBikeState({x:this.x,z:this.z,yaw:Math.PI},this.metrics,this.sample)
    this.height=this.state.height;this.position.set(this.x,this.height,this.z);this.forward.set(0,0,-1);this.active=true;this.speed=12
    this.climaxPhase='escaping';this.escapeStartX=this.x;this.escapeStartDepth=depth;this.joinDepth=depth+100
    return true
  }
  update(dt,scott,world,patrolActive){
    if(!world?.bound||!patrolActive){this.active=false;return}
    if(!this.active){
      this.center.set(MathUtils.clamp(scott.x,world.position.x-FOREST_STAGE4.desertHalfWidth+RAND_ESCAPE.margin,world.position.x+FOREST_STAGE4.desertHalfWidth-RAND_ESCAPE.margin),0,world.position.z-FOREST_STAGE4.forestLength-300)
      this.distance=0;this.offset.copy(course.getPointAt(0));this.position.copy(this.center).add(this.offset);this.x=this.position.x;this.z=this.position.z
      this.state=createBikeState({x:this.x,z:this.z,yaw:Math.PI},this.metrics,this.sample);this.height=this.state.height;this.position.y=this.height;this.active=true
    }
    const elapsed=Math.max(0,Math.min(dt,.1));if(elapsed===0)return
    const steps=Math.ceil(elapsed/bikeConfig.fixedStep)
    for(let i=0;i<steps;i++)this.advance(elapsed/steps,scott,world)
  }
  advance(dt,scott,world){
    this.time+=dt;this.hitFlash=Math.max(0,this.hitFlash-dt);this.hurtCooldown=Math.max(0,this.hurtCooldown-dt);this.previous.copy(this.position)
    if(this.climaxPhase){this.advanceClimax(dt,scott,world);return}
    const cx=MathUtils.clamp(scott.x,world.position.x-FOREST_STAGE4.desertHalfWidth+RAND_ESCAPE.margin,world.position.x+FOREST_STAGE4.desertHalfWidth-RAND_ESCAPE.margin)
    const depth=MathUtils.clamp(world.distance(scott.z)+150,FOREST_STAGE4.forestLength+300,FOREST_STAGE4.desertEnd-RAND_ESCAPE.margin),cz=world.position.z-depth
    const dx=cx-this.center.x,dz=cz-this.center.z,d=Math.hypot(dx,dz),step=Math.min(d,RAND_ESCAPE.centerFollow*dt)
    if(d>1e-5){this.center.x+=dx/d*step;this.center.z+=dz/d*step}
    this.distance=(this.distance+RAND_ESCAPE.speed*dt)%courseLength;const t=this.distance/courseLength
    course.getPointAt(t,this.offset);course.getTangentAt(t,this.tangent);this.position.copy(this.center).add(this.offset)
    this.x=this.position.x;this.z=this.position.z
    this.vx=(this.x-this.previous.x)/dt;this.vz=(this.z-this.previous.z)/dt
    this.forward.copy(this.tangent).normalize();this.speed=Math.hypot(this.vx,this.vz)
    this.syncState(dt)
  }
  advanceClimax(dt,scott,world){
    this.phaseAge+=dt;this.lookAt.set(scott.x,(scott.height||0)+1.5,scott.z)
    if(this.dead){this.speed=0;this.vx=this.vz=0;this.syncState(dt);return}
    if(this.climaxPhase==='braking'){
      this.speed=Math.max(0,this.speed-40*dt);this.position.addScaledVector(this.forward,this.speed*dt)
      if(this.phaseAge>=C.brakeSeconds){this.climaxPhase='glance';this.phaseAge=0;this.speed=0}
    }else if(this.climaxPhase==='glance'){
      this.speed=0;this.lookWeight=Math.sin(Math.min(1,this.phaseAge/C.glanceSeconds)*Math.PI)
      // Face the continuing road during the brief distrustful look, never
      // turn the chase back towards the previous level.
      this.forward.lerp(this.tangent.set(0,0,-1),1-Math.exp(-dt*7)).normalize()
      if(this.phaseAge>=C.glanceSeconds){this.climaxPhase='escaping';this.phaseAge=0;this.lookWeight=0}
    }else{
      const depth=world.distance(this.position.z),gap=depth-world.distance(scott.z)
      const targetSpeed=gap>230?Math.max(3,19-(gap-230)*.12):gap< -60?34:gap<55?24:19
      this.speed=MathUtils.damp(this.speed,targetSpeed,2.2,dt)
      const join=MathUtils.smoothstep(depth,this.escapeStartDepth,this.joinDepth),road=climaxPathX(depth)
      let dodge=0
      for(const enemy of this.threats){if(enemy.dead||!enemy.meleeEnabled)continue;const ahead=this.position.z-enemy.position.z,side=this.position.x-enemy.position.x;if(ahead>0&&ahead<45&&Math.abs(side)<15)dodge+=(side<0?-1:1)*16*(1-ahead/45)}
      const zig=(Math.sin(this.time*1.35)*9+Math.sin(this.time*2.05+.8)*4)*(depth>C.start?1:.35)
      const targetX=world.position.x+MathUtils.lerp(this.escapeStartX-world.position.x,road,join)+zig+MathUtils.clamp(dodge,-24,24)
      this.position.x+=MathUtils.clamp((targetX-this.position.x)*1.8,-10,10)*dt
      this.position.z-=this.speed*dt
      this.forward.subVectors(this.position,this.previous);this.forward.y=0;if(this.forward.lengthSq()>1e-8)this.forward.normalize()
    }
    this.x=this.position.x;this.z=this.position.z;this.vx=(this.x-this.previous.x)/dt;this.vz=(this.z-this.previous.z)/dt;this.syncState(dt)
  }
  syncState(dt){
    const s=this.state,yaw=Math.atan2(this.forward.x,this.forward.z)
    const previousYaw=s.yaw,dyaw=Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw)),acceleration=dt>0?(s.parked?0:MathUtils.clamp((this.speed-s.speed)/dt,-18,18)):s.acceleration,yawRate=dt>0?(s.parked?0:dyaw/dt):s.yawRate
    const lateral=dt>0?this.vx*Math.cos(yaw)-this.vz*Math.sin(yaw)+yawRate*this.metrics.rearZ:s.rearLateralVelocity
    Object.assign(s,{x:this.x,z:this.z,yaw,speed:this.speed,acceleration,yawRate,rearLateralVelocity:lateral,slip:Math.atan2(lateral,Math.max(1,this.speed)),brakeBlend:MathUtils.clamp(-acceleration/12,0,1),idleBlend:0,parked:false,lean:MathUtils.clamp(-yawRate*.14,-.2,.2),steer:MathUtils.clamp(yawRate*.24,-.3,.3)})
    s.randLook=this.lookWeight;s.randLookAt=this.lookAt
    for(const side of ['front','rear']){
      const contact=s[side+'Contact'];contact.surface=null
      const ground=this.sample(this.x+this.forward.x*this.metrics[side+'Z'],this.z+this.forward.z*this.metrics[side+'Z'],contact)
      s[side+'HasSurface']=Number.isFinite(ground)
      if(Number.isFinite(ground)){s[side+'Ground']=ground;contact.surface||='dirt'}
    }
    // Same road input, spring/damper, load transfer and landing stroke as Scott.
    // The route supplies X/Z only; it must never overwrite the sprung supports.
    updateRoadResponse(s,dt,this.metrics,bikeConfig)
    updateVerticalDynamics(s,dt,this.metrics,bikeConfig)
    this.height=s.height;this.position.y=this.height;this.vy=(this.height-this.previous.y)/dt
    s.distance+=this.speed*dt
    s.frontSpin+=this.speed*dt/this.metrics.frontRadius;s.rearSpin+=this.speed*dt/this.metrics.rearRadius;s.frontAngularSpeed=this.speed/this.metrics.frontRadius;s.rearAngularSpeed=this.speed/this.metrics.rearRadius
  }
}
