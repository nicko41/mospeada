import {Box3,Group,Matrix4,Mesh,Quaternion,Vector3} from 'three'
import {frontGeometryKey,rearAssemblyProgress} from './frontTransformMath.js'
import {wheelTransformBlend} from './wheelMotion.js'

const ramp=(a,b,n)=>{const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t)}

// Presentation-only rear layer. Originals keep their parents/materials/rig;
// authored split sections use disposable derived geometry during the motion.
export class RearBattloidTransform{
  constructor(rig,front,data,geometryScene){
    Object.assign(this,{rig,front,data,applied:false})
    this.root=new Group();this.root.name='Cyclone_rear_transformation';this.root.visible=false;rig.body.add(this.root)
    const byKey=new Map(rig.surfaces.map(m=>[frontGeometryKey(m),m]))
    this.originals=data.sourceKeys.map(key=>{
      const mesh=byKey.get(key);if(!mesh)throw Error(`Falta pieza trasera ${key}`)
      mesh.updateMatrix()
      return{key,mesh,hideInArmor:!!data.hiddenInArmor?.some(p=>p.key===key),position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate,visible:mesh.visible}
    })
    const originals=new Map(this.originals.map(p=>[p.key,p])),counts=new Map()
    for(const r of data.records)counts.set(r.sourceKey,(counts.get(r.sourceKey)||0)+1)
    const B=new Matrix4().fromArray(data.importMatrix),inverseB=B.clone().invert()
    const toReference=front.referenceBind.clone().invert().multiply(new Matrix4().fromArray(data.referenceTransform).invert())
    this.parts=data.records.map(record=>{
      const source=originals.get(record.sourceKey),reuse=counts.get(record.sourceKey)===1&&!record.retract
      const geometry=geometryScene.getObjectByName(record.name)?.geometry
      if(!geometry)throw Error(`Falta geometría derivada ${record.name}`)
      const ownedGeometry=reuse?null:geometry.clone()
      const mesh=reuse?source.mesh:new Mesh(ownedGeometry,rig.surfaceMaterials?.get(source.mesh)||source.mesh.material)
      if(!reuse){mesh.name=record.name;mesh.userData={...source.mesh.userData,rearArmorId:record.ids[0]};mesh.castShadow=mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;this.root.add(mesh)}
      geometry.computeBoundingBox();const pin=geometry.boundingBox.getCenter(new Vector3())
      // The grille's lower lip meets the top of the lower plate in Motorcycle.
      if(record.chestPart==='grille')pin.y=geometry.boundingBox.min.y
      const pivot=new Matrix4().makeTranslation(...pin.toArray())
      return{record,source,mesh,reuse,ownedGeometry,center:geometry.boundingBox.getCenter(new Vector3()),pivot,inversePivot:pivot.clone().invert(),target:toReference.clone().multiply(new Matrix4().fromArray(record.delta)).multiply(inverseB)}
    })
    this.boostShells=this.parts.filter(p=>!p.record.retract&&p.record.sourceKey.split('|')[1]==='rear1')
    // Pieces with the same authored displacement form ONE rigid assembly.
    // Interpolating each center and then replacing its orientation separated
    // adjacent exhaust collars, silencers and body halves during the motion.
    this.rearGroups=[]
    for(const p of this.parts.filter(p=>p.record.role==='rear'&&!p.record.retract)){
      let group=this.rearGroups.find(g=>g.delta.every((v,i)=>Math.abs(v-p.record.delta[i])<1e-7))
      if(!group){group={delta:p.record.delta,members:[],sourceMap:new Matrix4(),targetMap:new Matrix4(),current:new Matrix4()};this.rearGroups.push(group)}
      group.members.push(p);p.rearGroup=group
    }
    for(const g of this.rearGroups){
      const shells=g.members.filter(p=>p.record.sourceKey.split('|')[1]==='rear1')
      const bounds=new Box3()
      for(const p of shells.length?shells:g.members){p.mesh.geometry.computeBoundingBox();bounds.union(p.mesh.geometry.boundingBox)}
      g.pivot=new Matrix4().makeTranslation(...bounds.getCenter(new Vector3()).toArray())
      g.reference=[...(shells.length?shells:g.members)].sort((a,b)=>a.record.sourceId.localeCompare(b.record.sourceId))[0]
    }
    for(const p of this.parts){
      p.currentBody=new Matrix4()
      if(!p.record.retract)continue
      const mates=this.parts.filter(m=>!m.record.retract&&m.record.sourceId===p.record.sourceId)
      if(mates.length!==1)throw Error(`No se identifica la pieza contigua al corte ${p.record.ids[0]}`)
      p.mate=mates[0]
      const cut=p.mesh.geometry.boundingBox.clone().applyMatrix4(inverseB),keep=p.mate.mesh.geometry.boundingBox.clone().applyMatrix4(inverseB)
      if(Math.abs(cut.max.x-keep.min.x)>.005)throw Error(`No se identifica la unión frontal del corte ${p.record.ids[0]}`)
      p.cutSeam=cut.max.x;p.cutBounds=cut.clone()
      // Telescope toward the measured seam. Translating the full cut length
      // pushed long fragments past the shorter surviving shell and exposed
      // them behind the bike before abruptly hiding them.
      p.compactFrom=B.clone().multiply(new Matrix4().makeTranslation(p.cutSeam,0,0))
      p.compactTo=new Matrix4().makeTranslation(-p.cutSeam,0,0).multiply(inverseB)
    }
    this.presentationOrder=[...this.parts.filter(p=>!p.record.retract),...this.parts.filter(p=>p.record.retract)]
    this.chestPlate=this.parts.find(p=>p.record.chestPart==='plate')
    for(const p of this.originals)p.chest=this.parts.some(part=>part.source===p&&part.record.role==='chest')
    this.chestSource=new Matrix4();this.chestTarget=new Matrix4();this.chestCurrent=new Matrix4();this.chestSourceInverse=new Matrix4();this.chestTargetInverse=new Matrix4()
    this.bodyInverse=new Matrix4();this.restBody=new Matrix4();this.targetBody=new Matrix4();this.from=new Matrix4();this.to=new Matrix4();this.mixed=new Matrix4();this.parentInverse=new Matrix4();this.tankInverse=new Matrix4();this.finalTankInverse=new Matrix4();this.retract=new Matrix4()
    this.a=new Vector3();this.b=new Vector3();this.qa=new Quaternion();this.qb=new Quaternion();this.sa=new Vector3();this.sb=new Vector3()
    this.folded=new Matrix4();this.orientation=new Quaternion();this.targetOrientation=new Quaternion()
    this.local=new Matrix4();this.sourceGroupInverse=new Matrix4();this.targetGroupInverse=new Matrix4();this.compactScale=new Matrix4()
  }
  mix(a,b,t,out){a.decompose(this.a,this.qa,this.sa);b.decompose(this.b,this.qb,this.sb);return out.compose(this.a.lerp(this.b,t),this.qa.slerp(this.qb,t),this.sa.lerp(this.sb,t))}
  restore(){
    if(!this.applied)return
    for(const p of this.originals){p.mesh.position.copy(p.position);p.mesh.quaternion.copy(p.quaternion);p.mesh.scale.copy(p.scale);p.mesh.matrix.copy(p.matrix);p.mesh.matrixAutoUpdate=p.auto;p.mesh.visible=p.visible;p.mesh.matrixWorldNeedsUpdate=true}
    this.root.visible=false;this.applied=false;this.rearActive=false
  }
  updateRearGroups(tank,configure,t){
    for(const g of this.rearGroups){
      const p=g.reference
      p.source.mesh.parent.updateWorldMatrix(true,false)
      g.sourceMap.copy(this.bodyInverse).multiply(p.source.mesh.parent.matrixWorld).multiply(p.source.matrix)
      g.targetMap.copy(this.bodyInverse).multiply(this.front.anchorWorld).multiply(p.target)
      this.from.copy(g.sourceMap).multiply(g.pivot).premultiply(this.tankInverse)
      this.to.copy(g.targetMap).multiply(g.pivot).premultiply(this.finalTankInverse)
      this.mix(this.from,this.to,configure,this.mixed);this.mixed.premultiply(tank.current)
      this.b.setFromMatrixPosition(this.mixed)
      // Keep the existing backpack-center path and orientation schedule,
      // but apply it once to the complete assembly rather than each piece.
      this.folded.copy(tank.folded).multiply(this.tankInverse).multiply(g.sourceMap)
      this.folded.decompose(this.a,this.orientation,this.sa)
      g.targetMap.decompose(this.a,this.targetOrientation,this.sb)
      this.orientation.slerp(this.targetOrientation,ramp(.28,.64,t))
      this.mixed.decompose(this.a,this.qa,this.sa)
      g.current.compose(this.a.set(0,0,0),this.orientation,this.sa)
      this.a.setFromMatrixPosition(g.pivot).applyMatrix4(g.current)
      g.current.setPosition(this.b.sub(this.a))
      if(t===1)g.current.copy(g.targetMap)
    }
  }
  apply(progress){
    const tank=this.front.motionGroups.find(g=>g.role==='tank')
    if(progress<=0){this.restore();return}
    const main=Math.min(1,progress),t=rearAssemblyProgress(main),configure=ramp(.28,1,t),retract=ramp(.28,.58,t)
    const rearActive=main>.22&&!!tank?.tankStage?.fold,chest=ramp(0,.22,main)
    this.rearActive=rearActive
    this.rig.body.updateWorldMatrix(true,false);this.bodyInverse.copy(this.rig.body.matrixWorld).invert()
    this.tankInverse.copy(tank.sourceBody).invert();this.finalTankInverse.copy(tank.targetBody).invert()
    if(rearActive)this.updateRearGroups(tank,configure,t)
    this.root.visible=true
    for(const p of this.originals)if(p.chest||rearActive)p.mesh.visible=false
    if(this.chestPlate){
      const p=this.chestPlate
      p.source.mesh.parent.updateWorldMatrix(true,false)
      this.chestSource.copy(this.bodyInverse).multiply(p.source.mesh.parent.matrixWorld).multiply(p.source.matrix)
      this.chestTarget.copy(this.bodyInverse).multiply(this.front.anchorWorld).multiply(p.target)
      this.from.copy(this.chestSource).multiply(p.pivot);this.to.copy(this.chestTarget).multiply(p.pivot)
      this.mix(this.from,this.to,chest,this.chestCurrent);this.chestCurrent.multiply(p.inversePivot)
      this.chestSourceInverse.copy(this.chestSource).invert();this.chestTargetInverse.copy(this.chestTarget).invert()
    }
    for(const p of this.presentationOrder){
      const {source,mesh,record}=p
      if(record.role!=='chest'&&!rearActive){mesh.visible=p.reuse?source.visible:false;continue}
      source.mesh.parent.updateWorldMatrix(true,false)
      this.restBody.copy(this.bodyInverse).multiply(source.mesh.parent.matrixWorld).multiply(source.matrix)
      this.targetBody.copy(this.bodyInverse).multiply(this.front.anchorWorld).multiply(p.target)
      this.from.copy(this.restBody).multiply(p.pivot)
      this.to.copy(this.targetBody).multiply(p.pivot)
      if(record.role==='chest'){
        if(record.chestPart==='plate')this.mixed.copy(this.chestCurrent)
        else{
          this.from.premultiply(this.chestSourceInverse);this.to.premultiply(this.chestTargetInverse)
          this.mix(this.from,this.to,chest,this.mixed)
          this.mixed.premultiply(this.chestCurrent).multiply(p.inversePivot)
        }
        if(chest===1)this.mixed.copy(this.targetBody)
      }else if(record.role==='wheel-base'){
        this.mix(this.from,this.to,wheelTransformBlend(main),this.mixed);this.mixed.multiply(p.inversePivot)
      }else if(record.role==='detail'){
        this.mix(this.from,this.to,ramp(.22,1,t),this.mixed);this.mixed.multiply(p.inversePivot)
      }else if(record.role==='leg'){
        this.mix(this.from,this.to,ramp(.22,.72,t),this.mixed);this.mixed.multiply(p.inversePivot)
      }else if(record.retract){
        this.compactScale.makeScale(Math.max(.0001,1-retract),1,1)
        this.retract.copy(p.compactFrom).multiply(this.compactScale).multiply(p.compactTo)
        this.mixed.copy(p.mate.currentBody).multiply(this.retract)
      }else{
        const g=p.rearGroup
        this.from.copy(this.sourceGroupInverse.copy(g.sourceMap).invert()).multiply(this.restBody)
        this.to.copy(this.targetGroupInverse.copy(g.targetMap).invert()).multiply(this.targetBody)
        this.mix(this.from,this.to,configure,this.local)
        this.mixed.copy(g.current).multiply(this.local)
      }
      if((record.role==='wheel-base'?main:t)===1&&!record.retract)this.mixed.copy(this.targetBody)
      p.currentBody.copy(this.mixed)
      mesh.visible=source.visible&&(!record.retract||retract<.995)
      mesh.parent.updateWorldMatrix(true,false)
      this.parentInverse.copy(mesh.parent.matrixWorld).invert()
      mesh.matrix.copy(this.parentInverse).multiply(this.rig.body.matrixWorld).multiply(this.mixed)
      mesh.matrixAutoUpdate=false;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(false,false)
    }
    this.applied=true
  }
  boostSocket(position,direction){
    const shells=this.boostShells
    if(!this.applied||!shells.length)return false
    position.set(0,0,0)
    for(const p of shells){this.a.copy(p.center).applyMatrix4(p.mesh.matrixWorld);position.add(this.a)}
    position.multiplyScalar(1/shells.length)
    direction.set(0,0,-1).transformDirection(this.front.model.matrixWorld)
    position.addScaledVector(direction,.12)
    return true
  }
  dispose(){this.restore();for(const p of this.parts)p.ownedGeometry?.dispose();this.root.removeFromParent()}
}
