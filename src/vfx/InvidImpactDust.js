import {Color,Vector3} from 'three'
import {DustTrail} from './DustTrail.js'
import {DESERT_WHEEL_FX} from '../world/forest/forestWheelFX.js'

export const INVID_IMPACT_DUST=Object.freeze({capacity:96,perImpact:12})

// One burst-only Quarks module. Production shares the bikes' existing desert
// dust atlas, geometry, material and batch; only the emission shape differs.
export class InvidImpactDust{
 constructor(shared=null,sampleGround=null){
  this.shared=shared;this.sampleGround=sampleGround;this.dust=new DustTrail({shared});this.system=this.dust.system;this.systems=this.dust.systems;this.up=new Vector3(0,1,0);this.axis=new Vector3(0,0,1);this.color=new Color()
  const d=this.dust,p=DESERT_WHEEL_FX.dustPalette;this.color.set(p.low);d.colors.a.set(this.color.r,this.color.g,this.color.b,p.lowOpacity);this.color.set(p.high);d.colors.b.set(this.color.r,this.color.g,this.color.b,p.highOpacity)
  d.life.a=.85;d.life.b=1.4;d.size.a=.4*DESERT_WHEEL_FX.size;d.size.b=.65*DESERT_WHEEL_FX.size;d.speed.a=1.6;d.speed.b=2.8;d.shape.radius=.18;d.shape.angle=.95;d.gravity.magnitude.value=DESERT_WHEEL_FX.gravity;d.drag.dampen=DESERT_WHEEL_FX.drag/20;d.wind.magnitude.value=DESERT_WHEEL_FX.wind*.35;d.turbulence.velocityMultiplier.set(DESERT_WHEEL_FX.turbulence,DESERT_WHEEL_FX.turbulence*.28,DESERT_WHEEL_FX.turbulence)
  this.system.emitter.name='Quarks_Invid_orb_desert_impact_dust';this.system.behaviors.push(this.system.behaviors.shift());this.system.emitter.updateMatrixWorld(true);this.system.emissionState.waitEmiting=INVID_IMPACT_DUST.capacity;this.system.emit(0,this.system.emissionState,this.system.emitter.matrixWorld);this.system.restart();d.stopEmission()
 }
 get enabled(){return this.shared?.config?.enabled!==false&&this.shared?.config?.earthEnabled!==false}
 configureBatches(renderer){this.dust.configureBatches(renderer)}
 burst(point){
  if(!this.enabled)return
  const ps=this.system,count=Math.min(INVID_IMPACT_DUST.perImpact,INVID_IMPACT_DUST.capacity-ps.particleNum);if(count<=0)return
  const floor=this.sampleGround?.(point.x,point.z),y=Number.isFinite(floor)?floor:point.y,hx=this.sampleGround?.(point.x+.5,point.z),hz=this.sampleGround?.(point.x,point.z+.5)
  this.dust.normal.set(Number.isFinite(hx)?y-hx:0,.5,Number.isFinite(hz)?y-hz:0).normalize();ps.emitter.position.set(point.x,y+.06,point.z);ps.emitter.quaternion.setFromUnitVectors(this.axis,this.up);ps.emitter.updateMatrixWorld(true)
  const first=ps.particleNum;ps.emissionState.waitEmiting=count;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld)
  for(let i=first;i<ps.particleNum;i++)for(const behavior of ps.behaviors)behavior.update(ps.particles[i],0)
  this.ensureVisible();this.dust.batch?.update()
 }
 ensureVisible(){if(this.enabled&&this.system.particleNum>0&&this.dust.batch)this.dust.batch.visible=true}
 clear(){this.dust.clear()}
 dispose(){this.dust.dispose()}
}
