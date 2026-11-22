import {Matrix4,Quaternion,Vector3} from 'three'

export const SCOTT_DEFEAT=Object.freeze({fallSeconds:1.7,retrySeconds:2.3,ejectDistance:1.5,source:'Stand_Up1',sourceStandingTime:6.3,gravity:18})
const probes=new WeakMap()
function bodyProbes(geometry){
  if(probes.has(geometry))return probes.get(geometry)
  const p=geometry.attributes.position,j=geometry.attributes.skinIndex,w=geometry.attributes.skinWeight,groups=new Map()
  for(let i=0;i<p.count;i++){
    let channel=0;for(let n=1;n<4;n++)if(w.array[i*4+n]>w.array[i*4+channel])channel=n
    const joint=j.array[i*4+channel];let limits=groups.get(joint)
    if(!limits){limits=Array.from({length:3},()=>({min:Infinity,max:-Infinity,a:i,b:i}));groups.set(joint,limits)}
    for(let axis=0;axis<3;axis++){const value=p.array[i*3+axis],r=limits[axis];if(value<r.min){r.min=value;r.a=i}if(value>r.max){r.max=value;r.b=i}}
  }
  const ids=[...new Set([...groups.values()].flatMap(a=>a.flatMap(r=>[r.a,r.b])))];probes.set(geometry,ids);return ids
}

