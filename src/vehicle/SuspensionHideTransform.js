import {Matrix4,Quaternion,Vector3} from 'three'
import {frontGeometryKey} from './frontTransformMath.js'

const ramp=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t)}

// Presentation only, after wheel/hydraulic posing. Never reparent the fork
// meshes: normal driving still owns their fixed/sliding mechanical frames.
export class SuspensionHideTransform{
  constructor(rig,front,guards,data){
    Object.assign(this,{rig,front,guards,data,applied:false})
    guards.attachToCarriers(front,data.groups)
    const byKey=new Map(rig.surfaces.filter(m=>/^Fork_/.test(m.userData.sourcePiece)).map(m=>[frontGeometryKey(m),m]))
    this.parts=[]
    this.groups=data.groups.map(group=>{
      const guard=guards.groups.find(g=>g.bone.name===group.bone)
      if(!guard)throw Error('Falta cuff de '+group.side)
      const parts=group.records.map(record=>{
        const mesh=byKey.get(record.key);if(!mesh)throw Error('Falta suspensión '+record.id)
        mesh.updateMatrix();mesh.geometry.computeBoundingBox()
        const center=mesh.geometry.boundingBox.getCenter(new Vector3()),pivot=new Matrix4().makeTranslation(...center.toArray())
        const part={record,mesh,pivot,inversePivot:pivot.clone().invert(),target:front.referenceBind.clone().invert().multiply(new Matrix4().fromArray(record.targetInModel)),position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate,visible:mesh.visible}
        this.parts.push(part);return part
      })
      return{...group,guard,parts}
    })
    for(const key of['sourceGuard','carryDelta','sourceWorld','carry','target','fromCentered','toCentered','targetRigid','residual','residualBlend','current','world','parentInverse'])this[key]=new Matrix4()
    this.a=new Vector3();this.b=new Vector3();this.sa=new Vector3();this.sb=new Vector3();this.qa=new Quaternion();this.qb=new Quaternion()
  }
  restore(){
    if(!this.applied)return
    for(const p of this.parts){const m=p.mesh;m.position.copy(p.position);m.quaternion.copy(p.quaternion);m.scale.copy(p.scale);m.matrix.copy(p.matrix);m.matrixAutoUpdate=p.auto;m.visible=p.visible;m.matrixWorldNeedsUpdate=true}
    this.applied=false
  }
  apply(progress){
    const {stowStart,shrinkStart,end}=this.data.timing
    if(!this.guards.applied){this.restore();return}
    // Share the cuff's clock so the forks cannot remain hanging after it.
    const clock=this.guards.progress??progress
    const fit=ramp(stowStart,end,clock),shrink=ramp(shrinkStart,end,clock)
    for(const group of this.groups){
      const guard=group.guard,reference=guard.parts[0]
      reference.mesh.parent.updateWorldMatrix(true,false)
      this.sourceGuard.copy(reference.mesh.parent.matrixWorld).multiply(reference.matrix).multiply(guard.pivot)
      this.carryDelta.copy(guard.current).multiply(this.sourceGuard.invert())
      for(const p of group.parts){
        const m=p.mesh;m.parent.updateWorldMatrix(true,false)
        this.sourceWorld.copy(m.parent.matrixWorld).multiply(p.matrix)
        this.carry.copy(this.carryDelta).multiply(this.sourceWorld)
        this.target.copy(this.front.anchorWorld).multiply(p.target)
        if(fit===0)this.world.copy(this.carry)
        else if(shrink===1)this.world.copy(this.target)
        else{
          this.fromCentered.copy(this.carry).multiply(p.pivot);this.toCentered.copy(this.target).multiply(p.pivot)
          this.fromCentered.decompose(this.a,this.qa,this.sa);this.toCentered.decompose(this.b,this.qb,this.sb)
          this.qa.normalize();this.qb.normalize()
          // Travel first with the original dimensions; only the end of
          // the cuff's motion absorbs the authored reduction.
          // Retain the exact affine residual (including baked shear).
          this.targetRigid.compose(this.b,this.qb,this.sa)
          this.residual.copy(this.targetRigid).invert().multiply(this.toCentered)
          this.residualBlend.identity()
          for(let i=0;i<16;i++)this.residualBlend.elements[i]+=(this.residual.elements[i]-this.residualBlend.elements[i])*shrink
          this.current.compose(this.a.lerp(this.b,fit),this.qa.slerp(this.qb,fit),this.sa)
          this.world.copy(this.current).multiply(this.residualBlend).multiply(p.inversePivot)
        }
        m.matrix.copy(this.parentInverse.copy(m.parent.matrixWorld).invert()).multiply(this.world)
        m.matrixAutoUpdate=false;m.visible=p.visible;m.matrixWorldNeedsUpdate=true;m.updateWorldMatrix(false,false)
      }
    }
    this.applied=true
  }
  dispose(){this.restore()}
}
