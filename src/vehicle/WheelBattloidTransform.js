import {Box3,Matrix3,Matrix4,Quaternion,Vector3} from 'three'
import {frontGeometryKey} from './frontTransformMath.js'
import {wheelArmorState} from './wheelArmorState.js'
import {sampleWheelMotion,SocketWheelMotion,wheelStartProgress,wheelIntermediateProgress,wheelBehindProgress,wheelEndProgress,wheelTransformBlend} from './wheelMotion.js'

export {wheelTransformBlend}

// Independent presentation layer: no driving hierarchy or geometry changes.
export class WheelBattloidTransform{
  constructor(rig,front,rear,data){
    Object.assign(this,{rig,front,rear,data,applied:false})
    if(data.version!==2||data.wheels?.length!==2)throw Error('Faltan las cuatro poses exportadas de las ruedas')
    const byKey=new Map(rig.surfaces.map(m=>[frontGeometryKey(m),m]))
    this.parts=[]
    this.groups=data.wheels.map(record=>{
      const index=record.wheel==='front'?0:1,hydraulic=rig.hydraulics[index]
      const carrier=rear.data.wheelCarriers.find(c=>c.wheel===record.wheel)
      const housing=rear.parts.find(p=>p.record.ids.includes(carrier.housingId)),seat=rig.hydraulicSeats[index]
      if(!housing||!hydraulic||seat?.housing!==housing.source.mesh||seat.base.distanceTo(hydraulic.base)>1e-8)throw Error(`No se identifica la base circular de ${record.wheel}`)
      const parts=record.parts.map(r=>{
        const mesh=byKey.get(r.key);if(!mesh)throw Error(`Falta componente persistente ${r.id}`)
        mesh.updateMatrix()
        const part={record:r,mesh,position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate,visible:mesh.visible}
        this.parts.push(part);return part
      })
      const box=new Box3()
      for(const p of parts){p.mesh.geometry.computeBoundingBox();box.union(p.mesh.geometry.boundingBox)}
      housing.mesh.updateWorldMatrix(true,false);rig.body.updateWorldMatrix(true,false)
      const baseInHousing=housing.mesh.worldToLocal(rig.body.localToWorld(hydraulic.base.clone()))
      const targets=Object.fromEntries(Object.entries(record.poses).map(([key,p])=>[key,front.referenceBind.clone().invert().multiply(new Matrix4().fromArray(p.targetInModel))]))
      return{record,parts,hydraulic,housing,baseInHousing,solver:new SocketWheelMotion(),axle:index?rig.rearAxle:rig.frontAxle,center:box.getCenter(new Vector3()),target:targets.final,targets,keys:Array.from({length:index?3:4},()=>new Matrix4()),alignmentModel:new Vector3(),alignmentWorld:new Vector3(),sourceWorld:new Matrix4(),world:new Matrix4(),frame:new Matrix4(),sourceFrame:new Matrix4(),sourceLocal:new Matrix4(),keyBase:new Vector3(),sourceEnd:new Vector3(),sourceMount:new Vector3(),base:new Vector3(),end:new Vector3(),mount:new Vector3()}
    })
    this.parentInverse=new Matrix4();this.sourceInverse=new Matrix4();this.to=new Matrix4();this.keyFrame=new Matrix4()
    this.sourceHousing=new Matrix4();this.targetHousing=new Matrix4();this.mixedHousing=new Matrix4();this.sourceCentered=new Matrix4();this.targetCentered=new Matrix4()
    this.a=new Vector3();this.b=new Vector3();this.qa=new Quaternion();this.qb=new Quaternion();this.sa=new Vector3();this.sb=new Vector3()
    this.modelQ=new Quaternion();this.unit=new Vector3(1,1,1);this.offset=new Vector3();this.radial=new Vector3()
    this.modelLinear=new Matrix3();this.frameInverse=new Matrix4();this.behindQ=new Quaternion();this.behindScale=new Vector3();this.behindPosition=new Vector3();this.intermediateCenter=new Vector3();this.behindCenter=new Vector3();this.yAxis=new Vector3(0,1,0)
    const frontWheel=this.groups.find(g=>g.record.wheel==='front'),rearWheel=this.groups.find(g=>g.record.wheel==='rear')
    const finalCenter=g=>g.center.clone().applyMatrix4(new Matrix4().fromArray(g.record.poses.final.targetInModel))
    frontWheel.alignmentModel.y=finalCenter(rearWheel).y-finalCenter(frontWheel).y
  }
  restore(){
    if(!this.applied)return
    for(const p of this.parts){const m=p.mesh;m.position.copy(p.position);m.quaternion.copy(p.quaternion);m.scale.copy(p.scale);m.matrix.copy(p.matrix);m.matrixAutoUpdate=p.auto;m.visible=p.visible;m.matrixWorldNeedsUpdate=true}
    for(const g of this.groups)g.hydraulic.update()
    this.applied=false
  }
  // Read the unchanged rear wheel-base path at a key time. Do not seek or
  // modify the front/rear effects to find a hydraulic pivot.
  baseAt(g,progress,out){
    const p=g.housing
    p.source.mesh.parent.updateWorldMatrix(true,false)
    this.sourceHousing.copy(p.source.mesh.parent.matrixWorld).multiply(p.source.matrix)
    this.targetHousing.copy(this.front.anchorWorld).multiply(p.target)
    this.sourceCentered.copy(this.sourceHousing).multiply(p.pivot);this.targetCentered.copy(this.targetHousing).multiply(p.pivot)
    this.sourceCentered.decompose(this.a,this.qa,this.sa);this.targetCentered.decompose(this.b,this.qb,this.sb)
    const t=wheelTransformBlend(progress)
    this.mixedHousing.compose(this.a.lerp(this.b,t),this.qa.slerp(this.qb,t),this.sa.lerp(this.sb,t)).multiply(p.inversePivot)
    return out.copy(g.baseInHousing).applyMatrix4(this.mixedHousing)
  }
  apply(progress,settings=wheelArmorState.defaults){
    if(progress<=wheelStartProgress){this.restore();return}
    this.front.model.getWorldQuaternion(this.modelQ)
    this.modelLinear.setFromMatrix4(this.front.model.matrixWorld)
    for(const g of this.groups){
      const h=g.hydraulic
      // Ignore road spin when folding; preserve the existing axle frame.
      g.axle.updateWorldMatrix(true,false)
      g.sourceWorld.copy(g.axle.matrixWorld).multiply(g.parts[0].matrix)
      this.sourceInverse.copy(g.sourceWorld).invert()
      h.endJoint.getWorldPosition(g.sourceEnd).applyMatrix4(this.sourceInverse)
      h.mountFrame.localToWorld(g.sourceMount.copy(h.outerMount)).applyMatrix4(this.sourceInverse)
      const isFront=g.record.wheel==='front',last=isFront?3:2
      const times=[wheelStartProgress,wheelIntermediateProgress,wheelEndProgress]
      for(let i=0;i<3;i++){
        this.baseAt(g,times[i],g.keyBase)
        this.keyFrame.compose(g.keyBase,this.modelQ,this.unit)
        if(i===0){this.to.copy(g.sourceWorld);g.sourceFrame.copy(this.keyFrame)}
        else this.to.copy(this.front.anchorWorld).multiply(i===1?g.targets.intermediate:g.targets.final)
        g.keys[i===2?last:i].copy(this.keyFrame).invert().multiply(this.to)
      }
      if(isFront){
        // Derived choreography pose: same height as the authored intermediate,
        // behind the real pivot, with the wheel plane parallel to the bike.
        this.baseAt(g,wheelBehindProgress,g.keyBase)
        this.keyFrame.compose(g.keyBase,this.modelQ,this.unit)
        this.to.copy(this.front.anchorWorld).multiply(g.targets.intermediate)
        this.intermediateCenter.copy(g.center).applyMatrix4(this.to).applyMatrix4(this.frameInverse.copy(this.keyFrame).invert())
        this.a.copy(g.center).applyMatrix4(g.keys[1])
        this.behindCenter.set(0,this.intermediateCenter.y,-Math.hypot(this.a.x,this.a.z))
        g.keys[0].decompose(this.behindPosition,this.behindQ,this.behindScale)
        this.behindQ.premultiply(this.qb.setFromAxisAngle(this.yAxis,Math.PI))
        g.keys[1].decompose(this.behindPosition,this.qa,this.behindScale)
        g.keys[2].compose(this.behindPosition.set(0,0,0),this.behindQ,this.behindScale)
        this.behindPosition.copy(g.center).applyMatrix4(g.keys[2])
        g.keys[2].setPosition(this.b.copy(this.behindCenter).sub(this.behindPosition))
      }
      g.sourceLocal.copy(g.keys[0])
      g.housing.mesh.localToWorld(g.base.copy(g.baseInHousing))
      g.frame.compose(g.base,this.modelQ,this.unit)
      g.motion=sampleWheelMotion(g.record.wheel,progress)
      if(isFront){
        this.to.copy(this.front.anchorWorld).multiply(g.targets.intermediate)
        g.motion.horizontalY=this.intermediateCenter.copy(g.center).applyMatrix4(this.to).applyMatrix4(this.frameInverse.copy(g.frame).invert()).y
      }
      g.solver.apply(g.record.wheel,g.keys,g.frame,g.center,g.motion,g.world)
      g.motion.angle=g.solver.angle
      g.alignmentWorld.copy(g.alignmentModel).applyMatrix3(this.modelLinear)
      g.world.elements[12]+=g.alignmentWorld.x*g.motion.fit;g.world.elements[13]+=g.alignmentWorld.y*g.motion.fit;g.world.elements[14]+=g.alignmentWorld.z*g.motion.fit
      const tuning=settings[g.record.wheel]||wheelArmorState.defaults[g.record.wheel]
      const adjusted=!!(tuning.shortening||tuning.height||tuning.lateral||tuning.depth)
      let casingScale=1
      if(adjusted&&g.motion.fit>0){
        this.to.copy(this.front.anchorWorld).multiply(g.target)
        this.to.elements[12]+=g.alignmentWorld.x;this.to.elements[13]+=g.alignmentWorld.y;this.to.elements[14]+=g.alignmentWorld.z
        this.radial.copy(g.sourceEnd).applyMatrix4(this.to).sub(g.base)
        const radius=this.radial.length(),shorten=Math.min(tuning.shortening,Math.max(0,radius-.1))*g.motion.fit
        this.offset.set(tuning.lateral,tuning.height,tuning.depth).applyQuaternion(this.modelQ).multiplyScalar(g.motion.fit).addScaledVector(this.radial.normalize(),-shorten)
        g.world.elements[12]+=this.offset.x;g.world.elements[13]+=this.offset.y;g.world.elements[14]+=this.offset.z
        casingScale=Math.max(.1,1-shorten/Math.max(.1,radius))
      }
      for(const part of g.parts){
        const m=part.mesh;m.parent.updateWorldMatrix(true,false)
        m.matrix.copy(this.parentInverse.copy(m.parent.matrixWorld).invert()).multiply(g.world)
        m.matrixAutoUpdate=false;m.visible=part.visible;m.matrixWorldNeedsUpdate=true;m.updateWorldMatrix(false,false)
      }
      g.end.copy(g.sourceEnd).applyMatrix4(g.world);g.mount.copy(g.sourceMount).applyMatrix4(g.world)
      h.poseWorld(g.base,g.end,g.mount,adjusted?{casingScale}:undefined)
    }
    this.applied=true
  }
  dispose(){this.restore()}
}
