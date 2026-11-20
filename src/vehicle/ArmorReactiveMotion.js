import {Euler,Quaternion} from 'three'
import {armorConfig} from './armorPhysics.js'
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x))
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt))

// Visible response AFTER assembly evaluation. Native local clip samples and
// small additive rotations; no rig edits, new bones, IK or Armor reattachment.
export class ArmorReactiveMotion{
  constructor(instance,wrapper){
    this.wrapper=wrapper;this.records=[...instance.bones].map(([name,bone])=>({name,bone,q:new Quaternion()}));this.tracks=new Map();this.applied=false;this.boost=0;this.reverse=0;this.side=0;this.forward=0;this.vertical=0;this.groundBlend=0;this.euler=new Euler();this.delta=new Quaternion();this.q=new Quaternion();this.diagnostics={boost:0,reverse:0}
    for(const name of ['air_squat']){
      const clip=instance.sourceClips?.find(c=>c.name===name)
      if(clip)this.tracks.set(name,{duration:clip.duration,tracks:new Map(clip.tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>[t.name.replace('.quaternion',''),t.createInterpolant()]))})
    }
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.wrapper.updateMatrixWorld(true);this.applied=false}
  apply(a,dt,paused){
    const intensity=armorConfig.bodyIntensity,ground=a.mode==='ARMOR_GROUND'&&!a.jump&&a.height<.45
    const power=(a.mode==='ARMOR_HOVER'||a.jump?a.boostBlend:0)*clamp((a.localForward/armorConfig.hoverSpeed+a.forwardAcceleration/armorConfig.boostAcceleration)*.65,-1,1)
    if(!paused){
      this.boost=damp(this.boost,Math.max(0,power),8,dt)
      this.reverse=damp(this.reverse,Math.max(0,-power),8,dt)
      this.side=damp(this.side,clamp(a.localSide/armorConfig.hoverSpeed*(a.boostBlend>.05?.16:.07)+a.sideAcceleration/armorConfig.boostAcceleration*.14,-.30,.30),9,dt)
      this.forward=damp(this.forward,clamp(a.forwardAcceleration/armorConfig.acceleration*.065,-.10,.10),8,dt)
      const flight=a.jump&&a.height>.2?.35+Math.max(0,a.vy)/armorConfig.maxRiseSpeed*.2:0
      this.vertical=damp(this.vertical,clamp(flight+Math.max(0,a.ay)/armorConfig.jumpAcceleration*.6+Math.max(0,a.vy)/armorConfig.maxRiseSpeed*.25,0,.75),7,dt)
      this.groundBlend=damp(this.groundBlend,ground?1:0,10,dt)
    }
    const lean=(this.boost*.24-this.reverse*.22+this.forward)*intensity,bank=this.side*intensity,tuck=this.vertical*(1-Math.max(this.boost,this.reverse))*intensity
    const sideFlex=(a.mode==='ARMOR_HOVER'||a.jump?a.boostBlend:0)*clamp(Math.abs(this.side)/.30,0,1)*intensity
    for(const r of this.records){
      r.q.copy(r.bone.quaternion)
      const n=r.name.replace('mixamorig','');let x=0,z=0
      if(n==='Hips'){x=lean*.15;z=bank*.25}
      else if(n.startsWith('Spine')){x=lean*.28;z=-bank*.35}
      else if(n==='Head'){x=-lean*.22;z=bank*.20}
      else if(n.endsWith('Shoulder')){z=(n.startsWith('Left')?1:-1)*Math.abs(bank)*.25}
      else if(n.endsWith('UpLeg')){z=bank*.65;x=-this.forward*.2}
      else if(n.endsWith('ForeArm'))x=-lean*.45
      if(/(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(n)){
        // Both legs counter the lateral lean. Only the leg ON the thrust
        // side receives a mild source-squat bend, before the lateral offset.
        const inside=(n.startsWith('Right')&&this.side<0)||(n.startsWith('Left')&&this.side>0)
        const flex=Math.max(tuck,inside?sideFlex*(n.endsWith('UpLeg')?.09:n.endsWith('Leg')?(n.startsWith('Right')?.30:.27):n.endsWith('Foot')?.12:.07):0)
        const track=this.tracks.get('air_squat')?.tracks.get(r.name)
        if(track&&flex>0)r.bone.quaternion.slerp(this.q.fromArray(track.evaluate(.42)).normalize(),flex)
      }
      this.delta.setFromEuler(this.euler.set(x,0,z));r.bone.quaternion.multiply(this.delta)
    }
    this.diagnostics={boost:this.boost*intensity,reverse:this.reverse*intensity,lean,bank,tuck,leftFlex:this.side>0?sideFlex*.27:0,rightFlex:this.side<0?sideFlex*.30:0,ground,speed:a.speed,acceleration:[a.ax,a.ay,a.az]};this.wrapper.updateMatrixWorld(true);this.applied=true
  }
}
