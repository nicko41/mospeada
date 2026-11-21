import {Ray,Vector3} from 'three'

// Five Scouts can overlap eight-shot bursts; simulation and visuals share the
// same fixed budget so volleys never overrun the instanced render buffers.
export const SCOUT_PROJECTILE_CAPACITY=64

export function energyInterceptTime(origin,target,velocity,speed,maxTime){
  const x=target.x-origin.x,y=target.y-origin.y,z=target.z-origin.z,a=velocity.lengthSq()-speed*speed,b=2*(x*velocity.x+y*velocity.y+z*velocity.z),c=x*x+y*y+z*z
  if(Math.abs(a)<1e-6)return Math.max(0,Math.min(maxTime,b<0?-c/b:maxTime))
  const discriminant=b*b-4*a*c;if(discriminant<0)return maxTime
  const root=Math.sqrt(discriminant),t1=(-b-root)/(2*a),t2=(-b+root)/(2*a),time=Math.min(t1>0?t1:Infinity,t2>0?t2:Infinity)
  return Math.min(maxTime,time)
}

// The mounted tutorial and desert patrol share the same bounded projectile
// records and swept movement. Rendering remains in the existing combat VFX.
export function createEnergyProjectiles(capacity,style='beam'){
  return Array.from({length:capacity},()=>({active:false,position:new Vector3(),previous:new Vector3(),velocity:new Vector3(),source:new Vector3(),life:0,style,visualScale:1}))
}
export function launchEnergyProjectile(pool,origin,target,speed,life){
  const bolt=pool.find(b=>!b.active)
  if(!bolt)return null
  bolt.active=true;bolt.targetId='scott';bolt.visualScale=1;bolt.position.copy(origin);bolt.previous.copy(origin);bolt.source.copy(origin);bolt.velocity.subVectors(target,origin).normalize().multiplyScalar(speed);bolt.life=life
  return bolt
}
const sweepRay=new Ray(),delta=new Vector3(),end=new Vector3()
function contactAt(b,target,length,den,radius){
  const t=Math.max(0,Math.min(1,((target.x-b.previous.x)*delta.x+(target.height+1-b.previous.y)*delta.y+(target.z-b.previous.z)*delta.z)/Math.max(den,.0001)))
  return Math.hypot(b.previous.x+delta.x*t-target.x,b.previous.y+delta.y*t-target.height-1,b.previous.z+delta.z*t-target.z)<radius?t*length:Infinity
}
export function advanceEnergyProjectiles(pool,player,dt,{worldQuery=null,onPlayerHit=()=>{},onWorldHit=()=>{},secondaryTarget=null,onSecondaryHit=()=>{}}={}){
  if(dt<=0)return
  for(const b of pool){
    if(!b.active)continue
    b.previous.copy(b.position);end.copy(b.position).addScaledVector(b.velocity,dt)
    delta.subVectors(end,b.previous);const length=delta.length(),den=length*length
    const playerAt=contactAt(b,player,length,den,.8),secondaryAt=secondaryTarget?.active?contactAt(b,secondaryTarget,length,den,secondaryTarget.projectileRadius||.9):Infinity
    const hitAt=Math.min(playerAt,secondaryAt),hitActor=Number.isFinite(hitAt)
    let worldHit=null
    if(worldQuery&&length>1e-6){sweepRay.set(b.previous,delta.divideScalar(length));worldHit=worldQuery.castWorld(sweepRay,length)}
    if(worldHit?.solid&&(!hitActor||worldHit.distance<hitAt)){b.position.copy(worldHit.point);b.active=false;onWorldHit(b)}
    else if(hitActor){b.position.lerpVectors(b.previous,end,hitAt/Math.max(length,.0001));b.active=false;if(secondaryAt<playerAt)onSecondaryHit(b);else onPlayerHit(b)}
    else b.position.copy(end)
    b.life-=dt;if(b.life<=0)b.active=false
  }
}
