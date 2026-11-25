import {AnimationMixer,LoopOnce,LoopRepeat,Matrix4,Vector3,DynamicDrawUsage,InstancedBufferAttribute} from 'three'
import {SCOUT_JOINTS,SCOUT_MOTION as M} from './scoutMechanicalConfig.js'
import {ScoutHitReaction} from './ScoutHitReaction.js'
const soleCache=new WeakMap(),clawCache=new WeakMap()

export class ScoutMechanicalMotion{
  constructor(view,clips){
    this.view=view;this.joints=SCOUT_JOINTS.map(j=>view.model.getObjectByName(j.name));this.body=this.joints[0]
    this.mixer=new AnimationMixer(view.model);this.actions=new Map(clips.map(c=>[c.name,this.mixer.clipAction(c)]))
    this.matrices=SCOUT_JOINTS.map(()=>new Matrix4());this.inverse=new Matrix4();this.point=new Vector3();this.lastMode=null;this.contactAge=Infinity;this.current=null;this.name='rest'
    this.soles=[[],[]]
    this.hitReaction=new ScoutHitReaction(this)
    const g=view.levels[0].geometry,p=g.attributes.position,index=g.attributes.skinIndex,weight=g.attributes.skinWeight
    const cached=soleCache.get(g)
    if(cached)this.soles=cached
    else for(let side=0;side<2;side++){
      let min=Infinity;const candidates=[]
      for(let i=0;i<p.count;i++)if(index.getX(i)===side+3&&weight.getX(i)>.99)min=Math.min(min,p.getY(i))
      for(let i=0;i<p.count;i++)if(index.getX(i)===side+3&&weight.getX(i)>.99&&p.getY(i)<min+.06)candidates.push(i)
      const selected=new Set()
      for(let a=0;a<8;a++){let best=-Infinity,id=-1;for(const i of candidates){const score=p.getX(i)*Math.cos(a*Math.PI/4)+p.getZ(i)*Math.sin(a*Math.PI/4);if(score>best){best=score;id=i}}if(id>=0)selected.add(id)}
      for(const i of selected)this.soles[side].push(new Vector3().fromBufferAttribute(p,i))
    }
    if(!cached)soleCache.set(g,this.soles)
    this.claws=clawCache.get(g)
    if(!this.claws){
      this.claws=[1,2].map(joint=>{
        const limits=Array.from({length:3},()=>({min:Infinity,max:-Infinity,a:-1,b:-1}))
        for(let i=0;i<p.count;i++)if(index.getX(i)===joint&&weight.getX(i)>.99)for(let axis=0;axis<3;axis++){
          const value=p.getComponent(i,axis),r=limits[axis]
          if(value<r.min){r.min=value;r.a=i}if(value>r.max){r.max=value;r.b=i}
        }
        return [...new Set(limits.flatMap(r=>[r.a,r.b]).filter(i=>i>=0))].map(i=>new Vector3().fromBufferAttribute(p,i))
      });clawCache.set(g,this.claws)
    }
    this.sync()
  }
  select(name,manual=false){
    const action=this.actions.get(name);if(!action)return null
    if(this.current!==action){
      const previous=this.current;action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1)
      action.setLoop(['Hover','Idle','Walk'].includes(name)?LoopRepeat:LoopOnce,Infinity);action.clampWhenFinished=true;action.play()
      if(name==='Hover')action.time=(this.view.id*.37)%action.getClip().duration
      if(previous)action.crossFadeFrom(previous,M.blend,false)
      this.current=action;this.name=name
    }
    action.paused=manual;return action
  }
  sync(){
    const {view}=this;view.root.updateMatrixWorld(true);this.inverse.copy(view.levels[0].matrixWorld).invert()
    const skeleton=view.levels[0].skeleton
    for(let i=0;i<5;i++)this.matrices[i].multiplyMatrices(this.inverse,this.joints[i].matrixWorld).multiply(skeleton.boneInverses[i])
    for(const level of view.levels)level.skeleton.update()
  }
  reset(){this.hitReaction.reset();this.mixer.stopAllAction();this.current=null;this.name='rest';this.lastMode=null;this.contactAge=Infinity;for(const [i,joint]of this.joints.entries()){joint.position.fromArray(SCOUT_JOINTS[i].pivot);joint.quaternion.identity()}this.sync()}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.view.model)}
  clawContactPoint(side,out){
    const joint=side?2:1,mesh=this.view.levels[0];let lowest=Infinity
    out.copy(this.view.root.position)
    for(const probe of this.claws[side?1:0]){
      this.point.copy(probe).applyMatrix4(this.matrices[joint]).applyMatrix4(mesh.matrixWorld)
      if(this.point.y<lowest){lowest=this.point.y;out.copy(this.point)}
    }
    return out
  }
  update(scout,dt,sample){
    if(scout.dead){this.hitReaction.reset();this.sync();return}
    if(dt<=0){this.sync();return}
    this.hitReaction.restore()
    if(scout.mode==='ground'&&this.lastMode==='descending')this.contactAge=0
    else this.contactAge+=dt
    const speed=Math.hypot(scout.velocity.x,scout.velocity.z),ground=sample(scout.position.x,scout.position.z),gap=Number.isFinite(ground)?scout.position.y-ground:10
    if(Number.isFinite(scout.clawAge)&&scout.clawAge<M.clawDuration){const a=this.select(scout.clawSide?'Claw_R':'Claw_L',true);if(a)a.time=scout.clawAge}
    else if(scout.mode==='descending'){const a=this.select('Landing',true);if(a)a.time=M.landingContact*Math.max(0,Math.min(1,1-gap/2.6))}
    else if(scout.mode==='ground'&&this.contactAge<M.landingDuration-M.landingContact){const a=this.select('Landing',true);if(a)a.time=M.landingContact+this.contactAge}
    else if(scout.mode==='ground'){const a=this.select(speed>.08?'Walk':'Idle');if(a&&speed>.08)a.setEffectiveTimeScale(Math.max(.25,Math.min(M.runCadence,speed/M.walkReferenceSpeed)))}
    else this.select(scout.mode==='rising'?'Takeoff':'Hover')
    this.mixer.update(dt);this.sync()
    // Ground only: plant the lowest rigid foot on the real terrain by moving
    // the body as a whole. No extra leg joints, scaling or runtime vertex work.
    if(scout.mode==='ground'){
      let lift=-Infinity
      for(let side=0;side<2;side++)for(const sole of this.soles[side]){
        this.point.copy(sole).applyMatrix4(this.matrices[side+3]).applyMatrix4(this.view.levels[0].matrixWorld)
        const floor=sample(this.point.x,this.point.z);if(Number.isFinite(floor))lift=Math.max(lift,floor+.025-this.point.y)
      }
      if(Number.isFinite(lift)){const scale=this.view.model.scale.y;this.body.position.y+=Math.max(-.10,Math.min(.14,lift/scale));this.sync()}
    }
    if(this.hitReaction.apply(dt))this.sync()
    this.lastMode=scout.mode
  }
}

