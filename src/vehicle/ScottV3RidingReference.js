import {Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {canonicalScottBone} from './ScottNativeRetarget.js'

// V1 intro elbow directions only. Never copy its body pose or joint lengths.
export function introElbowDirections(instance,data){
  const posed=clone(instance.sourceScene),pose=data.ridingPose,bones=new Map()
  const authored=new Map(pose.boneNames.map((name,i)=>[canonicalScottBone(name),pose.quaternions[i]]))
  posed.traverse(b=>{if(!b.isBone)return;const name=canonicalScottBone(b.name),q=authored.get(name);bones.set(name,b);if(q)b.quaternion.fromArray(q)})
  posed.updateWorldMatrix(true,true)
  return Object.fromEntries(['Left','Right'].map(side=>{
   const arm=posed.worldToLocal(bones.get(side+'Arm').getWorldPosition(new Vector3())),elbow=posed.worldToLocal(bones.get(side+'ForeArm').getWorldPosition(new Vector3()))
   return[side,elbow.sub(arm).normalize()]
  }))
}
