import {Box3,Vector3,Vector4} from 'three'

// Opaque heroes use the existing Anime mask. Two conservative rectangles cover
// only the exceptions (transparent optics and Scott's unlit/rigid accessories).
// No extra scene pass, target, texture, or per-vertex skinning is needed.
export class BoostProtection{
 constructor(){this.rects=[new Vector4(),new Vector4()];this.box=new Box3();this.point=new Vector3();this.projected=new Vector3();this.scale=new Vector3()}
 update(bindings,camera,width,height){
  for(const rect of this.rects)rect.set(2,2,-1,-1)
  camera.updateMatrixWorld()
  for(const binding of bindings){
   if(!binding.boostGroup)continue
   const object=binding.object,rect=this.rects[binding.boostGroup-1]
   let visible=true;for(let node=object;node;node=node.parent)if(!node.visible){visible=false;break}
   if(!visible)continue
   const box=this.box;box.makeEmpty()
   if(object.isSkinnedMesh){
    for(const bone of object.skeleton.bones)box.expandByPoint(bone.getWorldPosition(this.point))
    box.expandByScalar(.2*object.getWorldScale(this.scale).x)
   }else{
    if(!object.geometry)continue
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox()
    object.updateWorldMatrix(true,false);box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld)
   }
   if(box.isEmpty())continue
   let front=0,behind=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
   for(let corner=0;corner<8;corner++){
    this.point.set(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).applyMatrix4(camera.matrixWorldInverse)
    if(this.point.z>-camera.near){behind++;continue}
    front++;this.projected.copy(this.point).applyMatrix4(camera.projectionMatrix)
    const x=this.projected.x*.5+.5,y=this.projected.y*.5+.5
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)
   }
   if(!front)continue
   // An optic crossing the near plane can fill the viewport in POV.
   if(behind){minX=minY=0;maxX=maxY=1}
   rect.x=Math.min(rect.x,minX-2/width);rect.y=Math.min(rect.y,minY-2/height);rect.z=Math.max(rect.z,maxX+2/width);rect.w=Math.max(rect.w,maxY+2/height)
  }
  return this.rects
 }
}
