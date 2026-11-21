const clamp=n=>Math.max(0,Math.min(1,n))
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)}
export const groundLandingTiming={prepare:.16,divePrepare:.07,impact:.14,recover:.42,gravity:26,maxFallSpeed:15}

export function beginGroundLanding(a,reason='toggle'){
  if(a.groundLanding)return false
  a.groundLanding={phase:'prepare',time:0,reason,prepare:reason==='dive'?groundLandingTiming.divePrepare:groundLandingTiming.prepare,soleOffset:a.soleOffset,finished:false,impactSpeed:0}
  a.jump=null;a.jumpPowered=false;a.groundTurn=null;a.boosting=false;a.boostBlend=0;a.boostRelease=10
  a.thrustX=a.thrustZ=a.thrustSide=a.thrustForward=0
  a.vy=reason==='dive'?Math.min(a.vy,-4):0
  return true
}

export function touchGroundLanding(a){
  const l=a.groundLanding
  if(!l||!['prepare','descend'].includes(l.phase))return
  l.impactSpeed=Math.abs(a.vy);l.phase='impact';l.time=0
  a.mode='ARMOR_GROUND';a.grounded=true;a.vy=0;a.vx=a.vz=0;a.speed=0
  a.settle=Math.max(.5,Math.min(1,l.impactSpeed/7))
}

// One director owns translation and the body phase. Player propulsion cannot
// fight the descent; feet supply the evaluated support offset after posing.
export function advanceGroundLanding(a,input,delta,sample,canMove=()=>true){
  const l=a.groundLanding,total=Math.max(0,Math.min(.1,delta)),steps=Math.max(1,Math.ceil(total*120)),dt=total/steps
  if(!l||!dt)return
  for(let i=0;i<steps;i++){
    const oldX=a.vx,oldZ=a.vz,oldY=a.vy
    l.time+=dt;a.time+=dt
    const contact={},ground=sample(a.x,a.z,contact)
    if(Number.isFinite(ground)){a.ground=a.groundSmooth=ground;a.surface=contact.surface||'dirt'}
    if(l.phase==='prepare'&&l.time>=l.prepare){l.phase='descend';l.time=0;a.vy=Math.min(a.vy,-1.5)}
    if(l.phase==='prepare'||l.phase==='descend'){
      // Ctrl redirects the vertical motion, not the existing horizontal
      // momentum. G keeps its deliberate settling/braking approach.
      const drag=l.reason==='dive'?1:Math.exp(-12*dt)
      a.vx*=drag;a.vz*=drag
      if(canMove(a.x+a.vx*dt,a.z,a.y))a.x+=a.vx*dt;else a.vx=0
      if(canMove(a.x,a.z+a.vz*dt,a.y))a.z+=a.vz*dt;else a.vz=0
      if(l.phase==='descend'||l.reason==='dive'){
        a.vy=Math.max(-groundLandingTiming.maxFallSpeed,a.vy-groundLandingTiming.gravity*dt);a.y+=a.vy*dt
      }
      const support=a.ground-l.soleOffset+.025
      if(a.y<=support&&a.vy<0){a.y=support;touchGroundLanding(a)}
    }else{
      a.vy=a.vx=a.vz=0
      if(l.phase==='impact'&&l.time>=groundLandingTiming.impact){l.phase='recover';l.time=0}
      if(l.phase==='recover'&&l.time>=groundLandingTiming.recover)l.finished=true
    }
    a.speed=Math.hypot(a.vx,a.vz);a.height=a.y+a.soleOffset-a.ground
    a.ax=(a.vx-oldX)/dt;a.az=(a.vz-oldZ)/dt;a.ay=(a.vy-oldY)/dt
    a.localForward=Math.sin(a.yaw)*a.vx+Math.cos(a.yaw)*a.vz;a.localSide=Math.cos(a.yaw)*a.vx-Math.sin(a.yaw)*a.vz
    a.grounded=l.phase==='impact'||l.phase==='recover';a.lift=0;a.diving=false;a.diveBlend=0
    a.jumpHeld=!!input.rise;a.descendHeld=!!input.descend
  }
}

export function sampleGroundLanding(l){
  const dive=l.reason==='dive'
  if(l.phase==='prepare'){
    const t=smooth(l.time/l.prepare)
    return{enter:t,bend:.30*t,lean:.10*t,back:dive?0:.85*t,raised:dive?t:0,forward:0}
  }
  if(l.phase==='descend')return{enter:1,bend:.34,lean:.14,back:dive?0:.85,raised:dive?1:0,forward:0}
  if(l.phase==='impact'){
    const t=smooth(l.time/groundLandingTiming.impact)
    return{enter:1,bend:.34+.28*t,lean:.14+.38*t,back:dive?0:.85*(1-t),raised:dive?1-t:0,forward:.38*t}
  }
  const t=smooth(l.time/groundLandingTiming.recover)
  return{enter:1,bend:.62*(1-t)+.10*t,lean:.52*(1-t),back:0,raised:0,forward:.38*(1-t)}
}
