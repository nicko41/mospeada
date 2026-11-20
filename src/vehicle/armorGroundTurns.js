import {Quaternion,Vector3} from 'three'

// Single-support step intervals inspected in the ORIGINAL Meshy clips.
// Copies only: extract root motion; never edit a source track or rig.
const steps=[['Armor_Turn_Left','Walk_Turn_Left',.80,1.24],['Armor_Turn_Right','Walk_Turn_Right_Idle_Style',.28,.58]]
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n))
export function createGroundTurns(sourceClips,scale){
  const turns=new Map(),axis=new Vector3(0,1,0)
  for(const [name,sourceName,from,to] of steps){
    const source=sourceClips.find(c=>c.name===sourceName)
    if(!source)continue
    const clip=source.clone();clip.name=name;clip.duration=to-from
    const root=source.tracks.find(t=>t.name==='mixamorigHips.position').createInterpolant(),rotation=source.tracks.find(t=>t.name==='mixamorigHips.quaternion').createInterpolant()
    const start=new Vector3().fromArray(root.evaluate(from)),q=new Quaternion().fromArray(rotation.evaluate(from)),yaw0=2*Math.atan2(q.y,q.w),frames=[]
    for(let i=0;i<=60;i++){
      const time=clip.duration*i/60,p=new Vector3().fromArray(root.evaluate(from+time)).sub(start).multiplyScalar(scale*.01).applyAxisAngle(axis,-yaw0)
      q.fromArray(rotation.evaluate(from+time));frames.push({time,yaw:wrap(2*Math.atan2(q.y,q.w)-yaw0),x:p.x,z:p.z})
    }
    clip.tracks=source.tracks.map(track=>{
      const copy=track.clone(),times=[from,...Array.from(track.times).filter(t=>t>from+1e-5&&t<to-1e-5),to],interpolant=track.createInterpolant(),values=[]
      for(const t of times){
        const v=Array.from(interpolant.evaluate(t))
        if(track.name==='mixamorigHips.position'){v[0]=start.x;v[2]=start.z}
        if(track.name==='mixamorigHips.quaternion'){
          q.fromArray(v);q.premultiply(new Quaternion().setFromAxisAngle(axis,-2*Math.atan2(q.y,q.w))).normalize();q.toArray(v)
        }
        values.push(...v)
      }
      copy.times=new Float32Array(times.map(t=>t-from));copy.values=new Float32Array(values);return copy
    })
    turns.set(name,{name,sourceName,clip,start,frames,duration:clip.duration,angle:frames.at(-1).yaw,sourceInterval:[from,to]})
  }
  return turns
}

export function sampleGroundTurn(profile,time){
  const n=Math.max(0,Math.min(profile.frames.length-1,time/profile.duration*(profile.frames.length-1))),i=Math.min(profile.frames.length-2,Math.floor(n)),f=n-i,a=profile.frames[i],b=profile.frames[i+1]
  return{yaw:a.yaw+(b.yaw-a.yaw)*f,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f}
}

export function advanceGroundTurn(a,heading,moving,dt,canMove,profiles,c){
  if(a.groundTurn?.finished)a.groundTurn=null
  const error=wrap(heading-a.yaw)
  if(!a.groundTurn&&moving&&a.speed<.4&&Math.abs(error)>c.groundTurnThreshold&&profiles?.size){
    const name=error>0?'Armor_Turn_Left':'Armor_Turn_Right',profile=profiles.get(name)
    if(profile){
      let end=profile.duration
      if(Math.abs(error)<Math.abs(profile.angle)){const hit=profile.frames.find(f=>Math.abs(f.yaw)>=Math.abs(error));if(hit)end=hit.time}
      a.groundTurn={name,time:0,end,startYaw:a.yaw,startX:a.x,startZ:a.z,offsetX:a.pelvisOffsetX||0,offsetZ:a.pelvisOffsetZ||0,finished:false}
    }
  }
  const turn=a.groundTurn,profile=turn&&profiles?.get(turn.name)
  if(!profile)return false
  const time=Math.min(turn.end,turn.time+dt*c.groundTurnRate),p=sampleGroundTurn(profile,time),yaw=turn.startYaw+p.yaw
  // Preserve the source foot path, including the existing pelvis offset
  // from the controller origin. No second rotation on the root bone.
  const ox=turn.offsetX,oz=turn.offsetZ,s=Math.sin(turn.startYaw),co=Math.cos(turn.startYaw)
  const x=turn.startX+co*(p.x+ox)+s*(p.z+oz)-Math.cos(yaw)*ox-Math.sin(yaw)*oz
  const z=turn.startZ-s*(p.x+ox)+co*(p.z+oz)+Math.sin(yaw)*ox-Math.cos(yaw)*oz
  if(!canMove(x,z,a.y)){a.groundTurn=null;a.vx=a.vz=0;return true}
  a.vx=(x-a.x)/dt;a.vz=(z-a.z)/dt;a.x=x;a.z=z;a.yaw=yaw;turn.time=time;turn.finished=time>=turn.end
  return true
}
