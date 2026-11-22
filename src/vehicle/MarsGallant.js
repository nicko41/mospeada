import {Group,Object3D,Matrix4,Quaternion,Vector3} from 'three'

export const MARS_GALLANT_URL='/models/mospeada/mars-gallant.glb'
// Measured in the supplied model's frame: barrel -X, top +Y, width Z.
// The rear grip sits beside the trigger; the original source remains intact.
export const GALLANT_MOUNT=Object.freeze({length:.34,sourceLength:1.9033389687538147,grip:[.67,-.22,0],muzzle:[-.952281,.065,0]})
// Approved Armor placement, baked relative to the hand's original bind frame.
// This is a fixed local attachment: no camera/world-space correction in Armor.
export const ARMOR_GALLANT_BIND_OFFSET=Object.freeze([.6319690793460873,-.05138583426463836,.14447287046273116,.7596723977250034])

export class MarsGallant{
  constructor(source){
    this.root=new Group();this.root.name='Scott_Mars_Gallant';this.root.visible=false
    this.model=source.clone(true);this.root.add(this.model);this.materials=[]
    this.model.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=false;mesh.receiveShadow=true
      const copy=material=>{const m=material.clone();this.materials.push(m);return m}
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material)
    })
    this.muzzle=new Object3D();this.muzzle.name='Gallant_muzzle';this.muzzle.position.fromArray(GALLANT_MOUNT.muzzle);this.root.add(this.muzzle)
    this.forward=new Vector3(-1,0,0);this.up=new Vector3(0,1,0);this.rotation=new Quaternion();this.scale=new Vector3();this.palm=new Vector3();this.point=new Vector3();this.instance=null
    this.direction=new Vector3();this.upAxis=new Vector3();this.backAxis=new Vector3();this.sideAxis=new Vector3();this.basis=new Matrix4();this.handRotation=new Quaternion();this.aimRotation=new Quaternion()
    this.armorRotation=new Quaternion()
  }
  attach(instance){
    if(this.instance===instance)return
    const limb=instance.mountedMotion?.limbs.find(l=>!l.leg&&l.side==='Right'),skin=instance.skins[0]?.mesh,shape=instance.hands[0]?.sides.find(h=>h.sign<0)
    if(!limb||!skin||!shape)return
    const joint=skin.skeleton.bones.indexOf(limb.c),bind=new Matrix4().multiplyMatrices(skin.skeleton.boneInverses[joint],skin.bindMatrix)
    bind.decompose(this.point,this.rotation,this.scale)
    this.forward.set(-1,0,0).applyQuaternion(this.rotation);this.up.set(0,1,0).applyQuaternion(this.rotation)
    this.palm.set(0,0,0);let count=0
    const positions=skin.geometry.attributes.position
    for(const id of instance.hands[0].affected){
      const u=shape.sign*(positions.getX(id)-shape.wrist.x)/shape.length,z=(positions.getZ(id)-shape.wrist.z)/shape.length
      if(u>.48&&u<.65&&z>-.1&&z<.22){skin.getVertexPosition(id,this.point);skin.localToWorld(this.point);limb.c.worldToLocal(this.point);this.palm.add(this.point);count++}
    }
    if(!count)return
    this.palm.divideScalar(count);limb.c.getWorldScale(this.scale)
    this.armorRotation.copy(this.rotation).multiply(new Quaternion().fromArray(ARMOR_GALLANT_BIND_OFFSET))
    const scale=GALLANT_MOUNT.length/GALLANT_MOUNT.sourceLength/this.scale.x
    this.root.scale.setScalar(scale);this.root.quaternion.copy(this.rotation)
    this.root.position.copy(this.palm).sub(this.point.fromArray(GALLANT_MOUNT.grip).applyQuaternion(this.rotation).multiplyScalar(scale))
    limb.c.add(this.root);this.instance=instance;this.hand=limb.c
  }
  update(instance,encounter,state){
    this.present(instance,encounter.active&&state.riderMode==='mounted'&&(instance.shooterPose?.blend||0)>.04,encounter.aimPoint,instance.shooterPose?.blend||0)
  }
  present(instance,visible,aimPoint,blend=1,armor=false){
    this.attach(instance)
    this.root.visible=!!this.instance&&visible
    this.root.quaternion.copy(armor?this.armorRotation:this.rotation)
    if(!armor&&this.instance&&aimPoint&&blend>0){
      this.hand.localToWorld(this.point.copy(this.palm));this.direction.subVectors(aimPoint,this.point).normalize()
      this.backAxis.copy(this.direction).negate();this.upAxis.set(0,1,0).addScaledVector(this.direction,-this.direction.y).normalize();this.sideAxis.crossVectors(this.backAxis,this.upAxis).normalize()
      this.basis.makeBasis(this.backAxis,this.upAxis,this.sideAxis);this.aimRotation.setFromRotationMatrix(this.basis)
      this.hand.getWorldQuaternion(this.handRotation).invert();this.aimRotation.premultiply(this.handRotation)
      this.root.quaternion.slerp(this.aimRotation,blend)
    }
    // Keep this endpoint fixed in the palm: all rotations pivot at the grip,
    // never at the model centre or the wrist/arm.
    if(this.instance)this.root.position.copy(this.palm).sub(this.point.fromArray(GALLANT_MOUNT.grip).applyQuaternion(this.root.quaternion).multiplyScalar(this.root.scale.x))
    this.root.updateWorldMatrix(true,true)
  }
  getMuzzle(target){return this.muzzle.getWorldPosition(target)}
  dispose(){this.root.removeFromParent();this.materials.forEach(m=>m.dispose());this.instance=null}
}
