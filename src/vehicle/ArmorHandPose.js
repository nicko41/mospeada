import {Matrix4,Quaternion,Vector3} from 'three'

// Local wrists only. Existing gait/aim owns every other joint; original
// geometry and the available relaxed-hand morphs remain unchanged.
export class ArmorHandPose{
  constructor(instance){
    this.instance=instance;this.records=[];this.applied=false
    const skin=instance.skins[0].mesh
    for(const side of ['Left','Right']){
      const bone=instance.bones.get(`mixamorig${side}Hand`),joint=skin.skeleton.bones.indexOf(bone)
      if(!bone||joint<0)continue
      const bind=new Matrix4().multiplyMatrices(skin.skeleton.boneInverses[joint],skin.bindMatrix)
      const axis=new Vector3(0,0,1).transformDirection(bind)
      this.records.push({bone,side,saved:new Quaternion(),relax:new Quaternion().setFromAxisAngle(axis,(side==='Right'?1:-1)*(.13+Math.PI/8))})
    }
    this.turn=new Quaternion()
  }
  restore(){if(!this.applied)return;for(const r of this.records)r.bone.quaternion.copy(r.saved);this.applied=false}
  apply(aimBlend=0){
    for(const r of this.records){
      const hand=r.bone;r.saved.copy(hand.quaternion)
      this.turn.identity().slerp(r.relax,r.side==='Right'?1-aimBlend:1)
      hand.quaternion.multiply(this.turn)
      hand.updateWorldMatrix(false,true)
    }
    this.applied=true
  }
}
