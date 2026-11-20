import {Matrix4,Quaternion,Vector3} from 'three'
import {frontGeometryKey} from './frontTransformMath.js'

const blend=n=>{const t=Math.max(0,Math.min(1,(n-.22)/(.48-.22)));return t*t*(3-2*t)}

// Move each complete guard with one frame, then follow the existing forearm.
// Original meshes/materials/parents remain intact for normal wheel mechanics.
export class GuardBattloidTransform{
  constructor(rig,scott,data){
    this.applied=false;this.parts=[];this.data=data
    const byKey=new Map(rig.surfaces.map(mesh=>[frontGeometryKey(mesh),mesh]))
    this.groups=data.groups.map(group=>{
      const bone=scott.bones.get(group.bone)
      if(!bone)throw Error(`Falta antebrazo ${group.bone}`)
      const pivot=new Matrix4().makeTranslation(...group.sourcePivot),inversePivot=pivot.clone().invert()
      const records=data.records.filter(r=>r.groupId===group.id)
      const target=new Matrix4().fromArray(records[0].targetInModel)
      for(const r of records)if(r.targetInModel.some((v,i)=>Math.abs(v-target.elements[i])>1e-8))throw Error('El guard dejó de ser un conjunto rígido')
      const parts=records.map(record=>{
        const mesh=byKey.get(record.key);if(!mesh)throw Error(`Falta guard ${record.key}`)
        mesh.updateMatrix()
        const part={record,mesh,position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate,visible:mesh.visible}
        this.parts.push(part);return part
      })
      return{...group,bone,pivot,inversePivot,parts,targetInBone:new Matrix4().fromArray(group.bind).invert().multiply(target).multiply(pivot),current:new Matrix4()}
    })
    this.from=new Matrix4();this.to=new Matrix4();this.parentInverse=new Matrix4();this.geometryWorld=new Matrix4()
    this.carrierDelta=new Matrix4();this.carrierInverse=new Matrix4();this.bodyInverse=new Matrix4()
    this.a=new Vector3();this.b=new Vector3();this.qa=new Quaternion();this.qb=new Quaternion();this.sa=new Vector3();this.sb=new Vector3()
  }
  attachToCarriers(front,bindings){
    this.front=front
    for(const group of this.groups){
      const binding=bindings.find(b=>b.bone===group.bone.name)
      group.carrier=front.motionGroups.find(g=>g.id===binding?.carrierId)
      if(!group.carrier)throw Error('Falta la unión de CHEST para '+group.bone.name)
    }
  }
  restore(){
    if(!this.applied)return
    for(const p of this.parts){const m=p.mesh;m.position.copy(p.position);m.quaternion.copy(p.quaternion);m.scale.copy(p.scale);m.matrix.copy(p.matrix);m.matrixAutoUpdate=p.auto;m.visible=p.visible;m.matrixWorldNeedsUpdate=true}
    this.applied=false
  }
  apply(progress,choreography=null){
    const cuffClock=choreography?.cuffs==null?null:Math.max(0,Math.min(1,choreography.cuffs))
    // Standalone inspection keeps the existing assembly timeline. In the
    // game, the director releases cuffs during the torso rise instead.
    this.progress=cuffClock==null?progress:.22+.26*cuffClock
    const t=cuffClock==null?blend(progress):cuffClock*cuffClock*(3-2*cuffClock)
    this.fit=t
    if(t<=0&&!this.front?.applied){this.restore();return}
    for(const group of this.groups){
      const p=group.parts[0]
      p.mesh.parent.updateWorldMatrix(true,false);group.bone.updateWorldMatrix(true,false)
      this.from.copy(p.mesh.parent.matrixWorld).multiply(p.matrix).multiply(group.pivot)
      if(group.carrier){
        // CHEST carries the suspension/cuff assembly first. Once released,
        // the cuff continues from that carried frame to its authored forearm.
        this.bodyInverse.copy(this.front.rig.body.matrixWorld).invert()
        this.carrierDelta.copy(this.front.rig.body.matrixWorld).multiply(group.carrier.current).multiply(this.carrierInverse.copy(group.carrier.sourceBody).invert()).multiply(this.bodyInverse)
        this.from.premultiply(this.carrierDelta)
      }
      this.to.copy(group.bone.matrixWorld).multiply(group.targetInBone)
      if(t===1)group.current.copy(this.to)
      else{
        this.from.decompose(this.a,this.qa,this.sa);this.to.decompose(this.b,this.qb,this.sb)
        group.current.compose(this.a.lerp(this.b,t),this.qa.slerp(this.qb,t),this.sa.lerp(this.sb,t))
      }
      this.geometryWorld.copy(group.current).multiply(group.inversePivot)
      for(const part of group.parts){
        const mesh=part.mesh;mesh.parent.updateWorldMatrix(true,false)
        mesh.matrix.copy(this.parentInverse.copy(mesh.parent.matrixWorld).invert()).multiply(this.geometryWorld)
        mesh.matrixAutoUpdate=false;mesh.visible=part.visible;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(false,false)
      }
    }
    this.applied=true
  }
  dispose(){this.restore()}
}
