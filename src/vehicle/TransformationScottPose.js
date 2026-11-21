import { Quaternion, Vector3 } from 'three'

// Reset every frame: original bone rotations only, no changes to skinning,
// bone positions, lengths or scale. Lower-body release follows the covers.
export class TransformationScottPose {
  constructor(instance,wrapper) {
    this.instance=instance;this.wrapper=wrapper;this.applied=false;this.records=[];this.lower=[];this.limbs=[]
    this.spine=instance.bones.get('mixamorigSpine')
    const source=instance.sourceScene
    source.updateWorldMatrix(true,true)
    source.traverse(node=>{
      if(!node.isBone)return
      let ancestor=node
      while(ancestor&&ancestor.name!=='mixamorigSpine')ancestor=ancestor.parent
      const bone=instance.bones.get(node.name)
      if(bone){
        const record={bone,restQ:node.quaternion.clone(),quaternion:bone.quaternion.clone()}
        ;(ancestor?this.records:this.lower).push(record)
        if(/(Left|Right)(Arm|UpLeg)$/.test(node.name))this.limbs.push({bone,arm:/Arm$/.test(node.name),left:/Left/.test(node.name),rest:source.getWorldQuaternion(new Quaternion()).invert().multiply(node.getWorldQuaternion(new Quaternion()))})
      }
    })
    const sourceSpine=source.getObjectByName('mixamorigSpine')
    this.restInModel=source.getWorldQuaternion(new Quaternion()).invert().multiply(sourceSpine.getWorldQuaternion(new Quaternion()))
    this.modelQ=new Quaternion();this.parentQ=new Quaternion();this.targetQ=new Quaternion()
    this.axis=new Vector3(0,0,1);this.turn=new Quaternion()
    this.backAxis=new Vector3();this.openAxis=new Vector3();this.armParentInverse=new Quaternion()
    this.tuck=[];this.returnTuck=[];this.returnArms=[]
    const squat=instance.sourceClips?.find(c=>c.name.toLowerCase()==='air_squat')
    if(squat)for(const side of ['Left','Right'])for(const suffix of ['UpLeg','Leg','Foot','ToeBase']){
      const name=`mixamorig${side}${suffix}`,track=squat.tracks.find(t=>t.name===name+'.quaternion'),bone=instance.bones.get(name)
      if(!track||!bone)throw Error('Falta articulación original para recoger la pierna: '+name)
      // Keep the original flexion chains. The right uses only 28% of its
      // squat sample, giving a soft bend rather than a second lifted knee.
      this.tuck.push({bone,weight:side==='Left'?1:.28,target:new Quaternion().fromArray(track.createInterpolant().evaluate(side==='Left'?.6:.5)).normalize()})
      this.returnTuck.push({bone,target:new Quaternion().fromArray(track.createInterpolant().evaluate(.6)).normalize()})
    }
    this.elbows=[]
    const run=instance.sourceClips?.find(c=>c.name==='Running')
    if(run)for(const side of ['Left','Right']){
      const name=`mixamorig${side}ForeArm`,track=run.tracks.find(t=>t.name===name+'.quaternion')
      if(track)this.elbows.push({bone:instance.bones.get(name),target:new Quaternion().fromArray(track.createInterpolant().evaluate(run.duration*.25)).normalize()})
      // Opposite stride samples give both elbows the source clip's forward
      // flexion, without importing its running torso or root translation.
      for(const suffix of ['Arm','ForeArm','Hand']){
        const name=`mixamorig${side}${suffix}`,track=run.tracks.find(t=>t.name===name+'.quaternion')
        if(track)this.returnArms.push({bone:instance.bones.get(name),target:new Quaternion().fromArray(track.createInterpolant().evaluate(side==='Left'?run.duration*.5:0)).normalize()})
      }
    }
    const sourceFoot=source.getObjectByName('mixamorigRightFoot')
    this.rightFoot=instance.bones.get('mixamorigRightFoot')
    // Use the original boot's flat bind orientation, not Meshy's downward
    // ankle-to-toe bone vector. Tip the whole boot modestly toward the ground.
    this.footInModel=source.getWorldQuaternion(new Quaternion()).invert().multiply(sourceFoot.getWorldQuaternion(new Quaternion()))
    this.footTurn=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.35)
    const sourceLeftFoot=source.getObjectByName('mixamorigLeftFoot')
    this.ankles=[{left:false,bone:this.rightFoot,reference:this.footInModel},{left:true,bone:instance.bones.get('mixamorigLeftFoot'),reference:source.getWorldQuaternion(new Quaternion()).invert().multiply(sourceLeftFoot.getWorldQuaternion(new Quaternion()))}]
  }
  restore(){
    if(!this.applied)return
    for(const p of [...this.records,...this.lower])p.bone.quaternion.copy(p.quaternion)
    this.applied=false
  }
  apply(alpha,{arms=0,legs=0,legLift=0,leftToeDown=0,rightToeDown=0,returnTuck=0,departureBoost=0}={}) {
    if(alpha<=0)return
    const lift=this.tuck.length?legLift:0
    legs=Math.max(legs,lift)
    for(const p of this.records){
      p.quaternion.copy(p.bone.quaternion)
      p.bone.quaternion.slerp(p.restQ,alpha)
    }
    for(const p of this.lower){p.quaternion.copy(p.bone.quaternion);if(legs>0)p.bone.quaternion.slerp(p.restQ,alpha*legs)}
    // Compensate the seated pelvis only at the waist. The torso follows the
    // original upright frame relative to the bike, including its wheelie.
    this.instance.model.updateWorldMatrix(true,false)
    this.spine.parent.updateWorldMatrix(true,false)
    this.instance.model.getWorldQuaternion(this.modelQ)
    this.spine.parent.getWorldQuaternion(this.parentQ)
    this.targetQ.copy(this.parentQ).invert().multiply(this.modelQ).multiply(this.restInModel)
    const base=this.records.find(p=>p.bone===this.spine)
    this.spine.quaternion.slerpQuaternions(base.quaternion,this.targetQ,alpha)
    for(const limb of this.limbs){
      const amount=limb.arm?arms:legs
      if(!amount)continue
      // The source T-pose defines the anatomical axes; rotate the whole
      // Keep the arms about 20 degrees away from the torso when lowered, rather
      // than pinning straight arms against the sides of the Armor.
      const angle=(limb.left?1:-1)*(limb.arm?-60*arms:8)*Math.PI/180
      limb.bone.parent.updateWorldMatrix(true,false)
      limb.bone.parent.getWorldQuaternion(this.parentQ)
      this.turn.setFromAxisAngle(this.axis,angle)
      this.targetQ.copy(this.parentQ).invert().multiply(this.modelQ).multiply(this.turn).multiply(limb.rest)
      limb.bone.quaternion.slerp(this.targetQ,alpha*(limb.arm?1:legs))
      if(limb.arm&&departureBoost>0){
        // Pose arms before the cuffs are evaluated, so both follow together.
        // A modest shoulder extension opens the gesture behind the torso.
        this.armParentInverse.copy(this.parentQ).invert()
        this.backAxis.set(1,0,0).applyQuaternion(this.modelQ).applyQuaternion(this.armParentInverse)
        this.openAxis.set(0,0,1).applyQuaternion(this.modelQ).applyQuaternion(this.armParentInverse)
        this.turn.setFromAxisAngle(this.backAxis,.28*alpha*departureBoost);limb.bone.quaternion.premultiply(this.turn)
        this.turn.setFromAxisAngle(this.openAxis,(limb.left?1:-1)*.12*alpha*departureBoost);limb.bone.quaternion.premultiply(this.turn)
      }
    }
    if(lift>0)for(const p of this.tuck)p.bone.quaternion.slerp(p.target,alpha*lift*p.weight)
    if(arms>0)for(const p of this.elbows)p.bone.quaternion.slerp(p.target,alpha*arms*.25)
    if(returnTuck>0)for(const p of [...this.returnTuck,...this.returnArms])p.bone.quaternion.slerp(p.target,alpha*returnTuck)
    for(const ankle of this.ankles){
      const amount=ankle.left?leftToeDown:rightToeDown
      if(amount<=0)continue
      ankle.bone.parent.updateWorldMatrix(true,false)
      ankle.bone.parent.getWorldQuaternion(this.parentQ)
      this.targetQ.copy(this.parentQ).invert().multiply(this.modelQ).multiply(this.footTurn).multiply(ankle.reference)
      ankle.bone.quaternion.slerp(this.targetQ,alpha*amount)
    }
    this.wrapper.updateMatrixWorld(true);this.applied=true
  }
}
