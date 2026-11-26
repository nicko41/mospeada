import {AnimationMixer,Group,Quaternion,Vector3} from 'three'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {parseCycloneScottActions} from './cycloneScottActions.js'
import {MountedScottMotion} from './mountedScottMotion.js'
import {createRelaxedScottHands} from './relaxedScottHands.js'

export const RAND_RIDER_URL='/delivery/rand-rider.glb'
const byName=scene=>{const result=new Map();scene.traverse(b=>{if(b.isBone)result.set(b.name,b)});return result}
export class RandRider{
  constructor(randSource,scottSource,data,rig){
    this.rig=rig;this.wrapper=new Group();this.wrapper.name='Rand_mounted_rider';this.wrapper.userData.animeHero=true
    const model=clone(randSource),source=clone(scottSource),bones=byName(model),sourceBones=byName(source),skins=[],hands=[]
    this.wrapper.add(model);rig.body.add(this.wrapper)
    model.traverse(o=>{if(o.isSkinnedMesh){o.material=o.material.clone();o.castShadow=false;o.frustumCulled=false;skins.push({mesh:o,original:o.material});const hand=createRelaxedScottHands(o);if(hand)hands.push(hand)}})
    this.instance={model,bones,skins,hands,sourceScene:randSource}
    source.updateMatrixWorld(true);this.wrapper.updateMatrixWorld(true)
    const sourceRest=new Map([...sourceBones].map(([n,b])=>[n,b.getWorldQuaternion(new Quaternion()).invert()])),targetRest=new Map([...bones].map(([n,b])=>[n,b.getWorldQuaternion(new Quaternion())]))
    this.clip=parseCycloneScottActions(data).find(c=>c.name==='Cyclone_RidingPose');const mixer=new AnimationMixer(source),action=mixer.clipAction(this.clip).play();action.paused=true;action.time=0;mixer.update(0);source.updateMatrixWorld(true)
    // Transfer the animated world-space rotation delta, retaining Rand's own
    // lengths, joint offsets, scales and skin weights. No skeleton.pose(): the
    // authored GLBs have a centimetre Armature parent and metre bind matrices.
    for(const [name,b]of bones){const from=sourceBones.get(name);if(!from)continue;const q=from.getWorldQuaternion(new Quaternion()).multiply(sourceRest.get(name)).multiply(targetRest.get(name));b.quaternion.copy(b.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));b.updateWorldMatrix(false,true)}
    this.wrapper.scale.setScalar(data.actorScale);this.wrapper.updateMatrixWorld(true)
    const hip=bones.get('mixamorigHips'),position=rig.body.worldToLocal(hip.getWorldPosition(new Vector3())),seat=new Vector3().fromArray(data.measuredTargets.seat.pelvis)
    this.wrapper.position.copy(seat.sub(position));this.wrapper.updateMatrixWorld(true);hands.forEach(h=>h.update('mounted',0))
    this.motion=new MountedScottMotion(this.instance,this.wrapper,rig,data.measuredTargets.grips)
    this.head=bones.get('mixamorigHead');this.lookPosition=new Vector3()
    this.base=[...bones.values()].map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));mixer.stopAllAction();mixer.uncacheRoot(source)
  }
  update(state,dt,config,sample){
    this.motion.restore();for(const {b,p,q,s}of this.base){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s)}
    this.wrapper.updateMatrixWorld(true);this.instance.hands.forEach(h=>h.update('mounted',dt));this.motion.apply(state,sample,config,dt)
    if(this.head&&state.randLook>0&&state.randLookAt){
      this.head.getWorldPosition(this.lookPosition)
      const yaw=Math.atan2(state.randLookAt.x-this.lookPosition.x,state.randLookAt.z-this.lookPosition.z)-state.yaw
      this.head.rotateY(Math.max(-1.05,Math.min(1.05,Math.atan2(Math.sin(yaw),Math.cos(yaw))))*state.randLook)
    }
    for(const {mesh}of this.instance.skins)mesh.skeleton.update()
  }
  dispose(){this.instance.hands.forEach(h=>h.dispose());this.instance.skins.forEach(s=>s.original.dispose());this.wrapper.removeFromParent()}
}
