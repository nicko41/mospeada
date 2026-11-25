import {Box3,Matrix4,Ray,Vector3} from 'three'

export const CUFF_MISSILES=Object.freeze({capacity:4,interval:.45,life:8,speed:42,wave:1.15,smokeSpacing:.65})
const up=new Vector3(0,1,0)
export class CuffMissiles{
 constructor(){
  this.records=Array.from({length:4},(_,slot)=>({slot,active:false,newborn:false,holdFrame:false,position:new Vector3(),previous:new Vector3(),base:new Vector3(),heading:new Vector3(),goal:new Vector3(),inheritedVelocity:new Vector3(),launchOrigin:new Vector3(),launchDirection:new Vector3(),launchMatrix:new Matrix4(),age:0,smoke:0,target:null}))
  this.remaining=4;this.cooldown=0;this.state=null;this.battle=null;this.guards=null;this.launchers=[];this.point=new Vector3();this.direction=new Vector3();this.side=new Vector3();this.up=new Vector3();this.hit=new Vector3();this.ray=new Ray();this.box=new Box3();this.stats={launched:0,hits:0,blocked:0}
 }
 bind(guards){
  if(this.guards===guards)return
  this.guards=guards;this.launchers=[]
  if(!guards)return
  // These four named caps are the actual front missile noses, not generic
  // wrist offsets. Their source coordinates follow the cuff's live matrix.
  for(const level of ['Upper','Lower'])for(const side of ['Right','Left']){
   const group=guards.groups.find(g=>g.bone.name===`mixamorig${side}ForeArm`),part=group?.parts.find(p=>new RegExp(`Arm_Guard_Cap_${level}(?:_|\\||$)`).test(p.mesh.name+'|'+p.record.key))
   if(!part)continue
   const mesh=part.mesh;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,local=box.getCenter(new Vector3());local.z=box.max.z+.005
   this.launchers.push({mesh,local,group,side,normal:new Vector3(side==='Left'?.01455:-.01455,0,1).normalize(),visible:part.visible})
  }
 }
 reset(){for(const r of this.records){r.active=false;r.target=null}for(const l of this.launchers)l.mesh.visible=l.visible;this.remaining=4;this.cooldown=0;Object.assign(this.stats,{launched:0,hits:0,blocked:0})}
 sync(state,battle,guards){const changed=this.state!==state||this.battle!==battle;if(changed){this.reset();this.state=state;this.battle=battle}this.bind(guards);return changed}
 launch(target,available,vfx,ownerVelocity=null){
  if(!available||this.remaining<=0||this.cooldown>0||!target?.receiveMissileHit||target.dead||target.meleeEnabled===false||this.launchers.length!==4)return false
  const slot=4-this.remaining,r=this.records[slot],l=this.launchers[slot];l.mesh.updateWorldMatrix(true,false)
  r.position.copy(l.local).applyMatrix4(l.mesh.matrixWorld);r.base.copy(r.position);r.previous.copy(r.position);r.heading.copy(l.normal).transformDirection(l.mesh.matrixWorld);r.goal.copy(target.position);r.goal.y+=target.height*.55;r.target=target;r.age=r.smoke=0;r.active=true
  r.launchOrigin.copy(r.position);r.launchDirection.copy(r.heading);r.launchMatrix.copy(l.mesh.matrixWorld);vfx?.bindLaunchers?.(this.launchers)
  r.inheritedVelocity.copy(ownerVelocity||this.direction.set(0,0,0));r.newborn=true
  this.remaining--;this.cooldown=CUFF_MISSILES.interval;this.stats.launched++;if(vfx?.startLaunch)vfx.startLaunch(slot,l,r.position,r.heading);else vfx?.puff(r.position,r.heading,true);return true
 }
 step(dt,query,vfx,onHit,onWorld){
  dt=Math.max(0,Math.min(.1,dt));if(!dt)return
  this.cooldown=Math.max(0,this.cooldown-dt)
  // Render the detached original cap at the cuff for its complete birth
  // frame. Simulation starts on the next frame, even at a low frame rate.
  for(const r of this.records){r.holdFrame=r.newborn;r.newborn=false}
  const steps=Math.max(1,Math.ceil(dt/(1/120))),step=dt/steps
  for(let n=0;n<steps;n++)for(const r of this.records){
   if(!r.active||r.holdFrame)continue
   r.age+=step;r.previous.copy(r.position)
   const target=r.target,alive=target&&!target.dead&&target.meleeEnabled!==false
   if(alive){r.goal.copy(target.position);r.goal.y+=target.height*.55}
   this.direction.subVectors(r.goal,r.base);const distance=this.direction.length();this.direction.normalize()
   // A relaxed forearm points down. The initial steering impulse must turn
   // that ejection promptly, before the live cuff's nose reaches the ground.
   r.heading.lerp(this.direction,1-Math.exp(-step*(r.age<.15?28:10))).normalize()
   r.base.addScaledVector(r.heading,Math.min(CUFF_MISSILES.speed,20+r.age*70)*step)
   r.base.addScaledVector(r.inheritedVelocity,Math.exp(-Math.max(0,r.age-.18)*5)*step)
   this.side.crossVectors(r.heading,up);if(this.side.lengthSq()<.01)this.side.set(1,0,0);this.side.normalize();this.up.crossVectors(this.side,r.heading).normalize()
   const wave=CUFF_MISSILES.wave*Math.min(1,r.age/.18)*Math.min(1,distance/6),phase=r.slot%2*Math.PI
   r.position.copy(r.base).addScaledVector(this.side,Math.sin(r.age*13+phase)*wave).addScaledVector(this.up,Math.sin(r.age*10)*wave*.45)
   this.direction.subVectors(r.position,r.previous);const length=this.direction.length();if(length<1e-8)continue
   this.ray.set(r.previous,this.direction.divideScalar(length));let actorAt=Infinity
   if(alive){const p=target.position,radius=target.radius+.12;this.box.min.set(p.x-radius,p.y-.12,p.z-radius);this.box.max.set(p.x+radius,p.y+target.height+.12,p.z+radius);if(this.ray.intersectBox(this.box,this.hit))actorAt=r.previous.distanceTo(this.hit)}
   const world=query.castWorld(this.ray,length)
   if(world.solid&&world.distance<Math.min(length,actorAt)){r.position.copy(world.point);r.active=false;this.stats.blocked++;onWorld?.(r.position,r.heading)}
   else if(actorAt<=length){r.position.copy(this.hit);r.active=false;if(target.receiveMissileHit(r.heading)!==false){this.stats.hits++;onHit?.(target,r.position,r.heading)}}
   r.smoke+=length
   while(r.smoke>=CUFF_MISSILES.smokeSpacing){r.smoke-=CUFF_MISSILES.smokeSpacing;this.point.copy(r.position).addScaledVector(this.direction,-r.smoke);vfx?.puff(this.point,r.heading,false)}
   if(r.age>=CUFF_MISSILES.life)r.active=false
  }
 }
 present(active){
  for(let i=0;i<this.launchers.length;i++)if(active&&i<4-this.remaining)this.launchers[i].mesh.visible=false
 }
 dispose(){this.reset()}
}
