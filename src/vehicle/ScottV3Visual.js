import {Box3,Matrix4,Quaternion,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {ScottNativeRetarget} from './ScottNativeRetarget.js'
import {scottV3Config as config} from './scottV3Config.js'
import {v2RidingAllowed} from './ScottV2RidingPose.js'
import {armorAttachmentTarget} from './armorHandoff.js'
import {readV3KneeSocket} from './scottV3KneeSockets.js'
import {kneeSocketPoint} from './scottKneeSockets.js'
import {ScottRideSpeedResponse} from './ScottRideSpeedResponse.js'
import {introElbowDirections} from './ScottV3RidingReference.js'
import {installScottV3Palette} from './scottV3Palette.js'
import {ScottV3ShoulderUndersuit} from './ScottV3ShoulderUndersuit.js'

const point=b=>b.getWorldPosition(new Vector3())
const rigid=bone=>new Matrix4().compose(point(bone),bone.getWorldQuaternion(new Quaternion()).normalize(),new Vector3(1,1,1))

export class ScottV3Visual{
 constructor(instance,scene){
  this.instance=instance;this.model=clone(scene);this.model.name='Scott_V3_native_rig'
  this.retarget=new ScottNativeRetarget(instance.model,this.model,instance.sourceScene)
  this.skins=[];this.attachments=[];this.diagnostics={}
  this.speedResponse=new ScottRideSpeedResponse()
  this.model.traverse(mesh=>{if(mesh.isSkinnedMesh){
   const original=mesh.material.clone(),clean=original.clone();mesh.material=original
   if(config.palette.enabled)for(const material of [original,clean])installScottV3Palette(material,mesh.skeleton.bones)
   mesh.castShadow=true;mesh.frustumCulled=false;mesh.userData.prewarmVFX=true
   this.skins.push({mesh,original,clean,variant:'v3'})
  }})
  instance.model.add(this.model)
  this.shapes=Object.fromEntries(['Left','Right'].map(side=>[side,this.measure(side)]))
  this.kneeSockets=Object.fromEntries(['Left','Right'].map(side=>[side,readV3KneeSocket(this.skins[0].mesh,side,this.retarget.targetBind.get(side+'Leg').position,config.assembly['leg'+side].kneeProbeOffset)]))
  this.undersuit=new ScottV3ShoulderUndersuit(this.skins[0].mesh,config.undersuit)
 }
 measure(side){
  const mesh=this.skins[0].mesh,g=mesh.geometry,p=g.attributes.position,j=g.attributes.skinIndex,w=g.attributes.skinWeight,frames=this.retarget.targetBind,sign=side==='Left'?1:-1,wrist=frames.get(side+'Hand').position,foot=frames.get(side+'Foot').position
  const hands=[],feet=[]
  for(let i=0;i<p.count;i++){let hand=0,boot=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[j.getComponent(i,k)].name,weight=w.getComponent(i,k);if(name.endsWith(side+'Hand'))hand+=weight;if(name.endsWith(side+'Foot')||name.endsWith(side+'ToeBase'))boot+=weight}if(hand>.65)hands.push(i);if(boot>.65)feet.push(i)}
  const extent=Math.max(...hands.map(i=>sign*(p.getX(i)-wrist.x))),palmIds=hands.filter(i=>{const u=sign*(p.getX(i)-wrist.x)/extent;return u>.4&&u<.58&&Math.abs(p.getZ(i)-wrist.z)<extent*.22}),palm=new Vector3()
  palmIds.forEach(i=>palm.add(new Vector3().fromBufferAttribute(p,i)));palm.divideScalar(palmIds.length).sub(wrist)
  const min=Math.min(...feet.map(i=>p.getY(i))),soleIds=feet.filter(i=>p.getY(i)<min+.008),sole=new Vector3()
  soleIds.forEach(i=>sole.add(new Vector3().fromBufferAttribute(p,i)));sole.divideScalar(soleIds.length).sub(foot)
  if(!palmIds.length||!soleIds.length)throw Error('Scott V3: contactos nativos no identificados')
  return{palm,sole,palmIds,soleIds,handIds:hands}
 }
 restoreAttachments(){
  for(const r of this.attachments){r.mesh.matrix.copy(r.matrix);r.mesh.matrixAutoUpdate=r.auto;r.mesh.matrixWorldNeedsUpdate=true}
  this.attachments=[]
 }
 ridingFootTarget(side,runtime,body){
  const name=side+'Foot',bone=this.retarget.bones.get(name),orientation=bone.getWorldQuaternion(new Quaternion()),delta=orientation.clone().multiply(this.retarget.targetBind.get(name).rotation.clone().invert()),scale=this.model.getWorldScale(new Vector3()).x,sole=this.instance.mountedMotion?.diagnostics.feet?.[side]?.sole
  const contact=this.instance.mountedMotion?.diagnostics.feet?.[side],useApproved=contact&&contact.groundBlend<.001&&contact.toeDown<.001
  const target=useApproved?body.localToWorld(new Vector3(...config.riding.footSupports[side])):sole?body.localToWorld(new Vector3(...sole)):point(this.retarget.sourceBones.get(name))
  target.add(new Vector3(...config.riding.footOffset).applyQuaternion(body.getWorldQuaternion(new Quaternion()))).sub(this.shapes[side].sole.clone().applyQuaternion(delta).multiplyScalar(scale))
  return{target,orientation}
 }
 ridingHandCovers(runtime,body){
  if(this.coverRig===runtime.vehicleRig)return this.handCovers
  const covers={}
  for(const mesh of runtime.vehicleRig.surfaces.filter(m=>/^tapa-up/.test(m.userData.sourcePiece||m.name))){
   const box=new Box3(),positions=mesh.geometry.attributes.position
   for(let i=0;i<positions.count;i++)box.expandByPoint(body.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(positions,i))))
   const position=box.getCenter(new Vector3()),side=position.x>0?'Left':'Right'
   const grip=runtime.scottData?.measuredTargets?.grips?.[side]
   if(!grip)throw Error('Scott V3: falta la referencia del puño '+side)
   position.fromArray(grip).add(new Vector3(...config.riding.handGrips.offset))
   covers[side]={position,box}
  }
  if(!covers.Left||!covers.Right)throw Error('Scott V3: faltan las dos tapas para apoyar las manos')
  this.coverRig=runtime.vehicleRig;this.handCovers=covers;return covers
 }
 apply(runtime,delta){
  this.undersuit.setEnabled(config.undersuit.enabled)
  this.retarget.apply()
  const retarget=this.retarget,body=runtime?.scottBikeBody,bones=retarget.bones
  this.diagnostics={mappedBones:retarget.records.length,nativeBones:this.skins[0].mesh.skeleton.bones.length}
  const riding=body&&this.instance.clip==='Cyclone_RidingPose'&&v2RidingAllowed(runtime)
  if(!riding)this.speedResponse.reset()
  if(riding){
   this.diagnostics.elbowReference=config.riding.elbowReference
   const speedPose=this.speedResponse.sample(runtime.state,delta,runtime.paused),standard=!runtime.state.airborne
   this.diagnostics.speedPose=speedPose
   // Refine the existing seated pose with V3-only body offsets.
   const hips=bones.get('Hips'),sourceHip=retarget.sourceBones.get('Hips'),p=point(sourceHip),offset=new Vector3(...config.riding.pelvisOffset).applyQuaternion(body.getWorldQuaternion(new Quaternion()))
   hips.position.copy(hips.parent.worldToLocal(p.add(offset)));this.model.updateWorldMatrix(true,true)
   if(runtime.state.airborne){
    // V2's standing height can overextend V3's shorter native legs in flight.
    // Keep the relocated bike supports and lower only this mounted pelvis as
    // much as needed for a soft knee bend. Never scale bones or pull the feet.
    let drop=0
    for(const side of ['Left','Right']){
     const A=point(bones.get(side+'UpLeg')),B=point(bones.get(side+'Leg')),C=point(bones.get(side+'Foot')),l1=A.distanceTo(B),l2=B.distanceTo(C),reach=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(config.riding.airborne.minimumKneeBend)),target=body.worldToLocal(this.ridingFootTarget(side,runtime,body).target),origin=body.worldToLocal(A),horizontal=(origin.x-target.x)**2+(origin.z-target.z)**2,allowedY=target.y+Math.sqrt(Math.max(0,reach*reach-horizontal))
     drop=Math.max(drop,origin.y-allowedY)
    }
    drop=Math.min(config.riding.airborne.maxHipDrop,Math.max(0,drop))
    const seated=body.worldToLocal(point(hips));seated.y-=drop;hips.position.copy(hips.parent.worldToLocal(body.localToWorld(seated)));this.model.updateWorldMatrix(true,true)
    this.diagnostics.cycloneAirHipDrop=drop
   }
   const covers=this.ridingHandCovers(runtime,body)
   const hands=Object.fromEntries(['Left','Right'].map(side=>{
    // Pitch the wrists toward the grips rather than leave the fingers resting
    // flat on the fairing. Recompute the wrist target from that native palm.
    const name=side+'Hand',bone=bones.get(name),axis=new Vector3(1,0,0).applyQuaternion(body.getWorldQuaternion(new Quaternion())),q=new Quaternion().setFromAxisAngle(axis,config.riding.handGrips.wristPitch).multiply(bone.getWorldQuaternion(new Quaternion())),delta=q.clone().multiply(retarget.targetBind.get(name).rotation.clone().invert()),scale=this.model.getWorldScale(new Vector3()).x
    return[side,{q,target:body.localToWorld(covers[side].position.clone()).sub(this.shapes[side].palm.clone().applyQuaternion(delta).multiplyScalar(scale))}]
   }))
   // Move the upper body as one unit from the approved waist pose. Speed and
   // chassis lean drive it; hand reach cannot add torso pitch, roll or twist.
   const spine=bones.get('Spine'),base=spine.getWorldQuaternion(new Quaternion()),head=bones.get('Head'),headQ=head.getWorldQuaternion(new Quaternion()),axis=new Vector3(1,0,0).applyQuaternion(body.getWorldQuaternion(new Quaternion()))
   const restingPitch=config.riding.torsoPitch-(runtime.state.airborne?config.riding.airborne.torsoExtension:0),torsoPitch=restingPitch+speedPose.torsoLean
   const rollAxis=new Vector3(0,0,1).applyQuaternion(body.getWorldQuaternion(new Quaternion())),turn=new Quaternion().setFromAxisAngle(rollAxis,speedPose.torsoRoll)
   retarget.worldRotation(spine,new Quaternion().setFromAxisAngle(axis,restingPitch).multiply(base))
   // Relax the raised shoulder girdle instead of rounding the back to lower
   // the hands. Both clavicles rotate symmetrically; their native lengths stay.
   const shoulderAxis=new Vector3(0,0,1).applyQuaternion(body.getWorldQuaternion(new Quaternion()))
   for(const side of ['Left','Right']){const shoulder=bones.get(side+'Shoulder');retarget.worldRotation(shoulder,new Quaternion().setFromAxisAngle(shoulderAxis,(side==='Left'?-1:1)*config.riding.clavicleRelax).multiply(shoulder.getWorldQuaternion(new Quaternion())))}
   // Fit a comfortable wrist contact against the neutral pose first. That
   // bike-local contact stays put while the chest moves; the elbows articulate.
   this.diagnostics.handGripGap={}
   for(const side of ['Left','Right']){
    const a=point(bones.get(side+'Arm')),b=point(bones.get(side+'ForeArm')),c=point(bones.get(side+'Hand')),l1=a.distanceTo(b),l2=b.distanceTo(c),bend=standard?config.riding.standard.minimumElbowBend:config.riding.minimumElbowBend,reach=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(bend)),desired=hands[side].target,comfortable=desired.clone(),direction=comfortable.clone().sub(a)
    if(direction.length()>reach)comfortable.copy(a).add(direction.setLength(reach))
    this.diagnostics.handGripGap[side]=comfortable.distanceTo(desired);hands[side].target=comfortable
   }
   retarget.worldRotation(spine,turn.clone().multiply(new Quaternion().setFromAxisAngle(axis,speedPose.torsoLean)).multiply(spine.getWorldQuaternion(new Quaternion())))
   const neck=bones.get('Neck'),desiredHead=turn.clone().multiply(new Quaternion().setFromAxisAngle(axis,config.riding.headPitch+speedPose.torsoLean*config.riding.speedMotion.headFollow)).multiply(headQ),headCorrection=desiredHead.clone().multiply(head.getWorldQuaternion(new Quaternion()).invert())
   retarget.worldRotation(neck,new Quaternion().slerp(headCorrection,.45).multiply(neck.getWorldQuaternion(new Quaternion())))
   retarget.worldRotation(head,desiredHead);this.diagnostics.extraTorsoLean=torsoPitch
   this.diagnostics.handCovers=Object.fromEntries(Object.entries(covers).map(([side,c])=>[side,{target:c.position.toArray(),min:c.box.min.toArray(),max:c.box.max.toArray()}]))
   this.diagnostics.contacts={}
   for(const side of ['Left','Right'])for(const leg of [false,true]){
    const name=side+(leg?'Foot':'Hand'),bone=bones.get(name),q=bone.getWorldQuaternion(new Quaternion())
    let target,pole
    if(leg){
     const contact=this.ridingFootTarget(side,runtime,body);target=contact.target;q.copy(contact.orientation)
     pole=point(bones.get(side+'Leg')).add(new Vector3(...config.riding.kneePoleOffset).applyQuaternion(body.getWorldQuaternion(new Quaternion())))
     if(runtime.state.airborne)pole.add(new Vector3((side==='Left'?1:-1)*config.riding.airborne.kneePoleOut,0,config.riding.airborne.kneePoleForward).applyQuaternion(body.getWorldQuaternion(new Quaternion())))
     if(this.instance.mountedMotion?.diagnostics.feet?.[side]?.groundBlend>.01){
      // A shorter native leg plants nearer the bike; retain ground height.
      const a=point(bones.get(side+'UpLeg')),b=point(bones.get(side+'Leg')),c=point(bone),limit=a.distanceTo(b)+b.distanceTo(c)-.008,local=body.worldToLocal(target.clone()),origin=body.worldToLocal(a),dy=local.y-origin.y,available=Math.sqrt(Math.max(0,limit*limit-dy*dy)),horizontal=new Vector3(local.x-origin.x,0,local.z-origin.z)
      if(horizontal.length()>available){horizontal.setLength(available);local.x=origin.x+horizontal.x;local.z=origin.z+horizontal.z;target=body.localToWorld(local)}
     }
    }else{
     target=hands[side].target.clone();q.copy(hands[side].q)
     // Only the arm chain follows the neutral, comfortable wrist contact.
     const intro=config.riding.elbowReference==='intro'
     if(intro)this.introElbows ||=introElbowDirections(this.instance,runtime.scottData)
     const directionPole=intro?this.introElbows[side].clone():new Vector3(...config.riding.elbowPole)
     pole=point(bones.get(side+'Arm')).add(directionPole.applyQuaternion(body.getWorldQuaternion(new Quaternion())))
     const elbowOpening=(intro?0:standard?config.riding.standard.elbowPoleOut:config.riding.elbowPoleOut)+speedPose.elbowOpening
     pole.addScaledVector(new Vector3(1,0,0).applyQuaternion(body.getWorldQuaternion(new Quaternion())),(side==='Left'?1:-1)*elbowOpening)
    }
    this.diagnostics.contacts[name]=retarget.solveLimb(side,leg,target,pole,q)
   }
  }
  this.model.updateWorldMatrix(true,true)
  this.undersuit.update()
 }
 // Equipment crosses anatomical bind frames through rigid transforms only.
 boneDelta(name,offset=[0,0,0]){
  const r=this.retarget,source=r.sourceBones.get(name),target=r.bones.get(name),q=target.getWorldQuaternion(new Quaternion()).multiply(r.targetBind.get(name).rotation.clone().invert()).multiply(r.sourceBind.get(name).rotation)
  const p=point(target).add(new Vector3(...offset).applyQuaternion(target.getWorldQuaternion(new Quaternion())))
  return new Matrix4().compose(p,q.normalize(),new Vector3(1,1,1)).multiply(rigid(source).invert())
 }
 moveEquipment(mesh,name,offset,weight=1,correction){
  mesh.updateWorldMatrix(true,false);const delta=correction||this.boneDelta(name,offset)
  if(weight<1){const p=new Vector3(),q=new Quaternion(),s=new Vector3();delta.decompose(p,q,s);delta.compose(p.multiplyScalar(weight),new Quaternion().slerp(q,weight),new Vector3(1,1,1))}
  const world=delta.multiply(mesh.matrixWorld)
  this.attachments.push({mesh,matrix:mesh.matrix.clone(),auto:mesh.matrixAutoUpdate})
  mesh.matrix.copy(mesh.parent.matrixWorld.clone().invert()).multiply(world);mesh.matrixAutoUpdate=false;mesh.updateWorldMatrix(false,true)
 }
 fitCaballer(binding,weight){
  const {mesh,side,top,bottom}=binding,fit=config.assembly['leg'+side],delta=this.boneDelta(fit.bone,fit.offset)
  mesh.updateWorldMatrix(true,false)
  // Preserve the preceding waist attachment throughout the assembly blend.
  if(weight<1){const p=new Vector3(),q=new Quaternion(),s=new Vector3();delta.decompose(p,q,s);delta.compose(p.multiplyScalar(weight),new Quaternion().slerp(q,weight),new Vector3(1,1,1))}
  const upper=top.clone().applyMatrix4(mesh.matrixWorld),candidate=delta.clone().multiply(mesh.matrixWorld),referenceUpper=top.clone().applyMatrix4(candidate),lower=bottom.clone().applyMatrix4(candidate),goal=kneeSocketPoint(this.skins[0].mesh,this.kneeSockets[side])
  // The waist owns the upper pivot. Resize only the longitudinal dimension
  // toward the native knee socket, preserving the piece's width and thickness.
  // This is a V3-only presentation matrix; source geometry is never rewritten.
  const axis=lower.clone().sub(referenceUpper),length=axis.length(),target=goal.clone().sub(upper),lengthScale=target.length()/length
  axis.normalize()
  const turn=new Quaternion().slerp(new Quaternion().setFromUnitVectors(axis,target.normalize()),weight),k=(lengthScale-1)*weight,u=axis
  const stretch=new Matrix4().set(1+k*u.x*u.x,k*u.x*u.y,k*u.x*u.z,0,k*u.y*u.x,1+k*u.y*u.y,k*u.y*u.z,0,k*u.z*u.x,k*u.z*u.y,1+k*u.z*u.z,0,0,0,0,1)
  const correction=new Matrix4().makeTranslation(...upper.toArray()).multiply(new Matrix4().makeRotationFromQuaternion(turn)).multiply(stretch).multiply(new Matrix4().makeTranslation(...referenceUpper.clone().negate().toArray())).multiply(delta)
  this.moveEquipment(mesh,fit.bone,fit.offset,1,correction)
  mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(false,true)
  const actual=bottom.clone().applyMatrix4(mesh.matrixWorld),actualUpper=top.clone().applyMatrix4(mesh.matrixWorld)
  this.diagnostics.caballers.push({side,piece:mesh.name,waist:upper.toArray(),upperPivot:actualUpper.toArray(),waistError:actualUpper.distanceTo(upper),longitudinalScale:1+k,socket:goal.toArray(),connector:actual.toArray(),error:actual.distanceTo(goal),weight})
 }
 fitArmor(runtime){
  const articulation=this.instance.armorArticulation
  const target=armorAttachmentTarget(runtime.armorController,runtime.transformEntry),weight=target?.active?(target.weight??1):runtime.transformEntry?.returnFlight?1-(articulation?.diagnostics.release??1):0
  if(!articulation?.active||weight<=0)return
  const fits=new Map(articulation.torso.map(mesh=>[mesh,config.assembly.torso]))
  for(const group of articulation.guards){const side=group.bone.name.includes('Left')?'Left':'Right';for(const part of group.parts)fits.set(part.mesh,config.assembly['cuff'+side])}
  for(const group of runtime.suspensionTransformation?.groups||[])for(const part of group.parts)fits.set(part.mesh,config.assembly['cuff'+group.side])
  for(const [mesh,fit]of fits)this.moveEquipment(mesh,fit.bone,fit.offset,weight)
  this.diagnostics.caballers=[]
  for(const binding of articulation.bindings||[])this.fitCaballer(binding,weight)
 }
 fitWeapon(root){
  // present() resets the authored mount every frame, preventing accumulation.
  if(!root.visible)return
  root.updateWorldMatrix(true,true)
  const world=this.boneDelta('RightHand').multiply(root.matrixWorld),local=root.parent.matrixWorld.clone().invert().multiply(world)
  local.decompose(root.position,root.quaternion,new Vector3());root.updateWorldMatrix(false,true)
 }
 dispose(){this.restoreAttachments();this.undersuit.dispose();this.model.removeFromParent();for(const s of this.skins){s.original.dispose();s.clean.dispose()}}
}