export function scoutRigUniforms(count){return {uScoutRig:{value:Array.from({length:count*5},()=>new Matrix4())}}}
export function scoutRigGeometry(geometry,capacity){geometry.setAttribute('aScoutRigId',new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));geometry.computeBoundingBox();geometry.boundingBox.expandByScalar(.45);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.45;return geometry}
export function patchScoutRigMaterial(material,uniforms,count){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey()
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms)
    shader.vertexShader=`attribute float aScoutRigId;attribute vec4 skinIndex,skinWeight;uniform mat4 uScoutRig[${count*5}];\n`+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      int scoutBase=int(aScoutRigId)*5;
      mat4 scoutSkin=uScoutRig[scoutBase+int(skinIndex.x)];
      if(skinWeight.y>0.0)scoutSkin=scoutSkin*skinWeight.x+uScoutRig[scoutBase+int(skinIndex.y)]*skinWeight.y;
      objectNormal=mat3(scoutSkin)*objectNormal;
      #ifdef USE_TANGENT
        objectTangent=mat3(scoutSkin)*objectTangent;
      #endif`)
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=(scoutSkin*vec4(transformed,1.0)).xyz;')
  }
  material.customProgramCacheKey=()=>key+`/scout-four-limb-instancing-v1/${count}`
  return material
}
