import {advanceGroundTurn} from './armorGroundTurns.js'

// Armour-only arcade propulsion; the Motorcycle solver remains independent.
export const armorConfig={hoverHeight:.8,hoverSpeed:9,acceleration:30,braking:17,inertia:3.2,boostSpeed:32,boostAcceleration:64,boostBraking:30,boostInertia:1.5,boostCoastTime:.18,jumpImpulse:8,jumpAcceleration:22,jumpThrustDuration:.65,jumpMaxHeight:12,maxRiseSpeed:13,airGravity:5,descentAcceleration:32,diveImpulse:6,maxDiveSpeed:18,maxFallSpeed:9,hoverStiffness:24,hoverDamping:9,groundSpeed:2.5,runSpeed:5.5,groundTurnThreshold:.70,groundTurnRate:1,groundYawRate:3,cameraDistance:4.6,cameraResponse:7,bodyIntensity:1}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt))
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n))
export function createArmorState(source,soleOffset=0){
  const speed=clamp(source.speed||0,-12,12),yaw=source.travelYaw??source.yaw
  return{x:source.x,y:source.height,z:source.z,yaw:source.yaw,pitch:source.pitch||0,bank:(source.lean||0)+(source.bank||0),vx:Math.sin(yaw)*speed,vz:Math.cos(yaw)*speed,vy:clamp(source.verticalVelocity||0,-1,1),ax:0,az:0,ay:0,speed:Math.abs(speed),mode:'ARMOR_HOVER',soleOffset,ground:0,groundSmooth:NaN,surface:'dirt',height:0,grounded:false,contactSpeed:0,boostBlend:0,boostRelease:10,boosting:false,thrustForward:0,thrustSide:0,thrustX:0,thrustZ:0,lift:.25,time:0,stride:0,localForward:0,localSide:0,forwardAcceleration:0,sideAcceleration:0,settle:0,jumpHeld:false,jump:null,jumpCount:0,jumpPowered:false,descendHeld:false,diving:false,diveBlend:0,groundTurn:null,pelvisOffsetX:0,pelvisOffsetZ:0}
}
function advanceVertical(a,input,dt,c){
  const floor=a.ground-a.soleOffset+.025
  let target=a.groundSmooth-a.soleOffset+(a.mode==='ARMOR_HOVER'?c.hoverHeight:.025)
  const air=!!a.jump||a.y>target+.25
  if(input.descend&&!a.descendHeld&&air)a.vy=Math.min(a.vy,-c.diveImpulse)
  const pressed=!!input.rise&&!a.jumpHeld
  if(pressed&&!a.jump&&a.y<target+.3&&Math.abs(a.vy)<1.5){
    a.jump={originY:a.y,ceilingY:a.y+c.jumpMaxHeight,elapsed:0,thrustEnded:false,phase:'powered'};a.jumpCount++;a.vy=Math.max(a.vy,c.jumpImpulse);a.groundTurn=null
  }
  a.jumpPowered=false
  if(a.jump){
    const j=a.jump,remaining=Math.max(0,j.ceilingY-a.y)
    j.elapsed+=dt
    if(!input.rise||input.descend||j.elapsed>=c.jumpThrustDuration||remaining<.002)j.thrustEnded=true
    const recovering=j.phase==='recover'||j.thrustEnded&&a.y<target+(a.mode==='ARMOR_GROUND'?.08:1.6)&&a.vy<=0
    a.jumpPowered=!j.thrustEnded
    if(recovering)a.vy+=clamp((target-a.y)*c.hoverStiffness-a.vy*c.hoverDamping,-24,32)*dt
    else if(a.jumpPowered)a.vy=Math.min(c.maxRiseSpeed,a.vy+c.jumpAcceleration*dt)
    else a.vy=Math.max(-(input.descend?c.maxDiveSpeed:c.maxFallSpeed),a.vy-c.airGravity*dt)
    if(a.vy>0)a.vy=Math.min(a.vy,Math.sqrt(2*c.airGravity*remaining))
    if(remaining<.002){j.thrustEnded=true;a.jumpPowered=false;a.vy=Math.min(0,a.vy)}
    j.phase=recovering?'recover':a.jumpPowered?'powered':a.vy>0?'coast':'fall'
  }else a.vy+=clamp((target-a.y)*c.hoverStiffness-a.vy*c.hoverDamping,-24,32)*dt
  a.vy=Math.max(-c.maxDiveSpeed,a.vy)
  if(input.descend)a.vy=Math.max(-c.maxDiveSpeed,a.vy-c.descentAcceleration*dt)
  else if(a.vy< -c.maxFallSpeed)a.vy=Math.min(-c.maxFallSpeed,a.vy+24*dt)
  a.y+=a.vy*dt
  if(a.jump&&a.y>a.jump.ceilingY&&a.y>floor){a.y=Math.max(floor,a.jump.ceilingY);a.vy=Math.min(0,a.vy);a.jump.thrustEnded=true;a.jumpPowered=false}
  if(a.y<floor){a.settle=Math.max(a.settle,Math.min(1,Math.abs(a.vy)/8));a.y=floor;a.vy=Math.max(0,a.vy)}
  if(a.jump?.thrustEnded&&Math.abs(a.y-target)<.08&&Math.abs(a.vy)<.35){a.jump=null;a.jumpPowered=false}
  a.jumpHeld=!!input.rise;a.descendHeld=!!input.descend
}
export function advanceArmor(a,input,delta,sample,canMove=()=>true,c=armorConfig,turnProfiles=null){
  a.diveBlend??=0;a.descendHeld??=false
  if(a.jump)a.jump.ceilingY??=a.jump.originY+c.jumpMaxHeight
  const total=Math.max(0,Math.min(.1,delta)),steps=Math.max(1,Math.ceil(total/(1/120))),dt=total/steps
  if(!dt)return a
  for(let i=0;i<steps;i++){
    const controlYaw=Number.isFinite(input.yaw)?input.yaw:a.yaw,forward=input.forward||0,side=input.side||0,length=Math.hypot(forward,side),moving=length>.001
    const hover=a.mode==='ARMOR_HOVER'||!!a.jump,boost=hover&&!!input.boost&&moving
    if(a.mode==='ARMOR_HOVER')a.groundTurn=null
    const oldX=a.vx,oldZ=a.vz,oldY=a.vy,wasGrounded=a.grounded
    // Screen-right is forward x world-up. Diagonal thrust has unit length.
    const nx=moving?(Math.sin(controlYaw)*forward-Math.cos(controlYaw)*side)/length:0
    const nz=moving?(Math.cos(controlYaw)*forward+Math.sin(controlYaw)*side)/length:0
    const speed=hover?(boost?c.boostSpeed:c.hoverSpeed):input.boost?c.runSpeed:c.groundSpeed
    const heading=moving?Math.atan2(nx,nz):a.yaw
    const turning=!hover&&!input.rise&&advanceGroundTurn(a,heading,moving,dt,canMove,turnProfiles,c)
    if(!turning){
      if(hover)a.yaw+=wrap(controlYaw-a.yaw)*(1-Math.exp(-dt*12))
      else if(moving&&a.speed>.05)a.yaw+=clamp(wrap(heading-a.yaw),-c.groundYawRate*dt,c.groundYawRate*dt)
      const desiredX=nx*speed,desiredZ=nz*speed,recentBoost=a.boostRelease<2
      const coasting=!boost&&recentBoost&&a.boostRelease<c.boostCoastTime
      const response=coasting?c.boostInertia:moving?9:c.inertia
      let dx=(desiredX-a.vx)*(1-Math.exp(-dt*response)),dz=(desiredZ-a.vz)*(1-Math.exp(-dt*response))
      const slowing=dx*a.vx+dz*a.vz<0,brake=recentBoost?c.boostBraking:c.braking
      const limit=(boost?c.boostAcceleration:coasting?brake*.25:slowing?brake:c.acceleration)*dt,distance=Math.hypot(dx,dz)
      if(distance>limit){dx*=limit/distance;dz*=limit/distance}
      a.vx+=dx;a.vz+=dz
      if(Math.hypot(a.vx,a.vz)<.025&&!moving)a.vx=a.vz=0
      if(canMove(a.x+a.vx*dt,a.z,a.y))a.x+=a.vx*dt;else a.vx=0
      if(canMove(a.x,a.z+a.vz*dt,a.y))a.z+=a.vz*dt;else a.vz=0
    }
    if(boost){a.boostRelease=0;a.thrustX=nx;a.thrustZ=nz;a.thrustForward=Math.sin(a.yaw)*nx+Math.cos(a.yaw)*nz;a.thrustSide=-(Math.cos(a.yaw)*nx-Math.sin(a.yaw)*nz)}
    else a.boostRelease+=dt
    a.boosting=boost
    const contact={},ground=sample(a.x,a.z,contact)
    if(Number.isFinite(ground)){a.ground=ground;a.surface=contact.surface||'dirt'}
    if(!Number.isFinite(a.groundSmooth))a.groundSmooth=a.ground
    a.groundSmooth=damp(a.groundSmooth,a.ground,8,dt)
    advanceVertical(a,input,dt,c)
    a.ax=(a.vx-oldX)/dt;a.az=(a.vz-oldZ)/dt;a.ay=(a.vy-oldY)/dt
    a.speed=Math.hypot(a.vx,a.vz);a.height=a.y+a.soleOffset-a.ground;a.grounded=a.mode==='ARMOR_GROUND'&&a.height<.12
    if(a.mode==='ARMOR_GROUND'&&!a.grounded)a.contactSpeed=Math.max(a.contactSpeed,-a.vy)
    if(a.grounded&&!wasGrounded){a.settle=Math.max(a.settle,clamp(a.contactSpeed/8,.12,1));a.contactSpeed=0}
    a.diving=!!input.descend&&a.height>.2&&a.vy< -1
    a.diveBlend=damp(a.diveBlend,a.diving?clamp(-a.vy/12,0,1):0,10,dt)
    a.boostBlend=damp(a.boostBlend,boost?1:0,boost?8:4,dt)
    if(a.boostBlend<.001)a.thrustForward=a.thrustSide=a.thrustX=a.thrustZ=0
    a.localForward=Math.sin(a.yaw)*a.vx+Math.cos(a.yaw)*a.vz;a.localSide=Math.cos(a.yaw)*a.vx-Math.sin(a.yaw)*a.vz
    a.forwardAcceleration=Math.sin(a.yaw)*a.ax+Math.cos(a.yaw)*a.az;a.sideAcceleration=Math.cos(a.yaw)*a.ax-Math.sin(a.yaw)*a.az
    a.lift=a.mode==='ARMOR_HOVER'||a.jump?clamp(.25+(a.jumpPowered?.65:0)+Math.max(0,a.ay)/c.jumpAcceleration+Math.max(0,a.vy)*.025,.1,1.8):a.grounded?a.settle*.35:.15
    a.pitch=damp(a.pitch,0,10,dt);a.bank=damp(a.bank,0,10,dt)
    a.settle=damp(a.settle,0,6,dt);a.stride+=a.speed*dt/(a.mode==='ARMOR_GROUND'&&input.boost?1.5:.9);a.time+=dt
  }
  return a
}
