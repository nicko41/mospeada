import {Euler,Matrix4,Quaternion,Vector3} from 'three'
import {readKneeSocket,kneeSocketPoint} from './scottKneeSockets.js'

export const caballerSettings={
  Left:{length:0,longitudinalScale:1,pitch:0,yaw:0,roll:0},
  Right:{length:0,longitudinalScale:1,pitch:0,yaw:0,roll:0},
}
const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}

// Presentation-only attachments, evaluated AFTER Scott's final skeleton.
// No reparenting, geometry edits, JSON edits or changes to mechanical clocks.
export class ArmorArticulation{
  constructor(runtime){
    this.runtime=runtime;this.body=runtime.vehicleRig.body;this.instance=runtime.scottInstance
    this.hips=this.instance.bones.get('mixamorigHips')
    this.guards=runtime.guardTransformation.groups
    this.legs=runtime.rearTransformation.parts.filter(p=>p.record.role==='leg')
    this.spine=this.instance.bones.get('mixamorigSpine2')
    const front=runtime.frontTransformation,rear=runtime.rearTransformation,wheels=runtime.wheelTransformation
    // Keep the chest and the complete backpack mechanically coherent. Wheel
    // supports belong to that backpack; no wheel paths/poses are recomputed.
    this.torso=[...new Set([
      ...front.parts.filter(p=>p.target).map(p=>p.mesh),
      ...rear.parts.filter(p=>p.record.role!=='leg').map(p=>p.mesh),
      ...(wheels?.parts||[]).map(p=>p.mesh),
      ...(wheels?.groups||[]).flatMap(g=>[g.hydraulic.root,g.hydraulic.endPin]),
    ])]
    if(!this.hips||this.legs.length!==2||this.guards.length!==2)throw Error('Armor requiere pelvis, dos caballer y dos cuffs identificados')
    this.records=[...this.legs.map(p=>p.mesh),...this.guards.flatMap(g=>g.parts.map(p=>p.mesh)),...this.torso].map(mesh=>({mesh,canonical:new Matrix4(),auto:false,residual:new Matrix4(),lastInBody:new Matrix4()}))
    this.applied=false;this.active=false;this.releaseTime=0;this.session=null
    this.inverse=new Matrix4();this.world=new Matrix4();this.candidate=new Matrix4();this.delta=new Matrix4();this.stretch=new Matrix4();this.adjust=new Matrix4();this.translation=new Matrix4();this.bodyInverse=new Matrix4()
    this.top=new Vector3();this.bottom=new Vector3();this.goal=new Vector3();this.direction=new Vector3();this.targetDirection=new Vector3();this.position=new Vector3();this.scale=new Vector3();this.quaternion=new Quaternion();this.turn=new Quaternion();this.euler=new Euler()
    this.diagnostics={legs:[],cuffs:[],release:0}
  }
  // Called AFTER the canonical Armor reference skeleton/assembly, BEFORE
  // locomotion/secondary animation. Thus the authored rest placement is exact.
  prepare(armor){
    if(!armor?.active||this.session===armor.state)return
    this.session=armor.state;this.releaseTime=0
    this.instance.model.updateWorldMatrix(true,true)
    this.torsoBindings=this.torso.map(mesh=>({mesh,inBone:this.spine.matrixWorld.clone().invert().multiply(mesh.matrixWorld)}))
    const knees=['Left','Right'].map(side=>({side,bone:this.instance.bones.get(`mixamorig${side}Leg`),thigh:this.instance.bones.get(`mixamorig${side}UpLeg`)}))
    if(knees.some(k=>!k.bone||!k.thigh))throw Error('Faltan los huesos originales de rodilla/muslo de Scott')
    // Both source meshes have the SAME name. Match spatially against the
    // actual anatomical knees, with a one-to-one assignment, never mesh order.
    const centers=this.legs.map(p=>{p.mesh.geometry.computeBoundingBox();return p.mesh.geometry.boundingBox.getCenter(new Vector3()).applyMatrix4(p.mesh.matrixWorld)})
    const cost=(i,j)=>centers[i].distanceToSquared(knees[j].bone.getWorldPosition(new Vector3()))
    const order=cost(0,0)+cost(1,1)<=cost(0,1)+cost(1,0)?[0,1]:[1,0]
    this.bindings=this.legs.map((part,i)=>{
      const {side,bone:knee,thigh}=knees[order[i]],mesh=part.mesh
      const axis=this.hips.getWorldPosition(new Vector3()).sub(knee.getWorldPosition(new Vector3())).normalize()
      const positions=mesh.geometry.attributes.position,vertices=[]
      for(let j=0;j<positions.count;j++){
        const local=new Vector3().fromBufferAttribute(positions,j),point=local.clone().applyMatrix4(mesh.matrixWorld)
        vertices.push({local,projection:point.dot(axis)})
      }
      vertices.sort((a,b)=>a.projection-b.projection)
      const span=vertices.at(-1).projection-vertices[0].projection
      const end=upper=>{
        const limit=upper?vertices.at(-1).projection-span*.025:vertices[0].projection+span*.025
        const cap=vertices.filter(v=>upper?v.projection>=limit:v.projection<=limit)
        return cap.reduce((p,v)=>p.add(v.local),new Vector3()).multiplyScalar(1/cap.length)
      }
      const top=end(true),bottom=end(false),socket=readKneeSocket(this.instance.sourceScene,side)
      const skin=this.instance.skins.find(s=>s.mesh.name===socket.meshName)?.mesh
      if(!skin)throw Error('Falta la malla original de rodilla '+side)
      return{part,mesh,side,knee,thigh,top,bottom,socket,skin,meshInPelvis:this.hips.matrixWorld.clone().invert().multiply(mesh.matrixWorld)}
    })
  }
  restore(){
    if(!this.applied)return
    for(const r of this.records){r.mesh.matrix.copy(r.canonical);r.mesh.matrixAutoUpdate=r.auto;r.mesh.matrixWorldNeedsUpdate=true}
    this.applied=false
  }
  write(mesh,world){
    mesh.parent.updateWorldMatrix(true,false)
    mesh.matrix.copy(this.inverse.copy(mesh.parent.matrixWorld).invert()).multiply(world)
    mesh.matrixAutoUpdate=false;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(false,false)
  }
  apply(armor,entry,dt){
    const active=!!armor?.active
    if(!active&&!this.active)return
    this.body.updateWorldMatrix(true,false);this.bodyInverse.copy(this.body.matrixWorld).invert()
    for(const r of this.records){r.mesh.updateWorldMatrix(true,false);r.canonical.copy(r.mesh.matrix);r.auto=r.mesh.matrixAutoUpdate}
    if(active){
      this.instance.model.updateWorldMatrix(true,true)
      this.diagnostics.legs=[];this.diagnostics.cuffs=[]
      for(const b of this.torsoBindings)this.write(b.mesh,this.world.copy(this.spine.matrixWorld).multiply(b.inBone))
      this.diagnostics.torso={bone:this.spine.name,parts:this.torso.length,matrix:this.spine.matrixWorld.toArray()}
      for(const g of this.guards){
        // The original 3D LAB offset is already expressed in THIS forearm.
        this.world.copy(g.bone.matrixWorld).multiply(g.targetInBone).multiply(g.inversePivot)
        for(const p of g.parts)this.write(p.mesh,this.world)
        this.diagnostics.cuffs.push({bone:g.bone.name,error:0})
      }
      for(const b of this.bindings){
        const settings=caballerSettings[b.side]
        this.candidate.copy(this.hips.matrixWorld).multiply(b.meshInPelvis)
        this.top.copy(b.top).applyMatrix4(this.candidate);this.bottom.copy(b.bottom).applyMatrix4(this.candidate)
        kneeSocketPoint(b.skin,b.socket,this.goal)
        this.direction.copy(this.bottom).sub(this.top);const length=this.direction.length();this.direction.normalize()
        this.targetDirection.copy(this.goal).sub(this.top);const targetLength=this.targetDirection.length();this.targetDirection.normalize()
        const stretch=Math.max(.05,(targetLength+settings.length)/length*settings.longitudinalScale)
        // One affine longitudinal adjustment about a rigid pivot, never a
        // vertex/skin deformation. Cross-section and original buffers stay intact.
        const u=this.direction,k=stretch-1
        this.stretch.set(1+k*u.x*u.x,k*u.x*u.y,k*u.x*u.z,0,k*u.y*u.x,1+k*u.y*u.y,k*u.y*u.z,0,k*u.z*u.x,k*u.z*u.y,1+k*u.z*u.z,0,0,0,0,1)
        this.turn.setFromUnitVectors(this.direction,this.targetDirection)
        this.adjust.makeRotationFromQuaternion(this.turn)
        this.delta.makeTranslation(this.top.x,this.top.y,this.top.z).multiply(this.adjust).multiply(this.stretch).multiply(this.translation.makeTranslation(-this.top.x,-this.top.y,-this.top.z))
        this.world.copy(this.delta).multiply(this.candidate)
        if(settings.pitch||settings.yaw||settings.roll){
          this.adjust.makeRotationFromEuler(this.euler.set(settings.pitch*Math.PI/180,settings.yaw*Math.PI/180,settings.roll*Math.PI/180))
          this.world.multiply(this.translation.makeTranslation(...b.top.toArray())).multiply(this.adjust).multiply(this.translation.makeTranslation(...b.top.clone().negate().toArray()))
        }
        this.write(b.mesh,this.world)
        const actual=b.bottom.clone().applyMatrix4(b.mesh.matrixWorld)
        this.diagnostics.legs.push({side:b.side,id:b.part.record.sourceId,hip:this.top.toArray(),knee:this.goal.toArray(),socket:b.socket.triangle,error:actual.distanceTo(this.goal),lengthScale:stretch})
      }
      // Cache only these pieces' residual from their canonical assembly pose.
      for(const r of this.records){
        this.candidate.copy(r.mesh.parent.matrixWorld).multiply(r.canonical)
        r.lastInBody.copy(this.bodyInverse).multiply(r.mesh.matrixWorld)
        r.residual.copy(r.lastInBody).multiply(this.candidate.invert()).multiply(this.body.matrixWorld)
      }
      this.active=true;this.releaseTime=0;this.releasing=false;this.diagnostics.release=0
    }else if(entry?.returnFlight){
      // Hand off continuously during the EXISTING boost, before any original
      // mechanical stage starts. Preserve the release pose in the body frame.
      const weight=1-smooth(this.releaseTime/.20)
      for(const r of this.records){
        if(!this.releasing){
          this.candidate.copy(this.bodyInverse).multiply(r.mesh.parent.matrixWorld).multiply(r.canonical)
          r.residual.copy(r.lastInBody).multiply(this.candidate.invert())
        }
        r.residual.decompose(this.position,this.quaternion,this.scale)
        this.position.multiplyScalar(weight)
        this.turn.copy(this.quaternion);this.quaternion.identity().slerp(this.turn,weight)
        this.scale.lerp(new Vector3(1,1,1),1-weight)
        this.delta.compose(this.position,this.quaternion,this.scale)
        if(weight===1)this.delta.copy(r.residual)
        this.world.copy(this.body.matrixWorld).multiply(this.delta).multiply(this.bodyInverse).multiply(r.mesh.parent.matrixWorld).multiply(r.canonical)
        this.write(r.mesh,this.world)
      }
      this.releasing=true;this.diagnostics.release=1-weight;this.releaseTime+=dt
      if(weight===0)this.active=false
    }else this.active=false
    this.applied=true
  }
  dispose(){this.restore();this.active=false;this.session=null}
}
