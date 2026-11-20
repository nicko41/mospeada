import {AnimationMixer,Quaternion,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createGroundTurns} from './armorGroundTurns.js'

// Full native clips run in Scott's EXISTING mixer. Their resulting local pose
// is presented after the unchanged assembly evaluates its reference pose.
export class ArmorLocomotion{
  constructor(instance,actorScale){
    this.instance=instance;this.weight=0;this.applied=false;this.ready=false
    this.records=[...instance.bones.values()].map(bone=>({bone,p:new Vector3(),q:new Quaternion(),s:new Vector3(),targetP:new Vector3(),targetQ:new Quaternion(),targetS:new Vector3()}))
    this.clips=new Map();this.info=new Map()
    this.turns=createGroundTurns(instance.sourceClips,actorScale)
    for(const [name,turn] of this.turns){this.clips.set(name,turn.clip);this.info.set(name,{sourceName:turn.sourceName,start:turn.start,speed:1})}
    for(const [name,sourceName] of [['Armor_Walk','walking_2_inplace'],['Armor_Run','Running']]){
      const source=instance.sourceClips.find(c=>c.name===sourceName)
      if(!source)throw Error(`No existe el clip original ${sourceName}; no se genera una locomoción alternativa`)
      const clip=source.clone();clip.name=name
      const track=clip.tracks.find(t=>t.name==='mixamorigHips.position'),start=new Vector3().fromArray(track.values)
      // Remove accumulated horizontal root travel, retaining bob/sway and
      // every original joint track. Never edit the source AnimationClip.
      const end=new Vector3().fromArray(track.values,track.values.length-3),duration=clip.duration
      for(let i=0;i<track.times.length;i++)for(const axis of [0,2])track.values[i*3+axis]-=(end.getComponent(axis)-start.getComponent(axis))*track.times[i]/duration
      this.clips.set(name,clip);this.info.set(name,{sourceName,start,speed:this.measureSpeed(instance.sourceScene,clip,actorScale)})
    }
  }
  measureSpeed(source,clip,scale){
    const model=clone(source),mixer=new AnimationMixer(model),action=mixer.clipAction(clip).play(),hips=model.getObjectByName('mixamorigHips'),feet=['Left','Right'].map(side=>model.getObjectByName(`mixamorig${side}Foot`)),ranges=feet.map(()=>({min:Infinity,max:-Infinity})),p=new Vector3(),h=new Vector3()
    for(let i=0;i<60;i++){
      action.time=clip.duration*i/60;mixer.update(0);model.updateMatrixWorld(true);hips.getWorldPosition(h)
      feet.forEach((foot,j)=>{foot.getWorldPosition(p);const z=(p.z-h.z)*scale;ranges[j].min=Math.min(ranges[j].min,z);ranges[j].max=Math.max(ranges[j].max,z)})
    }
    mixer.stopAllAction();mixer.uncacheRoot(model)
    return Math.max(.1,ranges.reduce((n,r)=>n+2*(r.max-r.min)/clip.duration,0)/ranges.length)
  }
  restore(){if(!this.applied)return;for(const r of this.records){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.s)}this.applied=false}
  capture(name){
    const info=this.info.get(name);if(!info)return
    for(const r of this.records){
      r.targetP.copy(r.bone.position);r.targetQ.copy(r.bone.quaternion);r.targetS.copy(r.bone.scale)
      if(r.bone.name==='mixamorigHips')r.targetP.sub(info.start).add(this.instance.armorBaseHipPosition)
    }
    this.ready=true;this.source=info.sourceName
  }
  apply(armor,dt,paused){
    if(!armor?.active){this.weight=0;return}
    const target=armor.state.mode==='ARMOR_GROUND'&&!armor.state.jump&&armor.state.height<.45&&(armor.state.speed>.05||armor.state.groundTurn)?1:0
    if(!paused)this.weight+=(target-this.weight)*(1-Math.exp(-dt*12))
    if(this.weight>.999)this.weight=1
    if(!this.ready||this.weight<1e-5)return
    for(const r of this.records){
      r.p.copy(r.bone.position);r.q.copy(r.bone.quaternion);r.s.copy(r.bone.scale)
      r.bone.position.lerp(r.targetP,this.weight);r.bone.quaternion.slerp(r.targetQ,this.weight);r.bone.scale.lerp(r.targetS,this.weight)
    }
    this.applied=true
  }
}
