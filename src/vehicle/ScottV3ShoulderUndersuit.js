import {BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,Matrix4,Quaternion,SkinnedMesh,Vector3} from 'three'
import {canonicalScottBone} from './ScottNativeRetarget.js'

// Two independent sleeves in the native mesh's bind coordinates. The source
// skeleton, inverse binds, geometry, weights and materials are only read.
export class ScottV3ShoulderUndersuit{
 constructor(native,settings){
  this.settings=settings;this.meshes=[];this.upper=new Vector3();this.up=new Vector3();this.q=new Quaternion()
  this.material=native.material.clone();this.material.name='Scott_V3_dark_red_shoulder_undersuit'
  delete this.material.userData.scottV3Palette
  // Sample the existing red cloth atlas at its median shoulder pigment:
  // sRGB (127,43,22), with the same native roughness/metalness maps.
  // New cloth gets its own smooth geometric normals, without a fixed tangent
  // normal sampled from a different anatomical part of the original atlas.
  this.material.normalMap=null
  const indices=new Map(native.skeleton.bones.map((b,i)=>[canonicalScottBone(b.name),i]))
  this.spine=native.skeleton.bones[indices.get('Spine2')]
  this.bindSpineRotation=new Quaternion().setFromRotationMatrix(native.skeleton.boneInverses[indices.get('Spine2')].clone().invert()).invert()
  const bindPoint=name=>new Vector3().setFromMatrixPosition(new Matrix4().copy(native.skeleton.boneInverses[indices.get(name)]).invert()).applyMatrix4(native.bindMatrixInverse)
  for(const side of ['Left','Right']){
   const shoulder=indices.get(side+'Shoulder'),arm=indices.get(side+'Arm')
   if(shoulder===undefined||arm===undefined)throw Error('Scott V3 undersuit requires the native shoulder and arm')
   const pivot=bindPoint(side+'Arm'),lateral=pivot.clone().sub(bindPoint(side+'Shoulder')).normalize(),upper=bindPoint(side+'ForeArm').sub(pivot).normalize()
   const start=pivot.clone().addScaledVector(lateral,-settings.inset),end=pivot.clone().addScaledVector(upper,settings.overlap),axis=end.clone().sub(start).normalize()
   const vertical=new Vector3(0,1,0).addScaledVector(axis,-axis.y).normalize(),depth=new Vector3().crossVectors(axis,vertical).normalize()
   const positions=[],raised=[],uv=[],joints=[],weights=[],triangles=[],rings=12,segments=16
   for(let row=0;row<=rings;row++){
    const t=row/rings,blend=Math.max(0,Math.min(1,(t-.12)/.76)),w=blend*blend*(3-2*blend),radius=Math.sin(Math.PI*t)**.65
    for(let col=0;col<=segments;col++){
     const angle=col/segments*Math.PI*2,center=start.clone().lerp(end,t)
     const p=center.clone().addScaledVector(vertical,-settings.drop+Math.cos(angle)*radius*settings.radiusY).addScaledVector(depth,Math.sin(angle)*radius*settings.radiusZ)
     const lifted=center.addScaledVector(vertical,-settings.raisedDrop+Math.cos(angle)*radius*settings.raisedRadiusY).addScaledVector(depth,Math.sin(angle)*radius*settings.raisedRadiusZ)
     positions.push(...p.toArray());raised.push(...lifted.toArray());uv.push(...settings.clothUV);joints.push(shoulder,arm,0,0);weights.push(1-w,w,0,0)
     if(row<rings&&col<segments){const a=row*(segments+1)+col,b=a+segments+1;triangles.push(a,a+1,b,a+1,b+1,b)}
    }
   }
   const geometry=new BufferGeometry()
   geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2))
   geometry.setAttribute('skinIndex',new Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.setIndex(triangles);geometry.computeVertexNormals()
   // A corrective on the NEW fabric only: unfold the soft deltoid when the
   // upper arm rises, and tuck it underneath the pad in the approved ride.
   const raisedGeometry=geometry.clone();raisedGeometry.setAttribute('position',new Float32BufferAttribute(raised,3));raisedGeometry.computeVertexNormals()
   geometry.morphAttributes.position=[raisedGeometry.attributes.position.clone()];geometry.morphAttributes.normal=[raisedGeometry.attributes.normal.clone()];raisedGeometry.dispose()
   const mesh=new SkinnedMesh(geometry,this.material);mesh.name='Scott_V3_'+side+'_shoulder_undersuit'
   mesh.position.copy(native.position);mesh.quaternion.copy(native.quaternion);mesh.scale.copy(native.scale)
   native.parent.add(mesh);mesh.bind(native.skeleton,native.bindMatrix);mesh.bindMode=native.bindMode
   mesh.castShadow=true;mesh.frustumCulled=false;mesh.userData.prewarmVFX=true
   mesh.userData.scottV3Undersuit={side,shoulder,arm,elbow:indices.get(side+'ForeArm'),rings,segments}
   this.meshes.push(mesh)
  }
  this.setEnabled(settings.enabled)
 }
 setEnabled(enabled){for(const mesh of this.meshes)mesh.visible=!!enabled}
 update(){
  this.spine.getWorldQuaternion(this.q).multiply(this.bindSpineRotation);this.up.set(0,1,0).applyQuaternion(this.q)
  for(const mesh of this.meshes){
   const {arm,elbow}=mesh.userData.scottV3Undersuit,bones=mesh.skeleton.bones
   bones[elbow].getWorldPosition(this.upper);bones[arm].getWorldPosition(this.qPoint??=new Vector3());this.upper.sub(this.qPoint).normalize()
   const t=Math.max(0,Math.min(1,(this.upper.dot(this.up)+.1)/.4));mesh.morphTargetInfluences[0]=t*t*(3-2*t)
  }
 }
 dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.geometry.dispose()}this.material.dispose()}
}
