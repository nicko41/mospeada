import {Quaternion,Vector3} from 'three'

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
export const SCOUT_HIT_REACTION=Object.freeze({duration:.42,attack:.045})

// A reversible pose layer over the existing five rigid joints. It never
// changes the enemy's position, steering, attacks, damage or clip playback.
export class ScoutHitReaction{
 constructor(motion){
  this.motion=motion;this.applied=false;this.lastJoint=0
  this.saved=motion.joints.map(bone=>({bone,p:new Vector3(),q:new Quaternion()}))
  this.impulses=motion.joints.map(()=>({age:Infinity,power:0,side:0,normal:new Vector3(0,0,1)}))
 }
 restore(){if(!this.applied)return;for(const r of this.saved){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q)}this.applied=false}
 reset(){this.restore();for(const r of this.impulses)r.age=Infinity}
 hit(joint,normal,point){
  this.restore();joint=clamp(joint|0,0,4);const r=this.impulses[joint]
  r.power=Math.min(1.25,r.age<SCOUT_HIT_REACTION.duration?r.power*.3+1:1);r.age=0;r.normal.copy(normal).normalize()
  r.side=joint===1||joint===3?1:joint===2||joint===4?-1:Math.sign(point?.x||0)
  this.lastJoint=joint;this.apply(0);this.motion.sync()
 }
 apply(dt){
  this.restore();let active=false
  for(const r of this.impulses){r.age+=Math.max(0,Math.min(.1,dt));if(r.age<SCOUT_HIT_REACTION.duration)active=true}
  if(!active)return false
  for(const r of this.saved){r.p.copy(r.bone.position);r.q.copy(r.bone.quaternion)}
  let yaw=0,roll=0,pitch=0,x=0,z=0
  for(let i=0;i<this.impulses.length;i++){
   const r=this.impulses[i];if(r.age>=SCOUT_HIT_REACTION.duration)continue
   const t=r.age/SCOUT_HIT_REACTION.duration,weight=Math.min(1,.18+r.age/SCOUT_HIT_REACTION.attack)*(1-t)**2*r.power
   const front=r.normal.z>=0?1:-1
   yaw+=r.side*.09*weight;roll-=r.side*.025*weight;pitch+=.045*front*weight;x-=r.normal.x*.025*weight;z-=r.normal.z*.035*weight
   if(i>0){const bone=this.motion.joints[i];bone.rotation.x+=(i>=3?.34:.20)*front*weight;bone.rotation.z+=r.side*(i>=3?.035:.09)*weight}
  }
  const body=this.motion.body;body.rotation.y+=clamp(yaw,-.16,.16);body.rotation.z+=clamp(roll,-.08,.08);body.rotation.x+=clamp(pitch,-.1,.1);body.position.x+=clamp(x,-.04,.04);body.position.z+=clamp(z,-.06,.06)
  this.applied=true;return true
 }
}