// Uses the existing supine Stand_Up1 backwards. All source tracks, vertex
// buffers, skin weights and clips stay untouched. Live poses restore first.
export class ScottDefeatMotion{
  constructor(instance,wrapper,runtime){
    Object.assign(this,{instance,wrapper,runtime,active:false,applied:false,age:0,offsetY:0,vy:0,contact:false,publishAge:0})
    const clip=instance.sourceClips.find(c=>c.name===SCOTT_DEFEAT.source)
    if(!clip)throw Error('Falta la animación original Stand_Up1 para la derrota')
    this.records=[...instance.bones.values()].map(bone=>({bone,p:new Vector3(),q:new Quaternion(),s:new Vector3(),startP:new Vector3(),startQ:new Quaternion(),nativeP:new Vector3(),nativeQ:new Quaternion(),position:clip.tracks.find(t=>t.name===bone.name+'.position')?.createInterpolant(),quaternion:clip.tracks.find(t=>t.name===bone.name+'.quaternion')?.createInterpolant()}))
    this.hip=this.records.find(r=>r.bone.name==='mixamorigHips');this.hipOffset=new Vector3();this.origin=new Vector3();this.originQ=new Quaternion();this.originS=new Vector3();this.beforeP=new Vector3();this.beforeQ=new Quaternion();this.beforeS=new Vector3()
    this.point=new Vector3();this.anchor=new Vector3();this.head=new Vector3();this.matrix=new Matrix4();this.inverse=new Matrix4();this.backward=new Vector3();this.upright=new Quaternion()
    this.skins=instance.skins.map(({mesh})=>({mesh,ids:bodyProbes(mesh.geometry)}));this.armorProbes=null
  }
  restore(){
    if(!this.applied)return
    for(const r of this.records){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.s)}
    this.wrapper.position.copy(this.beforeP);this.wrapper.quaternion.copy(this.beforeQ);this.wrapper.scale.copy(this.beforeS);this.applied=false
  }
  reset(){this.restore();this.active=false;this.age=this.offsetY=this.vy=0;this.contact=false;this.runtime.defeat=null}
  apply(dt,sample){
    if(!this.active){
      this.active=true;this.age=0;this.offsetY=0;this.vy=Math.min(0,this.runtime.state?.verticalVelocity||0);this.contact=false
      this.origin.copy(this.wrapper.position);this.originQ.copy(this.wrapper.quaternion);this.originS.copy(this.wrapper.scale)
      this.upright.setFromAxisAngle(new Vector3(0,1,0),this.runtime.state?.pedestrian?.yaw??this.runtime.state?.yaw??0)
      this.backward.set(0,0,-1).applyQuaternion(this.upright).multiplyScalar(this.runtime.state?.riderMode==='mounted'&&!this.runtime.armorController?.active?SCOTT_DEFEAT.ejectDistance:0)
      for(const r of this.records){r.startP.copy(r.bone.position);r.startQ.copy(r.bone.quaternion)}
      this.hipOffset.copy(this.hip.startP).sub(this.point.fromArray(this.hip.position.evaluate(SCOTT_DEFEAT.sourceStandingTime)))
      this.runtime.defeat={age:0,ready:false}
    }
    this.beforeP.copy(this.wrapper.position);this.beforeQ.copy(this.wrapper.quaternion);this.beforeS.copy(this.wrapper.scale)
    dt=Math.max(0,Math.min(.1,dt));this.age+=dt;const t=Math.min(1,this.age/SCOTT_DEFEAT.fallSeconds),smooth=t*t*(3-2*t),nativeTime=SCOTT_DEFEAT.sourceStandingTime*(1-smooth),enter=Math.min(1,this.age/.22)
    for(const r of this.records){
      r.p.copy(r.bone.position);r.q.copy(r.bone.quaternion);r.s.copy(r.bone.scale)
      if(r.quaternion){r.nativeQ.fromArray(r.quaternion.evaluate(nativeTime)).normalize();r.bone.quaternion.slerpQuaternions(r.startQ,r.nativeQ,enter)}
      if(r.position){r.nativeP.fromArray(r.position.evaluate(nativeTime));if(r===this.hip)r.nativeP.add(this.hipOffset);r.bone.position.lerpVectors(r.startP,r.nativeP,enter)}
    }
    const settled=this.age-dt>=SCOTT_DEFEAT.fallSeconds&&this.contact&&!this.runtime.armorController?.active
    if(!settled){this.vy-=SCOTT_DEFEAT.gravity*dt;this.offsetY+=this.vy*dt}
    const eject=Math.min(1,this.age/.9),ejectBlend=1-(1-eject)**2
    this.wrapper.position.copy(this.origin).addScaledVector(this.backward,ejectBlend);this.wrapper.position.y+=this.offsetY;this.wrapper.quaternion.slerpQuaternions(this.originQ,this.upright,smooth);this.wrapper.scale.copy(this.originS);this.wrapper.updateMatrixWorld(true)
    if(settled){this.publish();this.applied=true;return}
    this.hip.bone.getWorldPosition(this.anchor);this.instance.bones.get('mixamorigHead').getWorldPosition(this.head)
    let floor=-Infinity
    for(const [x,z] of [[this.anchor.x,this.anchor.z],[this.head.x,this.head.z],[this.anchor.x-.65,this.anchor.z],[this.anchor.x+.65,this.anchor.z]]){const h=sample(x,z);if(Number.isFinite(h))floor=Math.max(floor,h)}
    this.floor=floor;let lift=-Infinity
    for(const {mesh,ids} of this.skins)for(const id of ids){mesh.getVertexPosition(id,this.point);mesh.localToWorld(this.point);const ground=sample(this.point.x,this.point.z);if(Number.isFinite(ground))lift=Math.max(lift,ground+.015-this.point.y)}
    this.contact=lift>=-1e-4
    if(lift>0){this.offsetY+=lift;this.wrapper.position.y+=lift;this.vy=0;this.wrapper.updateMatrixWorld(true)}
    this.publish();this.applied=true
  }
  publish(){this.runtime.defeat.age=this.age;this.runtime.defeat.ready=this.age>=SCOTT_DEFEAT.retrySeconds&&this.contact&&(!this.runtime.bikeDefeatMotion?.active||this.runtime.bikeDefeatMotion.settled)}
  groundArmor(articulation){
    if(!this.active||!this.runtime.armorController?.active||!articulation||!Number.isFinite(this.floor))return
    if(!this.armorProbes)this.armorProbes=[...new Set(articulation.records.map(r=>r.mesh))].map(mesh=>{
      mesh.geometry?.computeBoundingBox();const box=mesh.geometry?.boundingBox,points=[]
      if(box)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z))
      return{mesh,points,world:new Matrix4()}
    })
    let min=Infinity
    for(const r of this.armorProbes){r.mesh.updateWorldMatrix(true,false);r.world.copy(r.mesh.matrixWorld);if(r.mesh.visible)for(const p of r.points)min=Math.min(min,this.point.copy(p).applyMatrix4(r.world).y)}
    if(min>=this.floor+.025)return
    const lift=this.floor+.025-min;this.offsetY+=lift;this.wrapper.position.y+=lift;this.wrapper.updateMatrixWorld(true);this.contact=true
    for(const r of this.armorProbes){this.matrix.copy(r.world);this.matrix.elements[13]+=lift;r.mesh.parent.updateWorldMatrix(true,false);r.mesh.matrix.copy(this.inverse.copy(r.mesh.parent.matrixWorld).invert()).multiply(this.matrix);r.mesh.matrixWorldNeedsUpdate=true;r.mesh.updateWorldMatrix(false,false)}
  }
}
