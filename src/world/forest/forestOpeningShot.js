import {Vector3,MathUtils} from 'three'

export const FOREST_OPENING={musicLead:2,fadeIn:2,orbit:10,settle:3,volume:.48}
const smooth=(a,b,n)=>MathUtils.smoothstep(n,a,b)

// One continuous half-orbit and dolly. Ease only at the two overall endpoints;
// separate easing at the old orbit/dolly join made the camera stop behind Scott.
export class ForestOpeningShot{
  constructor(state,alphaCenter,endPosition,endTarget,endFov){
    this.actor=new Vector3(state.x,state.height,state.z);this.yaw=state.yaw
    this.focus=this.actor.clone().add(new Vector3(0,1.05,0))
    this.alpha=alphaCenter.clone();this.alpha.y=Math.max(this.focus.y,this.alpha.y)
    this.endPosition=endPosition.clone();this.endTarget=endTarget.clone();this.endFov=endFov
    this.position=new Vector3();this.target=new Vector3()
    const dx=endPosition.x-state.x,dz=endPosition.z-state.z
    this.endRadius=Math.hypot(dx,dz);this.endAngle=Math.atan2(dx,dz)
    while(this.endAngle>this.yaw)this.endAngle-=Math.PI*2
  }
  sample(seconds){
    const c=FOREST_OPENING,duration=c.orbit+c.settle,u=smooth(0,duration,seconds),angle=MathUtils.lerp(this.yaw,this.endAngle,u)
    const radius=MathUtils.lerp(22,this.endRadius,smooth(.2,1,u))+4*Math.sin(Math.PI*u)
    const height=MathUtils.lerp(4.2,this.endPosition.y-this.actor.y,u)+3.4*Math.sin(Math.PI*u)
    this.position.set(this.actor.x+Math.sin(angle)*radius,this.actor.y+height,this.actor.z+Math.cos(angle)*radius)
    this.target.copy(this.focus).lerp(this.alpha,.45*(1-smooth(.3,.85,u))).lerp(this.endTarget,smooth(.7,1,u))
    return {position:this.position,target:this.target,fov:MathUtils.lerp(58,this.endFov,smooth(.5,1,u)),opacity:1-smooth(0,c.fadeIn,seconds),complete:seconds>=duration}
  }
}
