import {CatmullRomCurve3,MathUtils,Vector3} from 'three'
import {createBikeState} from '../../vehicle/bikePhysics.js'
import {FOREST_STAGE4} from './forestStage4Config.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {updateRoadResponse} from '../../vehicle/roadResponse.js'
import {updateVerticalDynamics} from '../../vehicle/verticalDynamics.js'

export const RAND_ESCAPE=Object.freeze({speed:19,centerFollow:3,margin:240})
// One broad irregular circuit in the real desert. It keeps moving without
// teleports or a finite route endpoint while Scott fights the patrol.
const course=new CatmullRomCurve3([[180,-20],[100,-155],[-85,-180],[-200,-60],[-140,100],[45,130],[170,80]].map(([x,z])=>new Vector3(x,0,z)),true,'centripetal')
course.arcLengthDivisions=2048;course.updateArcLengths()
const courseLength=course.getLength()
export class RandDesertEscape{
  constructor(sample,metrics){
    this.sample=sample;this.metrics=metrics;this.position=new Vector3();this.forward=new Vector3(0,0,-1);this.center=new Vector3();this.offset=new Vector3();this.tangent=new Vector3();this.previous=new Vector3();this.reset()
  }
  reset(){this.active=false;this.distance=0;this.time=0;this.hits=0;this.hitFlash=0;this.vx=this.vy=this.vz=0;this.state=null;this.x=this.z=this.height=0;this.speed=0}
  receiveHit(){this.hits++;this.hitFlash=.22}
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
    this.time+=dt;this.hitFlash=Math.max(0,this.hitFlash-dt);this.previous.copy(this.position)
    const cx=MathUtils.clamp(scott.x,world.position.x-FOREST_STAGE4.desertHalfWidth+RAND_ESCAPE.margin,world.position.x+FOREST_STAGE4.desertHalfWidth-RAND_ESCAPE.margin)
    const depth=MathUtils.clamp(world.distance(scott.z)+150,FOREST_STAGE4.forestLength+300,FOREST_STAGE4.desertEnd-RAND_ESCAPE.margin),cz=world.position.z-depth
    const dx=cx-this.center.x,dz=cz-this.center.z,d=Math.hypot(dx,dz),step=Math.min(d,RAND_ESCAPE.centerFollow*dt)
    if(d>1e-5){this.center.x+=dx/d*step;this.center.z+=dz/d*step}
    this.distance=(this.distance+RAND_ESCAPE.speed*dt)%courseLength;const t=this.distance/courseLength
    course.getPointAt(t,this.offset);course.getTangentAt(t,this.tangent);this.position.copy(this.center).add(this.offset)
    this.x=this.position.x;this.z=this.position.z
    this.vx=(this.x-this.previous.x)/dt;this.vz=(this.z-this.previous.z)/dt
    this.forward.copy(this.tangent).normalize();this.speed=Math.hypot(this.vx,this.vz)
    const s=this.state,yaw=Math.atan2(this.forward.x,this.forward.z)
    const previousYaw=s.yaw,dyaw=Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw)),acceleration=dt>0?(s.parked?0:MathUtils.clamp((this.speed-s.speed)/dt,-18,18)):s.acceleration,yawRate=dt>0?(s.parked?0:dyaw/dt):s.yawRate
    const lateral=dt>0?this.vx*Math.cos(yaw)-this.vz*Math.sin(yaw)+yawRate*this.metrics.rearZ:s.rearLateralVelocity
    Object.assign(s,{x:this.x,z:this.z,yaw,speed:this.speed,acceleration,yawRate,rearLateralVelocity:lateral,slip:Math.atan2(lateral,Math.max(1,this.speed)),brakeBlend:MathUtils.clamp(-acceleration/12,0,1),idleBlend:0,parked:false,lean:MathUtils.clamp(-yawRate*.14,-.2,.2),steer:MathUtils.clamp(yawRate*.24,-.3,.3)})
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
