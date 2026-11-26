import {cylinderCollider,queryColliders,registerDynamicCollider} from '../player/collisionWorld.js'

// Movement-only primitives: weapon and camera queries keep their existing
// target/surface rules. Each primitive reads the live Scout transform.
export function registerInvidBody(target){
  const body=cylinderCollider(0,0,Math.min(target.radius,target.height*.29),0,0)
  body.invid=target
  body.sync=()=>{
    if(target.dead||target.health<=0||!target.meleeEnabled||!target.view.root.visible)return false
    const p=target.position,r=body.radius
    body.x=p.x;body.z=p.z;body.minX=p.x-r;body.maxX=p.x+r;body.minZ=p.z-r;body.maxZ=p.z+r
    body.minY=p.y;body.maxY=p.y+target.height
    return true
  }
  return registerDynamicCollider(body)
}

const nearby=[]
// Sweep the actor footprint so a boosted Cyclone cannot tunnel through a
// Scout. A contact already overlapping may move outward to avoid trapping it.
export function invidMovementBlocker(from,x,z,y,radius,height){
  queryColliders(Math.min(from.x,x)-radius,Math.min(from.z,z)-radius,Math.max(from.x,x)+radius,Math.max(from.z,z)+radius,nearby,true)
  for(const c of nearby){
    if(!c.invid||y+height<=c.minY||y>=c.maxY)continue
    const dx=x-from.x,dz=z-from.z,length=dx*dx+dz*dz
    const t=length?Math.max(0,Math.min(1,((c.x-from.x)*dx+(c.z-from.z)*dz)/length)):0
    const a=(from.x-c.x)**2+(from.z-c.z)**2,b=(x-c.x)**2+(z-c.z)**2,reach=(radius+c.radius)**2
    if(a<reach&&b>a+1e-8)continue
    if((from.x+dx*t-c.x)**2+(from.z+dz*t-c.z)**2<reach)return c.invid
  }
  return null
}

// The AI can approach a stationary player too. Resolve that overlap once per
// frame, independently of input, instead of waiting for Scott's next step.
export function separateInvidBodies(actor,y,radius,height,onContact){
  for(let pass=0;pass<3;pass++){
    queryColliders(actor.x-radius,actor.z-radius,actor.x+radius,actor.z+radius,nearby,true)
    let moved=false
    for(const c of nearby){
      if(!c.invid||y+height<=c.minY||y>=c.maxY)continue
      let dx=actor.x-c.x,dz=actor.z-c.z,d=Math.hypot(dx,dz),overlap=radius+c.radius-d
      if(overlap<=0)continue
      if(d<1e-6){dx=-Math.sin(actor.yaw||0);dz=-Math.cos(actor.yaw||0);d=1}
      actor.x+=dx/d*(overlap+.002);actor.z+=dz/d*(overlap+.002);moved=true;onContact(c.invid)
    }
    if(!moved)break
  }
}

export function signalInvidContact(runtime,target){
  if(runtime.invidContactCooldown>0||runtime.scottInstance?.hitMotion?.knockedDown||runtime.scottInstance?.hitMotion?.cooldown>0)return
  const phase=runtime.transformEntry?.phase
  if(phase&&!['idle','complete'].includes(phase))return
  const event=runtime.invidContact||{version:0,source:{x:0,y:0,z:0}}
  Object.assign(event.source,target.position);event.version++;runtime.invidContact=event;runtime.invidContactCooldown=4
}
