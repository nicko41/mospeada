import { Matrix4, Quaternion, Vector3 } from 'three'
import { frontGeometryKey, sampleFrontSequence, rearAssemblyProgress } from './frontTransformMath.js'

// Independent presentation layer. No geometry, bones, physics or rig parents
// change; restoring this layer returns every original local transform exactly.
export class FrontBattloidTransform {
  constructor(rig, scott, data) {
    this.rig = rig; this.data = data; this.applied = false
    this.model = scott.model
    this.hips=scott.bones.get('mixamorigHips')
    if (!this.model) throw Error('Falta el marco original del modelo de Scott')
    this.anchor = scott.bones.get(data.anchorBone)
    if (!this.anchor) throw Error(`Falta el hueso existente ${data.anchorBone}`)
    const meshes = new Map()
    for (const mesh of rig.surfaces.filter(m => m.userData.assembly === data.assembly)) {
      const key = frontGeometryKey(mesh)
      if (meshes.has(key)) throw Error(`Identificador de superficie ambiguo: ${key}`)
      meshes.set(key, mesh)
    }
    this.referenceBind = new Matrix4().fromArray(data.referenceBind)
    this.anchorWorld = new Matrix4()
    this.chestAnchorWorld=new Matrix4();this.chestAnchorInBody=new Matrix4()
    this.chestQ=new Quaternion();this.chestModelQ=new Quaternion();this.chestScale=new Vector3();this.chestPosition=new Vector3()
    this.anchorPosition = new Vector3()
    const editorToChest = this.referenceBind.clone().invert().multiply(new Matrix4().fromArray(data.referenceTransform).invert())
    const bakedToEditor = new Matrix4().fromArray(data.importMatrix).multiply(new Matrix4().fromArray(data.originalAssemblyMatrix)).invert()
    this.parts = data.records.map(record => {
      const mesh = meshes.get(record.key)
      if (!mesh) throw Error(`Falta superficie del front: ${record.key}`)
      mesh.updateMatrix()
      return { record, mesh, position:mesh.position.clone(), quaternion:mesh.quaternion.clone(), scale:mesh.scale.clone(), matrix:mesh.matrix.clone(), auto:mesh.matrixAutoUpdate, visible:mesh.visible,
        target:record.delta ? editorToChest.clone().multiply(new Matrix4().fromArray(record.delta)).multiply(bakedToEditor) : null }
    })
    this.bodyInverse = new Matrix4(); this.anchorInBody = new Matrix4(); this.from = new Matrix4(); this.to = new Matrix4(); this.mixed = new Matrix4(); this.parentInverse = new Matrix4()
    this.fromP = new Vector3(); this.fromQ = new Quaternion(); this.fromS = new Vector3(); this.toP = new Vector3(); this.toQ = new Quaternion(); this.toS = new Vector3()
    this.local = new Matrix4()
    const baked=new Matrix4().fromArray(data.importMatrix).multiply(new Matrix4().fromArray(data.originalAssemblyMatrix))
    const pieces=new Map(data.pieces.map(p=>[p.id,p]))
    const rigidFrame=values=>{
      const p=new Vector3(),q=new Quaternion(),s=new Vector3()
      new Matrix4().fromArray(values).decompose(p,q,s)
      // Editing-frame scale is already baked into mesh vertices. Pivot axes
      // are orthonormal; applying that scale again would shear the members.
      return new Matrix4().compose(p,q,new Vector3(1,1,1))
    }
    this.motionGroups=(data.motionGroups||[]).map(group=>{
      const source=rigidFrame(group.sourceFrame),target=rigidFrame(group.targetFrame)
      return{id:group.id,name:group.name,role:group.role,parentGroupId:group.parentGroupId,foldAngle:group.foldAngle,length:group.length,center:new Vector3(...(group.center||[0,0,0])).applyMatrix4(source.clone().invert()),tip:new Vector3(...(group.tip||[0,0,0])).applyMatrix4(source.clone().invert()),source,target,separationOffset:new Vector3(...(group.separationOffset||[0,0,0])),sourceBaked:baked.clone().multiply(source),targetChest:editorToChest.clone().multiply(target),sourceBody:new Matrix4(),targetBody:new Matrix4(),current:new Matrix4(),folded:new Matrix4(),parts:[]}
    })
    for(const group of this.motionGroups){
      if(!group.parentGroupId)continue
      group.parent=this.motionGroups.find(g=>g.id===group.parentGroupId)
      if(!group.parent)throw Error(`Falta la base del faro ${group.id}`)
      group.localFrom=group.parent.source.clone().invert().multiply(group.source)
      group.localTo=group.parent.target.clone().invert().multiply(group.target)
    }
    this.separationOffset=new Vector3()
    this.foldRotation=new Matrix4()
    this.tankCenter=new Vector3();this.tankTargetCenter=new Vector3();this.tankClearCenter=new Vector3();this.tankRear=new Vector3();this.tankTip=new Vector3();this.tankHips=new Vector3();this.tankOffset=new Vector3()
    for(const part of this.parts){
      if(!part.target||!part.record.motionGroupId)continue
      const group=this.motionGroups.find(g=>g.id===part.record.motionGroupId),piece=pieces.get(part.record.pieceIds[0])
      if(!group||!piece?.sourcePivot)throw Error(`Falta pivote del módulo: ${part.record.key}`)
      const pivot=new Matrix4().makeTranslation(...piece.sourcePivot)
      part.motionGroup=group
      part.localFrom=group.source.clone().invert().multiply(pivot)
      part.localTo=group.target.clone().invert().multiply(new Matrix4().fromArray(part.record.delta)).multiply(pivot)
      part.bindGeometry=pivot.clone().invert().multiply(bakedToEditor)
      group.parts.push(part)
    }
  }
  mix(from,to,t,out){
    from.decompose(this.fromP,this.fromQ,this.fromS);to.decompose(this.toP,this.toQ,this.toS)
    return out.compose(this.fromP.lerp(this.toP,t),this.fromQ.slerp(this.toQ,t),this.fromS.lerp(this.toS,t))
  }
  restore() {
    if (!this.applied) return
    for (const p of this.parts) {
      p.mesh.position.copy(p.position); p.mesh.quaternion.copy(p.quaternion); p.mesh.scale.copy(p.scale)
      p.mesh.matrix.copy(p.matrix); p.mesh.matrixAutoUpdate=p.auto; p.mesh.visible=p.visible; p.mesh.matrixWorldNeedsUpdate=true
    }
    this.applied=false
  }
  apply(progress, choreography=null) {
    if (progress <= 0 && !choreography?.turn && !choreography?.separate && !choreography?.covers && !choreography?.fold && !choreography?.chestLift) { this.restore(); return }
    const t = Math.min(1, progress), smooth = t*t*(3-2*t)
    const mechanical=choreography?.mechanicalProgress??t
    const sequence=sampleFrontSequence(t),turn=Math.max(sequence.chest,choreography?.turn||0)
    const chestTravel=Math.max(sequence.chest,choreography?.chestLift||0)
    this.rig.body.updateWorldMatrix(true,false); this.anchor.updateWorldMatrix(true,false)
    this.model.updateWorldMatrix(true,false)
    // Follow the posed chest's location, while keeping the editor/model axes.
    // Inheriting Spine2's riding rotation adds ~63 degrees of unwanted pitch
    // to an assembly whose final orientation is already baked in the JSON.
    this.anchorWorld.multiplyMatrices(this.model.matrixWorld,this.referenceBind)
    this.anchorWorld.setPosition(this.anchorPosition.setFromMatrixPosition(this.anchor.matrixWorld))
    this.bodyInverse.copy(this.rig.body.matrixWorld).invert()
    this.anchorInBody.multiplyMatrices(this.bodyInverse,this.anchorWorld)
    // Only the rising front follows the seated -> upright torso rotation.
    // The common Armor frame stays unchanged for rear, wheels and endpoints.
    this.chestAnchorWorld.copy(this.anchorWorld)
    if(choreography?.torsoFollow){
      this.anchorWorld.decompose(this.chestPosition,this.chestModelQ,this.chestScale)
      this.anchor.getWorldQuaternion(this.chestQ).normalize()
      this.chestModelQ.slerp(this.chestQ,choreography.torsoFollow)
      this.chestAnchorWorld.compose(this.chestPosition,this.chestModelQ,this.chestScale)
    }
    this.chestAnchorInBody.multiplyMatrices(this.bodyInverse,this.chestAnchorWorld)
    for(const group of this.motionGroups){
      const reference=group.parts[0]
      if(!reference)continue
      reference.mesh.parent.updateWorldMatrix(true,false)
      group.sourceBody.copy(this.bodyInverse).multiply(reference.mesh.parent.matrixWorld).multiply(reference.matrix).multiply(group.sourceBaked)
      group.targetBody.multiplyMatrices(group.role==='carrier'?this.chestAnchorInBody:this.anchorInBody,group.targetChest)
      this.mix(group.sourceBody,group.targetBody,smooth,group.current)
      group.localBlend=smooth
      if(group.parent){
        // A real hierarchy in the animation math: the pin always travels
        // with CHEST, while the headlight turns locally around that pin.
        group.localFrom.decompose(this.fromP,this.fromQ,this.fromS)
        group.localTo.decompose(this.toP,this.toQ,this.toS)
        const cover=group.role==='cover'
        const travel=cover?sequence.coverFit:chestTravel
        const rotation=cover?sequence.covers:turn
        this.local.compose(this.fromP.lerp(this.toP,travel),this.fromQ.slerp(this.toQ,rotation),this.fromS.lerp(this.toS,travel))
        group.current.multiplyMatrices(group.parent.current,this.local)
        group.localBlend=travel
      }else if(group.role==='tank'){
        const {fold,slide,tankTurn:rotation,tankFit:fit}=sampleFrontSequence(rearAssemblyProgress(mechanical))
        this.foldRotation.makeRotationZ(group.foldAngle*fold)
        group.folded.multiplyMatrices(group.sourceBody,this.foldRotation)
        group.folded.decompose(this.fromP,this.fromQ,this.fromS)
        group.targetBody.decompose(this.toP,this.toQ,this.toS)
        this.tankCenter.copy(group.center).applyMatrix4(group.folded)
        this.tankTargetCenter.copy(group.center).applyMatrix4(group.targetBody)
        this.tankRear.set(1,0,0).transformDirection(group.sourceBody)
        this.tankTip.copy(group.tip).applyMatrix4(group.folded)
        this.hips.getWorldPosition(this.tankHips).applyMatrix4(this.bodyInverse)
        const clearance=group.length*this.fromS.x*.15
        const distance=Math.max(0,this.tankOffset.copy(this.tankHips).sub(this.tankTip).dot(this.tankRear)+clearance)
        this.tankClearCenter.copy(this.tankCenter).addScaledVector(this.tankRear,distance)
        // Three distinct gestures: shallow dip, straight backward slide with
        // held orientation, then an in-place turn behind the pelvis. Rotate
        // around the tank's center, so its nose cannot orbit below Scott.
        this.tankCenter.lerp(this.tankClearCenter,slide).lerp(this.tankTargetCenter,fit)
        group.current.compose(this.fromP.set(0,0,0),this.fromQ.slerp(this.toQ,rotation),this.fromS.lerp(this.toS,fit))
        this.tankOffset.copy(group.center).applyMatrix4(group.current)
        group.current.setPosition(this.tankOffset.multiplyScalar(-1).add(this.tankCenter))
        group.localBlend=fit
        group.tankStage={fold,slide,rotation,fit,clearance,distance}
      }else if(group.role==='carrier'){
        this.mix(group.sourceBody,group.targetBody,chestTravel,group.current)
        group.localBlend=chestTravel
        if(choreography){
          group.sourceBody.decompose(this.fromP,this.fromQ,this.fromS)
          this.separationOffset.copy(group.separationOffset).multiply(this.fromS).applyQuaternion(this.fromQ).multiplyScalar((choreography.separate||0)*(1-chestTravel))
          group.current.elements[12]+=this.separationOffset.x
          group.current.elements[13]+=this.separationOffset.y
          group.current.elements[14]+=this.separationOffset.z
        }
      }
    }
    for (const p of this.parts) {
      const mesh=p.mesh
      mesh.visible=p.visible && p.record.visible
      if (!p.target) continue // Explicitly absent in the authored Battloid file.
      mesh.parent.updateWorldMatrix(true,false)
      this.from.copy(this.bodyInverse).multiply(mesh.parent.matrixWorld).multiply(p.matrix)
      this.to.multiplyMatrices(this.anchorInBody,p.target)
      if ((p.motionGroup?.role==='tank'?mechanical:t) === 1) this.mixed.copy(this.to)
      else if(p.motionGroup){
        this.mix(p.localFrom,p.localTo,p.motionGroup.localBlend,this.local)
        this.mixed.copy(p.motionGroup.current).multiply(this.local).multiply(p.bindGeometry)
      }
      else {
        this.mix(this.from,this.to,smooth,this.mixed)
      }
      this.parentInverse.copy(mesh.parent.matrixWorld).invert()
      mesh.matrix.copy(this.parentInverse).multiply(this.rig.body.matrixWorld).multiply(this.mixed)
      mesh.matrixAutoUpdate=false; mesh.matrixWorldNeedsUpdate=true; mesh.updateWorldMatrix(false,false)
    }
    this.applied=true
  }
}
