import {Quaternion,Vector3} from 'three'

const clamp=t=>Math.max(0,Math.min(1,t))
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)}
export const wheelStartProgress=.22
export const wheelIntermediateProgress=.42
export const wheelBehindProgress=.56
export const wheelEndProgress=.70
export const wheelTransformBlend=progress=>smooth((progress-wheelStartProgress)/(wheelEndProgress-wheelStartProgress))
export function sampleWheelMotion(wheel,progress){
  const t=clamp((progress-wheelStartProgress)/(wheelEndProgress-wheelStartProgress)),front=wheel==='front'
  const second=progress>=wheelIntermediateProgress,lift=front&&progress>=wheelBehindProgress
  const a=lift?wheelBehindProgress:second?wheelIntermediateProgress:wheelStartProgress,b=lift?wheelEndProgress:second?(front?wheelBehindProgress:wheelEndProgress):wheelIntermediateProgress
  const blend=smooth((progress-a)/(b-a))
  return{t,segment:lift?2:second?1:0,blend,fit:(front?lift:second)?blend:0,phase:lift?'elevación':second&&front?'giro horizontal':second?'encaje trasero':'salida',mechanism:front?'barrido lateral izquierdo':'articulación trasera'}
}

// Key poses live relative to the REAL socket at each key time. Its existing
// rear choreography moves that socket too; do not add that motion twice.
// Positions are reconstructed by rotating a lever, never lerping a chord.
export class SocketWheelMotion{
  constructor(){
    this.a=new Vector3();this.b=new Vector3();this.end=new Vector3();this.offset=new Vector3()
    this.p=new Vector3();this.q=new Quaternion();this.s=new Vector3();this.qb=new Quaternion();this.sb=new Vector3()
    this.swivel=new Quaternion();this.partial=new Quaternion()
  }
  apply(wheel,keys,frame,center,motion,out){
    const a=keys[motion.segment],b=keys[motion.segment+1],t=motion.blend
    this.a.copy(center).applyMatrix4(a);this.b.copy(center).applyMatrix4(b)
    const r0=this.a.length(),r1=this.b.length()
    if(Math.min(r0,r1)<1e-6)throw Error('La rueda coincide con la base del hidráulico')
    if(wheel==='front'){
      // +Y swivel: forward (+Z) -> bike left (+X) -> behind (-Z).
      // Exported endpoints determine elevation and telescopic stroke.
      const yaw0=Math.atan2(this.a.x,this.a.z)
      let yaw1=Math.atan2(this.b.x,this.b.z)
      while(yaw1<yaw0-1e-7)yaw1+=2*Math.PI
      let yaw=yaw0+(yaw1-yaw0)*t
      if(motion.segment===0){
        const e0=Math.atan2(this.a.y,Math.hypot(this.a.x,this.a.z)),e1=Math.atan2(this.b.y,Math.hypot(this.b.x,this.b.z)),e=e0+(e1-e0)*t,r=r0+(r1-r0)*t
        this.end.set(Math.sin(yaw)*Math.cos(e),Math.sin(e),Math.cos(yaw)*Math.cos(e)).multiplyScalar(r)
      }else if(motion.segment===1){
        // Finish the horizontal orbit first. Compensate the moving socket's
        // height so the wheel cannot climb diagonally during this sweep.
        const radius=Math.hypot(this.a.x,this.a.z)
        this.end.set(Math.sin(yaw)*radius,motion.horizontalY,Math.cos(yaw)*radius)
      }else{
        // Only the wheel already behind the bike may rise and telescope in.
        yaw=yaw0+Math.atan2(Math.sin(yaw1-yaw0),Math.cos(yaw1-yaw0))*t
        const radius=Math.hypot(this.a.x,this.a.z)+(Math.hypot(this.b.x,this.b.z)-Math.hypot(this.a.x,this.a.z))*t
        this.end.set(Math.sin(yaw)*radius,motion.horizontalY+(this.b.y-motion.horizontalY)*t,Math.cos(yaw)*radius)
      }
      this.angle=yaw;this.sweep=yaw1-yaw0
    }else{
      // Rear derives its OWN articulation plane from its exported poses.
      // No front yaw sweep or imposed half-turn is reused.
      this.a.normalize();this.b.normalize()
      this.swivel.setFromUnitVectors(this.a,this.b)
      this.partial.identity().slerp(this.swivel,t)
      this.end.copy(this.a).applyQuaternion(this.partial).multiplyScalar(r0+(r1-r0)*t)
      this.angle=2*Math.acos(Math.max(-1,Math.min(1,this.swivel.w)))*t
    }
    a.decompose(this.p,this.q,this.s);b.decompose(this.p,this.qb,this.sb)
    out.compose(this.p.set(0,0,0),this.q.slerp(this.qb,t),this.s.lerp(this.sb,t))
    this.offset.copy(center).applyMatrix4(out)
    out.setPosition(this.p.copy(this.end).sub(this.offset)).premultiply(frame)
    // Exact exported matrices at every keyframe, including quaternion.
    if(t===0)out.copy(frame).multiply(a)
    if(t===1)out.copy(frame).multiply(b)
    return out
  }
}
