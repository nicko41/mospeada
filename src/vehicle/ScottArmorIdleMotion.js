import {Euler,Quaternion} from 'three'

// Additive, zero-centred rotations only: no root translation, geometry, bone
// scale, skinning or Armor anchors. Each region has its own smooth rhythms.
export class ScottArmorIdleMotion{
  constructor(instance,wrapper){
    this.wrapper=wrapper;this.time=0;this.weight=0;this.applied=false;this.delta=new Quaternion();this.euler=new Euler()
    this.records=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'].map(name=>({name,bone:instance.bones.get('mixamorig'+name),q:new Quaternion()})).filter(r=>r.bone)
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.q);this.wrapper.updateMatrixWorld(true);this.applied=false}
  apply(entry,dt,paused,settings={enabled:true,intensity:1},floating=false){
    if(!['complete','armorboost'].includes(entry?.phase)||entry.returnFlight){this.weight=0;return}
    const target=settings.enabled?settings.intensity*(entry.phase==='armorboost'?.2:1):0
    if(!paused){this.time+=Math.max(0,Math.min(.1,dt));this.weight+=(target-this.weight)*(1-Math.exp(-Math.max(0,dt)*7))}
    else if(this.settings&&(this.settings.enabled!==settings.enabled||this.settings.intensity!==settings.intensity))this.weight=target
    this.settings={...settings}
    if(this.weight<1e-5)return
    const t=this.time,w=this.weight,b=Math.sin(t*1.73),balance=(floating?1:.55)*(Math.sin(t*.47)*.0011+Math.sin(t*.83+.7)*.0005)
    for(const r of this.records){
      r.q.copy(r.bone.quaternion)
      const left=r.name.startsWith('Left'),sign=left?1:-1,phase=left?.8:2.1
      let x=0,y=0,z=0
      if(r.name==='Hips'){z=balance;x=Math.sin(t*.59)*.0009}
      else if(r.name.startsWith('Spine')){x=b*.0018;z=-balance*.3}
      else if(r.name==='Neck'){y=Math.sin(t*.53)*.003;x=Math.sin(t*.79+.5)*.002}
      else if(r.name==='Head'){y=Math.sin(t*.41+.4)*.005;x=Math.sin(t*.67+1.2)*.0025}
      else if(r.name.endsWith('Shoulder')){z=sign*(b*.002+Math.sin(t*(left?.91:.78)+phase)*.001)}
      else if(r.name.endsWith('ForeArm')){x=Math.sin(t*(left?.73:.89)+phase)*.002}
      else if(r.name.endsWith('Arm')){z=Math.sin(t*(left?.63:.57)+phase)*.0025}
      else if(r.name.endsWith('Hand')){y=Math.sin(t*(left?1.13:1.03)+phase)*.004;x=Math.sin(t*(left?.79:.97)+phase)*.002}
      else if(r.name.endsWith('UpLeg')){x=Math.sin(t*(left?.67:.61)+phase)*.002;z=-balance*.4}
      else if(r.name.endsWith('Leg')){x=-Math.sin(t*(left?.67:.61)+phase)*.0013}
      this.delta.setFromEuler(this.euler.set(x*w,y*w,z*w));r.bone.quaternion.multiply(this.delta)
    }
    this.wrapper.updateMatrixWorld(true);this.applied=true
  }
}
